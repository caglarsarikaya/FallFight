import { ARENA, ARMOR, GUN, KILL_CREDIT_WINDOW, MATCH, NET, PLAYER } from '../constants.js';
import { C2S, S2C } from '../protocol.js';
import { normalize } from '../math.js';
import { Arena } from '../world/Arena.js';
import { DEFAULT_MAP, getMap } from '../world/maps/index.js';
import { DEFAULT_MODE, getModeInfo } from '../config/modes.js';
import { createMode } from './modes/index.js';
import { getItem } from '../items/ItemRegistry.js';
import { weaponSpec } from '../config/weapons.js';
import { CHARACTERS, DEFAULT_CHARACTER, isValidCharacter, sanitizeName } from '../characters/definitions.js';
import { stepMovement } from '../physics.js';
import { BotBrain } from '../ai/BotBrain.js';
import { PlayerState, freshGunState } from './PlayerState.js';
import { Projectile } from './Projectile.js';
import { PickupSpawner } from './PickupSpawner.js';
import { LagComp } from './LagComp.js';
import { hitTest } from './Hitbox.js';

const BOT_NAMES = ['Steve', 'Alex', 'Notch', 'Herobrine', 'Creeper', 'Blaze', 'Ender', 'Wither'];
const ZONE_RANK = { legs: 0, body: 1, head: 2 };
const round2 = v => Math.round(v * 100) / 100;
const round4 = v => Math.round(v * 10000) / 10000;
const MODE_STATE_INTERVAL = 1;   // seconds between MODE_STATE refreshes (timers) when nothing changed

// The map a room uses: the requested one, or the mode's first choice that exists
export function resolveMap(modeId, mapId) {
    if (getMap(mapId)) return getMap(mapId);
    const preferred = getModeInfo(modeId)?.maps.find(id => getMap(id));
    return getMap(preferred) || getMap(DEFAULT_MAP);
}

// Authoritative arena simulation. Transport-agnostic: messages come in through handleMessage()
// and go out through emit(targetId | null, type, data), where null means everyone in the room.
// Runs on the Node server for online play and inside the browser for offline play.
export class GameRoom {
    // mode: 'ffa' | 'gungame' | 'teambuy' | 'zombies'; map: a map id (see shared/world/maps/)
    constructor({ emit = () => {}, rng = Math.random, mode = DEFAULT_MODE, map = null } = {}) {
        this.emit = emit;
        this.rng = rng;
        this.time = 0;
        this.map = resolveMap(mode, map);
        this.arena = new Arena(this.map);
        this.players = new Map();
        this.bots = new Map();          // id -> BotBrain
        this.projectiles = new Map();
        this.mode = createMode(mode, this);
        this.pickups = new PickupSpawner(rng, this.mode.pickupTypes);
        this.lagComp = new LagComp();
        this.nextProjectileId = 1;
        this.nextBotId = 1;
        this.snapshotTimer = 0;
        this.modeStateTimer = 0;
        this.humans = 0;
        this.matchOver = null;          // { restartAt, ... } between a win and the next match
        this.mode.reset();
    }

    get humanCount() {
        return this.humans;
    }

    // ---- membership -------------------------------------------------------------------

    // roomInfo: public description of the room (name, bots, size) sent in the welcome
    addPlayer({ id, name, characterId, isBot = false, roomInfo = null }) {
        const player = new PlayerState({
            id,
            name: sanitizeName(name),
            characterId: isValidCharacter(characterId) ? characterId : DEFAULT_CHARACTER,
            isBot
        });
        this.players.set(id, player);
        if (!isBot) this.humans++;
        this.mode.resetPlayer(player);
        this.mode.onJoin(player);
        // The mode may keep a newcomer out until the next round (alive = false)
        if (player.alive) {
            this.equip(player);
            this.placeAtSpawn(player);
        } else {
            this.placeAtSpawn(player);
        }

        if (!isBot) {
            this.emit(id, S2C.WELCOME, {
                selfId: id,
                room: roomInfo,
                mode: this.mode.id,
                map: this.map.id,
                modeState: this.mode.stateJSON(),
                time: this.time,
                players: [...this.players.values()].map(p => this.playerJSON(p, true)),
                arena: this.arena.toJSON(),
                pickups: this.pickups.toJSON(),
                projectiles: [...this.projectiles.values()].map(p => p.toJSON())
            });
            this.notifyInventory(player);
        }
        this.emit(null, S2C.PLAYER_JOINED, this.playerJSON(player, true));
        return player;
    }

    // Snapshot (or full description) of a player, with the mode's extra fields
    playerJSON(player, full = false) {
        const base = full ? player.toJSON() : player.toSnapshot();
        const extra = this.mode.playerJSON(player);
        return extra ? Object.assign(base, extra) : base;
    }

    removePlayer(id) {
        const player = this.players.get(id);
        if (!player) return;
        this.players.delete(id);
        if (!player.isBot) this.humans--;
        this.bots.delete(id);
        this.lagComp.forget(id);
        this.mode.onLeave(player);
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

    // Spawn loadout comes from the mode
    equip(player) {
        this.mode.equip(player);
        player.gun = freshGunState();
    }

    // ---- client messages --------------------------------------------------------------

    handleMessage(id, type, data = {}) {
        const player = this.players.get(id);
        if (!player || !data || typeof data !== 'object') return;
        switch (type) {
            case C2S.STATE: return this.onState(player, data);
            case C2S.SELECT: return this.select(player, data.slot);
            case C2S.USE: return this.useItem(player, data.slot, data.dir);
            case C2S.FIRE: return this.fire(player, data);
            case C2S.RELOAD: return this.reload(player);
            case C2S.SCOPE: return this.setScope(player, data.level);
            case C2S.BUY: return this.buy(player, data.item);
            case C2S.PROFILE: return this.onProfile(player, data);
        }
    }

    onState(player, data) {
        if (!player.alive) return;
        const fields = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch'];
        if (!fields.every(f => Number.isFinite(data[f]))) return;
        if (this.mode.frozen(player)) {
            // Freeze time: you may look around and crouch, not walk off
            player.yaw = data.yaw;
            player.pitch = data.pitch;
            player.crouching = !!data.crouching;
            return;
        }
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
        player.crouching = !!data.crouching;
        player.walking = !!data.walking;
        this.afterMove(player);
    }

    onProfile(player, data) {
        player.name = sanitizeName(data.name);
        if (isValidCharacter(data.characterId)) player.characterId = data.characterId;
        this.emit(null, S2C.PLAYER_UPDATED, { id: player.id, name: player.name, characterId: player.characterId });
    }

    // ---- actions (used by clients and bots) ---------------------------------------------

    select(player, slot) {
        if (slot === player.inventory.selected || !player.inventory.select(slot)) return false;
        const spec = weaponSpec(player.inventory.selectedId);
        player.gun.reload = null;
        player.gun.scoped = 0;
        player.gun.readyAt = this.time + (spec?.deploy ?? 0.3);
        this.notifyInventory(player);
        return true;
    }

    // Consumables (health potion)
    useItem(player, slot, dir) {
        if (!player.alive || !this.mode.canFire(player)) return false;
        if (Number.isInteger(slot) && slot !== player.inventory.selected) this.select(player, slot);
        const item = player.inventory.selectedItem;
        if (!item || item.isGun || item.isKnife || !dir || ![dir.x, dir.y, dir.z].every(Number.isFinite)) return false;

        const used = item.tryUse({ room: this, player, origin: player.eye, dir: normalize(dir), now: this.time });
        if (used) this.emit(null, S2C.ACTION, { id: player.id, action: item.action, item: item.id });
        return used;
    }

    // Gun shot or knife attack. data: { slot, seq, dir, t, alt }
    fire(player, { slot, seq = 0, dir, t, alt = false } = {}) {
        if (!player.alive || !dir || ![dir.x, dir.y, dir.z].every(Number.isFinite)) return false;
        if (!this.mode.canFire(player)) return false;
        if (Number.isInteger(slot) && slot !== player.inventory.selected) this.select(player, slot);
        const item = player.inventory.selectedItem;
        if (!item) return false;
        // Rewind to what the shooter saw, but never further than the lag compensation window
        const rewind = Number.isFinite(t) ? Math.min(this.time, Math.max(this.time - GUN.lagCompensation, t)) : this.time;
        const ctx = { room: this, player, origin: player.eye, dir: normalize(dir), seq: seq | 0, rewind, alt: !!alt, now: this.time };

        let fired = false;
        if (item.isGun) {
            fired = item.fire(ctx);
        } else if (item.isKnife) {
            fired = item.attack(ctx);
            if (fired) this.emit(null, S2C.ACTION, { id: player.id, action: alt ? 'stab' : 'swing', item: item.id });
        }
        if (fired) player.protectedUntil = 0; // attacking ends spawn protection
        return fired;
    }

    // Team Buy: spend money (the mode checks time, place and price)
    buy(player, item) {
        if (!this.mode.buy || typeof item !== 'string') return { ok: false, error: 'unknown' };
        const result = this.mode.buy(player, item);
        if (!player.isBot) this.emit(player.id, S2C.BUY_RESULT, { item, ...result });
        return result;
    }

    reload(player) {
        const id = player.inventory.selectedId;
        const spec = weaponSpec(id);
        const ammo = player.inventory.ammo[id];
        const g = player.gun;
        if (!player.alive || !ammo || g.reload || ammo.mag >= spec.mag || ammo.reserve <= 0) return false;
        // Shotguns load shell by shell after a short start
        const first = spec.reloadStyle === 'shell' ? spec.reloadTime + 0.35 : spec.reloadTime;
        g.reload = { id, at: this.time + first };
        g.scoped = 0;
        this.emit(null, S2C.ACTION, { id: player.id, action: 'reload', item: id });
        return true;
    }

    setScope(player, level) {
        const spec = weaponSpec(player.inventory.selectedId);
        if (!spec?.scope || !Number.isInteger(level)) return;
        player.gun.scoped = Math.max(0, Math.min(spec.scope.zooms.length, level));
    }

    updateReloads() {
        for (const player of this.players.values()) {
            const r = player.gun.reload;
            if (!r || this.time < r.at) continue;
            const spec = weaponSpec(r.id);
            const ammo = player.inventory.ammo[r.id];
            if (!ammo || player.inventory.selectedId !== r.id) {
                player.gun.reload = null;
                continue;
            }
            if (spec.reloadStyle === 'shell') {
                ammo.mag++;
                ammo.reserve--;
                if (ammo.mag < spec.mag && ammo.reserve > 0) r.at += spec.reloadTime;
                else player.gun.reload = null;
            } else {
                const take = Math.min(spec.mag - ammo.mag, ammo.reserve);
                ammo.mag += take;
                ammo.reserve -= take;
                player.gun.reload = null;
            }
            this.notifyInventory(player);
        }
    }

    // ---- shooting ------------------------------------------------------------------------

    // Everyone the shot could hit, where they were at the rewound time
    shotTargets(shooter, time) {
        const targets = [];
        for (const p of this.players.values()) {
            if (!p.alive || p === shooter) continue;
            const pose = this.lagComp.poseAt(p, time);
            targets.push({ player: p, x: pose.x, y: pose.y, z: pose.z, crouching: pose.crouching });
        }
        return targets;
    }

    // Trace every pellet, apply the damage (one DAMAGE per victim), and tell everyone about the
    // shot so they see the tracer and hear it.
    resolveShot(shooter, gun, origin, dirs, time) {
        const spec = gun.spec;
        const targets = this.shotTargets(shooter, time);
        const hits = new Map(); // victim -> { health, zone, armorHit }
        const pellets = [];
        for (const dir of dirs) {
            const end = this.traceBullet(shooter, origin, dir, spec, targets, hits);
            pellets.push(round4(dir.x), round4(dir.y), round4(dir.z), round2(end.distance), end.kind);
        }
        this.emit(null, S2C.SHOT, {
            id: shooter.id, w: gun.id,
            o: [round2(origin.x), round2(origin.y), round2(origin.z)],
            p: pellets
        });
        for (const [victim, hit] of hits) {
            if (hit.health <= 0 && !hit.armorHit) continue; // protected or a teammate
            const amount = Math.max(1, Math.round(hit.health));
            this.damage(victim, amount, shooter, gun.id,
                spec.knockback ? { x: dirs[0].x, z: dirs[0].z, strength: spec.knockback } : null,
                { zone: hit.zone, headshot: hit.zone === 'head', armorHit: hit.armorHit, dir: dirs[0], armorDone: true });
        }
    }

    // One bullet: stops at the first player, punches through up to spec.penetration blocks.
    // Returns { distance, kind } with kind 0 = nothing, 1 = block, 2 = player.
    traceBullet(shooter, origin, dir, spec, targets, hits) {
        let damage = spec.damage;
        let penetration = spec.penetration;
        let travelled = 0;
        let remaining = GUN.maxRange;
        const o = { x: origin.x, y: origin.y, z: origin.z };
        for (;;) {
            const block = this.arena.raycast(o, dir, remaining);
            const reach = block ? block.distance : remaining;

            let best = null;
            for (const target of targets) {
                if (!target.player.alive) continue;
                const hit = hitTest(o, dir, reach, target);
                if (hit && (!best || hit.distance < best.distance)) best = { target, distance: hit.distance, zone: hit.zone };
            }
            if (best) {
                const distance = travelled + best.distance;
                const raw = damage * Math.pow(spec.rangeModifier, distance / GUN.falloffUnit) * GUN.zoneMultiplier[best.zone];
                this.addBulletHit(hits, best.target.player, raw, best.zone, spec, shooter);
                return { distance, kind: 2 };
            }
            if (!block) return { distance: travelled + remaining, kind: 0 };

            // Bullets chip blocks; enough of them cracks it
            if (this.arena.damageBlock(block.ix, block.iy, block.iz, damage * GUN.blockDamage)) {
                this.breakBlock(block.ix, block.iy, block.iz, shooter);
            }
            if (penetration <= 0) return { distance: travelled + block.distance, kind: 1 };
            const exit = this.arena.cellExit(block.ix, block.iy, block.iz, o, dir) + 0.01;
            penetration--;
            damage *= GUN.penetrationLoss;
            o.x += dir.x * exit;
            o.y += dir.y * exit;
            o.z += dir.z * exit;
            travelled += exit;
            remaining -= exit;
            if (remaining <= 0) return { distance: travelled, kind: 1 };
        }
    }

    // Armor works per pellet, like CS: kevlar covers body and head (head only with a helmet)
    addBulletHit(hits, victim, raw, zone, spec, shooter) {
        let entry = hits.get(victim);
        if (!entry) {
            entry = { health: 0, zone, armorHit: false };
            hits.set(victim, entry);
        }
        if (ZONE_RANK[zone] > ZONE_RANK[entry.zone]) entry.zone = zone;
        if (victim.isProtected(this.time) || !this.mode.canDamage(shooter, victim)) return;
        const covered = victim.armor > 0 && zone !== 'legs' && (zone !== 'head' || victim.helmet);
        if (!covered) {
            entry.health += raw;
            return;
        }
        let health = raw * spec.armorPen;
        const armorLoss = (raw - health) * ARMOR.absorb;
        if (armorLoss > victim.armor) {
            health = raw - victim.armor / ARMOR.absorb;
            victim.armor = 0;
        } else {
            victim.armor = Math.max(0, Math.floor(victim.armor - armorLoss));
        }
        entry.health += health;
        entry.armorHit = true;
    }

    // ---- services used by items --------------------------------------------------------

    // Nearest player along the aim ray (hitboxes, lag compensated): { player, distance, zone } or null
    findPlayerHit(origin, dir, maxDist, excludeId, time = this.time) {
        let best = null;
        for (const player of this.players.values()) {
            if (!player.alive || player.id === excludeId) continue;
            const hit = hitTest(origin, dir, maxDist, this.lagComp.poseAt(player, time));
            if (hit && (!best || hit.distance < best.distance)) best = { player, distance: hit.distance, zone: hit.zone };
        }
        // Blocks in the way stop the hit
        if (best && this.arena.raycast(origin, dir, best.distance)) return null;
        return best;
    }

    // info: { zone, headshot, armorHit, dir, ignoreArmor, armorDone }
    damage(victim, amount, attacker, weapon, knockback, info = {}) {
        if (!victim.alive || victim.isProtected(this.time) || this.matchOver) return false;
        if (attacker && !this.mode.canDamage(attacker, victim)) return false;
        victim.health = Math.max(0, victim.health - amount);
        victim.lastDamage = { by: attacker?.id ?? null, weapon, time: this.time };
        victim.taggedUntil = this.time + PLAYER.tagTime;

        let kb = null;
        if (knockback) {
            const len = Math.hypot(knockback.x, knockback.z) || 1;
            kb = {
                x: (knockback.x / len) * knockback.strength,
                y: Math.min(4, knockback.strength),
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
            armor: victim.armor,
            weapon,
            zone: info.zone ?? null,
            headshot: !!info.headshot,
            armorHit: !!info.armorHit,
            from: attacker ? { x: round2(attacker.x), z: round2(attacker.z) } : null,
            knockback: kb
        });
        if (victim.health <= 0) this.kill(victim, attacker, weapon, !!info.headshot);
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
        if (!player.isBot) this.emit(player.id, S2C.INVENTORY, { ...player.inventory.toJSON(), armor: player.armor, helmet: player.helmet, money: player.money });
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

    kill(victim, killer, cause, headshot = false) {
        if (!victim.alive) return;
        victim.alive = false;
        victim.health = 0;
        victim.gun.reload = null;
        victim.gun.scoped = 0;
        victim.deaths++;
        const delay = this.mode.respawnDelay(victim);
        victim.respawnAt = delay === null ? Infinity : this.time + delay;

        // Team kills and suicides give no credit
        const credited = killer && killer !== victim && this.mode.isEnemy(killer, victim) ? killer : null;
        if (credited) credited.kills++;
        this.emit(null, S2C.DEATH, { victimId: victim.id, killerId: credited?.id ?? null, cause, headshot });
        this.mode.onKill(victim, credited, cause, headshot);
    }

    // A match was won: show the result, then start over after a pause
    endMatch(result) {
        if (this.matchOver) return;
        this.matchOver = { ...result, restartAt: this.time + MATCH.restartDelay };
        this.mode.dirty = true;
        this.emit(null, S2C.MATCH_END, {
            ...result,
            standings: this.mode.standings().slice(0, 8),
            restartIn: MATCH.restartDelay
        });
    }

    restartMatch() {
        this.matchOver = null;
        this.mode.reset();
        for (const player of this.players.values()) this.mode.resetPlayer(player);
        this.emit(null, S2C.MATCH_START, {});
        for (const player of this.players.values()) this.respawn(player);
    }

    placeAtSpawn(player) {
        const others = [...this.players.values()].filter(p => p.alive && p !== player);
        const zones = this.mode.spawnZones(player);
        const spot = this.arena.findSpawn(this.rng, others, zones ? { zones } : { maxY: this.arena.floor });
        const center = spot ? this.arena.tileCenter(spot.ix, spot.iz) : { x: 0, z: 0 };
        Object.assign(player, { x: center.x, y: spot ? spot.y : this.arena.floor, z: center.z, vx: 0, vy: 0, vz: 0, onGround: true, crouching: false });
        // Face the middle of the map
        player.yaw = Math.atan2(player.x, player.z);
        player.pitch = 0;
        player.lastGroundBlock = spot ? { ix: spot.ix, iy: spot.y, iz: spot.iz } : null;
        player.protectedUntil = this.time + PLAYER.spawnProtection;
        this.lagComp.reset(player.id);
    }

    respawn(player) {
        this.equip(player);
        player.alive = true;
        this.placeAtSpawn(player);
        player.health = PLAYER.maxHealth;
        player.cooldowns = {};
        player.lastDamage = null;
        this.emit(null, S2C.RESPAWN, { id: player.id, x: player.x, y: player.y, z: player.z, yaw: player.yaw, health: player.health, armor: player.armor });
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
                p.y + p.height > c.y - 0.5 && p.y < c.y + 0.5) return true;
        }
        return false;
    }

    // Movement input extras for a bot: weapon weight and being slowed by hits
    botMoveInput(bot, input) {
        input.speedMul = weaponSpec(bot.inventory.selectedId)?.moveSpeed ?? 1;
        input.slow = this.time < bot.taggedUntil ? PLAYER.tagSpeed : 1;
        return input;
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

        this.mode.tick(dt);
        if (this.matchOver && this.time >= this.matchOver.restartAt) this.restartMatch();

        for (const [id, brain] of this.bots) {
            const bot = this.players.get(id);
            const input = brain.update(dt);
            if (!bot.alive || this.mode.frozen(bot)) continue;
            stepMovement(bot, this.botMoveInput(bot, input), this.arena, dt);
            this.afterMove(bot);
        }
        this.updateReloads();

        for (const projectile of this.projectiles.values()) {
            const hit = projectile.step(dt, this, this.time);
            if (!hit) continue;
            this.projectiles.delete(projectile.id);
            const weapon = getItem(projectile.itemId);
            if (hit.type === 'player' && weapon?.damageFor) {
                const owner = this.players.get(projectile.ownerId) || null;
                const { amount, headshot } = weapon.damageFor({ zone: hit.zone, power: projectile.power });
                this.damage(hit.player, amount, owner, weapon.id,
                    { x: projectile.vx, z: projectile.vz, strength: weapon.knockback },
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
            if (pickup.type === 'ammo') player.inventory.addMagazines(pickup.amount);
            else player.inventory.add(pickup.type, pickup.amount);
            this.notifyInventory(player);
            this.emit(null, S2C.PICKUP_TAKEN, { id: pickup.id, by: player.id, type: pickup.type, amount: pickup.amount });
        }

        for (const player of this.players.values()) {
            if (!player.alive && this.time >= player.respawnAt) this.respawn(player);
        }
        this.lagComp.record(this.time, this.players.values());

        this.modeStateTimer -= dt;
        if (this.mode.dirty || this.modeStateTimer <= 0) {
            this.mode.dirty = false;
            this.modeStateTimer = MODE_STATE_INTERVAL;
            this.emit(null, S2C.MODE_STATE, this.mode.stateJSON());
        }

        this.snapshotTimer -= dt;
        if (this.snapshotTimer <= 0) {
            this.snapshotTimer += 1 / NET.snapshotRate;
            this.emit(null, S2C.SNAPSHOT, {
                time: this.time,
                players: [...this.players.values()].map(p => this.playerJSON(p))
            });
        }
    }
}

const clampAbs = (v, limit) => Math.max(-limit, Math.min(limit, v));
