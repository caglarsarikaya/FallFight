import { ARENA, KILL_CREDIT_WINDOW, NET, PLAYER } from '../constants.js';
import { C2S, S2C } from '../protocol.js';
import { normalize, rayBox } from '../math.js';
import { Arena } from '../world/Arena.js';
import { getItem } from '../items/ItemRegistry.js';
import { CHARACTERS, DEFAULT_CHARACTER, isValidCharacter, sanitizeName } from '../characters/definitions.js';
import { stepMovement } from '../physics.js';
import { BotBrain } from '../ai/BotBrain.js';
import { PlayerState } from './PlayerState.js';
import { Projectile } from './Projectile.js';
import { PickupSpawner } from './PickupSpawner.js';

const BOT_NAMES = ['Steve', 'Alex', 'Notch', 'Herobrine', 'Creeper', 'Blaze', 'Ender', 'Wither'];

// Authoritative arena simulation. Transport-agnostic: messages come in through handleMessage()
// and go out through emit(targetId | null, type, data), where null means everyone in the room.
// Runs on the Node server for online play and inside the browser for offline play.
export class GameRoom {
    constructor({ emit = () => {}, rng = Math.random } = {}) {
        this.emit = emit;
        this.rng = rng;
        this.time = 0;
        this.arena = new Arena();
        this.players = new Map();
        this.bots = new Map();          // id -> BotBrain
        this.projectiles = new Map();
        this.pickups = new PickupSpawner(rng);
        this.nextProjectileId = 1;
        this.nextBotId = 1;
        this.snapshotTimer = 0;
    }

    get humanCount() {
        return [...this.players.values()].filter(p => !p.isBot).length;
    }

    // ---- membership -------------------------------------------------------------------

    addPlayer({ id, name, characterId, isBot = false }) {
        const player = new PlayerState({
            id,
            name: sanitizeName(name),
            characterId: isValidCharacter(characterId) ? characterId : DEFAULT_CHARACTER,
            isBot
        });
        this.placeAtSpawn(player);
        this.players.set(id, player);

        if (!isBot) {
            this.emit(id, S2C.WELCOME, {
                selfId: id,
                time: this.time,
                players: [...this.players.values()].map(p => p.toJSON()),
                arena: this.arena.toJSON(),
                pickups: this.pickups.toJSON(),
                projectiles: [...this.projectiles.values()].map(p => p.toJSON())
            });
            this.notifyInventory(player);
        }
        this.emit(null, S2C.PLAYER_JOINED, player.toJSON());
        return player;
    }

    removePlayer(id) {
        if (!this.players.delete(id)) return;
        this.bots.delete(id);
        this.emit(null, S2C.PLAYER_LEFT, { id });
    }

    addBot() {
        const id = `bot-${this.nextBotId++}`;
        const taken = new Set([...this.players.values()].map(p => p.name));
        const name = BOT_NAMES.find(n => !taken.has(n)) || `Bot ${this.nextBotId}`;
        const characterId = CHARACTERS[Math.floor(this.rng() * CHARACTERS.length)].id;
        const player = this.addPlayer({ id, name, characterId, isBot: true });
        this.bots.set(id, new BotBrain(this, player, this.rng));
        return player;
    }

    setBotCount(count) {
        while (this.bots.size < count) this.addBot();
        while (this.bots.size > count) this.removePlayer([...this.bots.keys()].pop());
    }

    // ---- client messages --------------------------------------------------------------

    handleMessage(id, type, data = {}) {
        const player = this.players.get(id);
        if (!player || !data || typeof data !== 'object') return;
        switch (type) {
            case C2S.STATE: return this.onState(player, data);
            case C2S.SELECT: return this.select(player, data.slot);
            case C2S.DRAW: return this.setDrawing(player, !!data.drawing);
            case C2S.USE: return this.useItem(player, data.slot, data.dir, data.charge);
            case C2S.PROFILE: return this.onProfile(player, data);
        }
    }

    onState(player, data) {
        if (!player.alive) return;
        const fields = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch'];
        if (!fields.every(f => Number.isFinite(data[f]))) return;
        const limit = this.arena.size;
        player.x = clampAbs(data.x, limit);
        player.y = Math.max(data.y, ARENA.voidY - 5);
        player.z = clampAbs(data.z, limit);
        player.vx = data.vx;
        player.vy = data.vy;
        player.vz = data.vz;
        player.yaw = data.yaw;
        player.pitch = data.pitch;
        player.onGround = !!data.onGround;
        this.afterMove(player);
    }

    onProfile(player, data) {
        player.name = sanitizeName(data.name);
        if (isValidCharacter(data.characterId)) player.characterId = data.characterId;
        this.emit(null, S2C.PLAYER_UPDATED, { id: player.id, name: player.name, characterId: player.characterId });
    }

    // ---- actions (used by clients and bots) ---------------------------------------------

    select(player, slot) {
        if (player.inventory.select(slot)) {
            player.drawing = false;
            this.notifyInventory(player);
        }
    }

    setDrawing(player, drawing) {
        const item = player.inventory.selectedItem;
        player.drawing = drawing && player.alive && !!item?.chargeable;
    }

    useItem(player, slot, dir, charge = 0) {
        if (!player.alive) return false;
        if (Number.isInteger(slot) && slot !== player.inventory.selected) this.select(player, slot);
        const item = player.inventory.selectedItem;
        if (!item || !dir || ![dir.x, dir.y, dir.z].every(Number.isFinite)) return false;

        const used = item.tryUse({
            room: this,
            player,
            origin: player.eye,
            dir: normalize(dir),
            charge: Number(charge) || 0,
            now: this.time
        });
        player.drawing = false;
        if (used) {
            player.protectedUntil = 0; // attacking ends spawn protection
            this.emit(null, S2C.ACTION, { id: player.id, action: item.action, item: item.id });
        }
        return used;
    }

    // ---- services used by items --------------------------------------------------------

    findPlayerHit(origin, dir, maxDist, excludeId) {
        let best = null;
        for (const player of this.players.values()) {
            if (!player.alive || player.id === excludeId) continue;
            const { min, max } = player.bounds;
            const t = rayBox(origin, dir, min, max, maxDist);
            if (t !== null && (!best || t < best.distance)) best = { player, distance: t };
        }
        // Blocks in the way stop the hit
        if (best) {
            const block = this.arena.raycast(origin, dir, best.distance);
            if (block) return null;
        }
        return best;
    }

    // info: { zone, headshot } for projectile hits
    damage(victim, amount, attacker, weapon, knockback, info = {}) {
        if (!victim.alive || victim.isProtected(this.time)) return false;
        victim.health = Math.max(0, victim.health - amount);
        victim.lastDamage = { by: attacker?.id ?? null, weapon, time: this.time };

        let kb = null;
        if (knockback) {
            const len = Math.hypot(knockback.x, knockback.z) || 1;
            kb = {
                x: (knockback.x / len) * knockback.strength,
                y: 4,
                z: (knockback.z / len) * knockback.strength
            };
            if (victim.isBot) {
                victim.vx += kb.x;
                victim.vz += kb.z;
                victim.vy = kb.y;
                victim.onGround = false;
            }
        }
        this.emit(null, S2C.DAMAGE, {
            victimId: victim.id,
            attackerId: attacker?.id ?? null,
            amount,
            health: victim.health,
            weapon,
            zone: info.zone ?? null,
            headshot: !!info.headshot,
            knockback: kb
        });
        if (victim.health <= 0) this.kill(victim, attacker, info.headshot ? 'headshot' : weapon);
        return true;
    }

    heal(player, amount) {
        player.health = Math.min(PLAYER.maxHealth, player.health + amount);
        this.emit(null, S2C.HEAL, { id: player.id, amount, health: player.health });
    }

    breakBlock(ix, iy, iz, player) {
        if (this.arena.startBreak(ix, iy, iz, player.id, this.time)) {
            this.emit(null, S2C.BLOCK_CRACKING, { ix, iy, iz, by: player.id });
        }
    }

    spawnProjectile(owner, item, origin, velocity, extra = {}) {
        const speed = Math.hypot(velocity.x, velocity.y, velocity.z) || 1;
        const projectile = new Projectile({
            id: this.nextProjectileId++,
            ownerId: owner.id,
            itemId: item.id,
            // Start slightly in front of the eye so it doesn't clip the shooter
            x: origin.x + (velocity.x / speed) * 0.4,
            y: origin.y + (velocity.y / speed) * 0.4,
            z: origin.z + (velocity.z / speed) * 0.4,
            vx: velocity.x,
            vy: velocity.y,
            vz: velocity.z,
            born: this.time,
            ...extra
        });
        this.projectiles.set(projectile.id, projectile);
        this.emit(null, S2C.PROJECTILE, projectile.toJSON());
    }

    notifyInventory(player) {
        if (!player.isBot) this.emit(player.id, S2C.INVENTORY, player.inventory.toJSON());
    }

    // ---- life and death ---------------------------------------------------------------

    afterMove(player) {
        if (player.onGround) {
            const block = this.arena.supportBlock(player.x, player.y, player.z, PLAYER.radius);
            if (block) player.lastGroundBlock = block;
        }
        if (player.alive && player.y < ARENA.voidY) this.fall(player);
    }

    fall(victim) {
        const recent = victim.lastDamage && this.time - victim.lastDamage.time <= KILL_CREDIT_WINDOW
            ? victim.lastDamage.by : null;
        const breaker = this.arena.breakerOf(victim.lastGroundBlock, this.time, KILL_CREDIT_WINDOW);
        const creditId = recent || (breaker !== victim.id ? breaker : null);
        this.kill(victim, this.players.get(creditId) || null, 'fall');
    }

    kill(victim, killer, cause) {
        if (!victim.alive) return;
        victim.alive = false;
        victim.health = 0;
        victim.drawing = false;
        victim.deaths++;
        victim.respawnAt = this.time + PLAYER.respawnDelay;

        const credited = killer && killer.id !== victim.id ? killer : null;
        if (credited) {
            credited.kills++;
            credited.inventory.add('health_potion', 1); // kill reward
            this.notifyInventory(credited);
        }
        this.emit(null, S2C.DEATH, { victimId: victim.id, killerId: credited?.id ?? null, cause });
    }

    placeAtSpawn(player) {
        const others = [...this.players.values()].filter(p => p.alive && p !== player);
        const spot = this.arena.findSpawn(this.rng, others);
        const center = spot ? this.arena.tileCenter(spot.ix, spot.iz) : { x: 0, z: 0 };
        Object.assign(player, { x: center.x, y: spot ? spot.y : 0, z: center.z, vx: 0, vy: 0, vz: 0, onGround: true });
        // Face the middle of the arena
        player.yaw = Math.atan2(player.x, player.z);
        player.pitch = 0;
        player.lastGroundBlock = spot ? { ix: spot.ix, iy: spot.y, iz: spot.iz } : null;
        player.protectedUntil = this.time + PLAYER.spawnProtection;
    }

    respawn(player) {
        this.placeAtSpawn(player);
        player.alive = true;
        player.health = PLAYER.maxHealth;
        player.inventory.reset();
        player.cooldowns = {};
        player.lastDamage = null;
        this.emit(null, S2C.RESPAWN, { id: player.id, x: player.x, y: player.y, z: player.z, yaw: player.yaw, health: player.health });
        this.notifyInventory(player);
    }

    // Is any living player's body inside this block (so it must not regrow yet)
    isBlockOccupied(ix, iy, iz) {
        const c = this.arena.blockCenter(ix, iy, iz);
        const r = PLAYER.radius;
        for (const p of this.players.values()) {
            if (!p.alive) continue;
            if (p.x + r > c.x - 0.5 && p.x - r < c.x + 0.5 &&
                p.z + r > c.z - 0.5 && p.z - r < c.z + 0.5 &&
                p.y + PLAYER.height > c.y - 0.5 && p.y < c.y + 0.5) return true;
        }
        return false;
    }

    // ---- simulation -------------------------------------------------------------------

    tick(dt) {
        this.time += dt;

        for (const event of this.arena.update(this.time, (ix, iy, iz) => this.isBlockOccupied(ix, iy, iz))) {
            this.emit(null, event.type === 'broken' ? S2C.BLOCK_BROKEN : S2C.BLOCK_RESTORED, { ix: event.ix, iy: event.iy, iz: event.iz });
        }
        for (const pickup of this.pickups.removeUnsupported(this.arena)) {
            this.emit(null, S2C.PICKUP_TAKEN, { id: pickup.id, by: null });
        }

        for (const [id, brain] of this.bots) {
            const bot = this.players.get(id);
            const input = brain.update(dt);
            if (!bot.alive) continue;
            stepMovement(bot, input, this.arena, dt);
            this.afterMove(bot);
        }

        for (const projectile of this.projectiles.values()) {
            const hit = projectile.step(dt, this, this.time);
            if (!hit) continue;
            this.projectiles.delete(projectile.id);
            if (hit.type === 'player') {
                const weapon = getItem(projectile.itemId);
                const owner = this.players.get(projectile.ownerId) || null;
                const { amount, headshot } = weapon.damageFor({ zone: hit.zone, power: projectile.power });
                this.damage(hit.player, amount, owner, weapon.id,
                    { x: projectile.vx, z: projectile.vz, strength: weapon.knockback * (0.5 + projectile.power / 2) },
                    { zone: hit.zone, headshot });
            }
            this.emit(null, S2C.PROJECTILE_END, {
                id: projectile.id,
                x: projectile.x, y: projectile.y, z: projectile.z,
                hitId: hit.type === 'player' ? hit.player.id : null,
                zone: hit.zone ?? null,
                stuck: hit.type === 'block'
            });
        }

        for (const pickup of this.pickups.update(dt, this.arena, this.time)) {
            this.emit(null, S2C.PICKUP_SPAWNED, pickup);
        }
        for (const { pickup, player } of this.pickups.collect(this.players.values())) {
            player.inventory.add(pickup.type, pickup.amount);
            this.notifyInventory(player);
            this.emit(null, S2C.PICKUP_TAKEN, { id: pickup.id, by: player.id, type: pickup.type, amount: pickup.amount });
        }

        for (const player of this.players.values()) {
            if (!player.alive && this.time >= player.respawnAt) this.respawn(player);
        }

        this.snapshotTimer -= dt;
        if (this.snapshotTimer <= 0) {
            this.snapshotTimer += 1 / NET.snapshotRate;
            this.emit(null, S2C.SNAPSHOT, {
                time: this.time,
                players: [...this.players.values()].map(p => p.toSnapshot())
            });
        }
    }
}

const clampAbs = (v, limit) => Math.max(-limit, Math.min(limit, v));
