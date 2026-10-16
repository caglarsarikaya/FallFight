import { GUN_GAME, ZOMBIES } from '../../config/modes.js';
import { LONG_JUMP } from '../../constants.js';
import { S2C } from '../../protocol.js';
import { FlowField } from '../../ai/FlowField.js';
import { ZombieBrain } from '../../ai/ZombieBrain.js';
import { buyItem } from '../Shop.js';
import { isGun } from '../../config/weapons.js';
import { GameMode } from './GameMode.js';

const FLOW_INTERVAL = 0.5;       // seconds between flow field rebuilds
const CORPSE_TIME = 2.5;         // a dead zombie lies there this long before it's removed
const SPAWN_INTERVAL = 0.6;      // seconds between zombies coming in during a wave

// Zombies: 1 to 4 players hold out against endless waves. Each wave sends more, tougher, faster
// zombies; every few waves some are runners, and every 5th wave brings giants (one more each time).
// From wave 2, about one zombie in twenty carries a gun and shoots from range (ZOMBIES.gunner).
// Killed zombies drop ammo, potions, armor and guns.
// Players who die come back between waves, or sooner if a teammate holds E over the body for a
// few seconds (ZOMBIES.revive). When everyone is down, the run is over.
// Zombie kills and cleared waves pay money; the buy menu (B) works any time, anywhere.
// On maps with a longJumpSpot (Lava Arena), a long jump module appears there every few minutes:
// whoever takes it can crouch-jump far until they die (LONG_JUMP).
// Rarely (ZOMBIES.drops.godmode) a zombie drops an angel: kept in slot 8 until used, it makes you
// untouchable by zombies for GOD_MODE.duration seconds.
export class Zombies extends GameMode {
    get id() {
        return 'zombies';
    }

    // The room's seats are for people; zombies come on their own
    get seatBots() {
        return false;
    }

    get pickupTypes() {
        return [];
    }

    reset() {
        super.reset();
        this.flow ??= new FlowField(this.room.arena);
        this.flowTimer = 0;
        this.wave = 0;
        this.phase = 'break';
        this.phaseEndsAt = this.room.time + ZOMBIES.firstWaveDelay;
        this.toSpawn = 0;
        this.giantsToSpawn = 0;
        this.spawnTimer = 0;
        this.kills = 0;
        this.bestWave = this.bestWave ?? 0;
        this.nextZombieId = this.nextZombieId ?? 1;
        this.revives = new Map();    // reviver id -> { targetId, until }
        this.longJumpTimer = LONG_JUMP.interval;
        for (const pickup of this.room.pickups.removeType('longjump')) this.room.emit(null, S2C.PICKUP_TAKEN, { id: pickup.id, by: null });
        // Clear any zombies left over from the last run
        for (const p of [...this.room.players.values()]) if (p.isZombie) this.room.removePlayer(p.id);
    }

    resetPlayer(player) {
        super.resetPlayer(player);
        player.money = ZOMBIES.startMoney;
        player.longJump = false;
        player.godUntil = 0;
    }

    onJoin(player) {
        player.money ??= ZOMBIES.startMoney;
        super.onJoin(player);
    }

    pay(player, amount) {
        player.money = Math.max(0, Math.min(ZOMBIES.maxMoney, (player.money ?? 0) + amount));
    }

    // Returns { ok, error?, price }; the items are in shared/game/Shop.js
    buy(player, item) {
        if (!player.alive || player.isZombie || this.room.matchOver) return { ok: false, error: 'not-now' };
        return buyItem(this.room, player, item);
    }

    isEnemy(a, b) {
        return a !== b && !!a.isZombie !== !!b.isZombie;
    }

    // An angel (god mode) is out of the zombies' reach: claws and zombie gunners do nothing
    canDamage(attacker, victim) {
        if (attacker?.isZombie && this.isBlessed(victim)) return false;
        return super.canDamage(attacker, victim);
    }

    isBlessed(player) {
        return player.godUntil > this.room.time;
    }

    // Humans start with a pistol and the knife, no armor
    equip(player) {
        player.inventory.reset({ weapons: ZOMBIES.loadout });
        player.armor = 0;
        player.helmet = false;
    }

    spawnZones(player) {
        const spawns = this.room.map.spawns;
        return player.isZombie ? spawns?.zombie : spawns?.ct;
    }

    // Zombies take nothing; a long jump carrier doesn't need a second one, nor an angel carrier
    canPickUp(player, pickup) {
        if (player.isZombie) return false;
        if (pickup?.type === 'longjump') return !player.longJump;
        if (pickup?.type === 'godmode') return player.inventory.count('godmode') === 0;
        return true;
    }

    // Dead players wait for the end of the wave; dead zombies are cleared away
    respawnDelay() {
        return null;
    }

    get humans() {
        return [...this.room.players.values()].filter(p => !p.isZombie);
    }

    get zombies() {
        return [...this.room.players.values()].filter(p => p.isZombie);
    }

    // Counts in one pass, without building arrays (runs every tick)
    census() {
        const c = this.counts || (this.counts = { humans: 0, humansAlive: 0, zombiesAlive: 0 });
        c.humans = c.humansAlive = c.zombiesAlive = 0;
        for (const p of this.room.players.values()) {
            if (p.isZombie) {
                if (p.alive) c.zombiesAlive++;
            } else {
                c.humans++;
                if (p.alive) c.humansAlive++;
            }
        }
        return c;
    }

    // Nearest living human (zombies chase whoever is closest)
    nearestHuman(from) {
        let best = null;
        let bestDist = Infinity;
        for (const p of this.room.players.values()) {
            if (p.isZombie || !p.alive) continue;
            const d = Math.hypot(p.x - from.x, p.z - from.z) + Math.abs(p.y - from.y) * 2;
            if (d < bestDist) {
                best = p;
                bestDist = d;
            }
        }
        return best;
    }

    // ---- waves -----------------------------------------------------------------------------

    waveStats(wave) {
        return {
            count: ZOMBIES.baseCount + ZOMBIES.perWave * (wave - 1),
            giants: wave % ZOMBIES.giantEvery === 0 ? wave / ZOMBIES.giantEvery : 0,
            health: ZOMBIES.health + ZOMBIES.healthPerWave * (wave - 1),
            speed: Math.min(ZOMBIES.maxSpeed, ZOMBIES.speed + ZOMBIES.speedPerWave * (wave - 1))
        };
    }

    startWave() {
        this.wave++;
        this.phase = 'wave';
        const { count, giants } = this.waveStats(this.wave);
        this.toSpawn = count;
        this.giantsToSpawn = giants;
        this.normalsSpawned = 0;
        this.spawnTimer = 0;
        this.dirty = true;
        this.room.emit(null, S2C.WAVE_START, { wave: this.wave, count, giants });
    }

    endWave() {
        this.stopRevives();
        this.phase = 'break';
        this.phaseEndsAt = this.room.time + ZOMBIES.waveBreak;
        this.bestWave = Math.max(this.bestWave, this.wave);
        // Everyone who fell comes back; survivors get topped up a little; everyone gets paid
        for (const p of this.humans) {
            if (!p.alive) this.room.respawn(p);
            else if (p.health < p.maxHealth) this.room.heal(p, 25);
            this.pay(p, ZOMBIES.waveBonus);
        }
        this.dirty = true;
        this.room.emit(null, S2C.WAVE_END, { wave: this.wave, next: this.wave + 1, breakTime: ZOMBIES.waveBreak });
    }

    // Giants come spread through the wave: with 2 giants, one a third of the way in, one two thirds
    giantDue() {
        if (this.giantsToSpawn <= 0) return false;
        if (this.toSpawn <= 0) return true;
        const { count, giants } = this.waveStats(this.wave);
        const spawned = giants - this.giantsToSpawn;
        return this.normalsSpawned >= ((spawned + 1) * count) / (giants + 1);
    }

    spawnZombie(giant = false) {
        const stats = this.waveStats(this.wave);
        const g = ZOMBIES.giant;
        const rng = this.room.rng;
        // Every runnerEvery-th wave, a third of the zombies are fast and fragile runners
        const runner = !giant && this.wave % ZOMBIES.runnerEvery === 0 && rng() < 0.33;
        const gunner = !giant && !runner && this.wave >= ZOMBIES.gunner.fromWave && rng() < ZOMBIES.gunner.chance;
        const guns = ZOMBIES.gunner.guns;
        const gun = gunner ? guns[Math.floor(rng() * Math.min(guns.length, this.wave + 1))] : null;
        const id = `zombie-${this.nextZombieId++}`;
        const zombie = this.room.addNpc({
            id,
            name: giant ? 'Giant' : runner ? 'Runner' : gunner ? 'Gunner' : 'Zombie',
            characterId: giant ? 'zombie-giant' : runner ? 'zombie-runner' : 'zombie',
            setup: p => {
                p.isZombie = true;
                p.isGiant = giant;
                if (gun) {
                    p.inventory.select(p.inventory.give(gun));
                    p.damageScale = ZOMBIES.gunner.damageScale;
                }
                if (giant) p.scale = g.scale;
                p.knockbackScale = giant ? 0 : ZOMBIES.knockback;
                p.maxHealth = Math.round(stats.health * (giant ? g.health : runner ? 0.6 : 1));
                p.health = p.maxHealth;
            }
        });
        const brain = new ZombieBrain(this, zombie, {
            speed: stats.speed * (giant ? g.speed : runner ? 1.35 : 1),
            damage: Math.round(ZOMBIES.damage * (giant ? g.damage : 1)),
            attackInterval: ZOMBIES.attackInterval,
            reach: giant ? g.reach : ZOMBIES.reach,
            gunner: gun ? ZOMBIES.gunner : null
        });
        this.room.npcs.set(id, brain);
        if (giant) {
            this.giantsToSpawn--;
        } else {
            this.toSpawn--;
            this.normalsSpawned++;
        }
    }

    // A zombie's claws: armor takes some of it
    zombieAttack(zombie, victim, amount) {
        if (this.isBlessed(victim)) return;
        let health = amount;
        if (victim.armor > 0) {
            health = Math.round(amount * 0.6);
            victim.armor = Math.max(0, victim.armor - Math.round(amount * 0.5));
        }
        const dx = victim.x - zombie.x;
        const dz = victim.z - zombie.z;
        this.room.emit(null, S2C.ACTION, { id: zombie.id, action: 'swing', item: 'claws' });
        this.room.damage(victim, health, zombie, 'claws', { x: dx, z: dz, strength: 2 }, {});
    }

    tick(dt) {
        const room = this.room;
        if (room.matchOver) return;
        const now = room.time;

        this.flowTimer -= dt;
        if (this.flowTimer <= 0) {
            this.flowTimer = FLOW_INTERVAL;
            this.flow.update(this.humans.filter(p => p.alive));
        }

        // Remove zombie corpses after a moment
        for (const p of room.players.values()) {
            if (p.isZombie && !p.alive && now - p.diedAt > CORPSE_TIME) room.removePlayer(p.id);
        }

        this.updateLongJump(dt);
        const census = this.census();
        if (this.phase === 'break') {
            if (now >= this.phaseEndsAt && census.humans) this.startWave();
            return;
        }
        if (this.phase === 'wave') {
            if (census.humans && census.humansAlive === 0) {
                this.stopRevives();
                this.phase = 'lost';
                this.bestWave = Math.max(this.bestWave, this.wave - 1);
                this.dirty = true;
                room.endMatch({ title: `Overrun on wave ${this.wave}! ${this.kills} zombies down.` });
                return;
            }
            this.updateRevives(now);
            this.spawnTimer -= dt;
            let alive = census.zombiesAlive;
            if (this.toSpawn + this.giantsToSpawn > 0 && this.spawnTimer <= 0 && alive < ZOMBIES.maxAlive) {
                this.spawnTimer = SPAWN_INTERVAL;
                this.spawnZombie(this.giantDue());
                alive++;
            }
            if (this.toSpawn + this.giantsToSpawn === 0 && alive === 0) this.endWave();
        }
    }

    // One long jump module at a time on the map's spot, every LONG_JUMP.interval seconds
    updateLongJump(dt) {
        const room = this.room;
        const spot = room.map.longJumpSpot;
        if (!spot || room.pickups.has('longjump')) return;
        this.longJumpTimer -= dt;
        if (this.longJumpTimer > 0) return;
        if (!room.arena.isStandable(spot.ix, spot.y, spot.iz)) {
            this.longJumpTimer = 1; // the plaza is blown away right now: try again soon
            return;
        }
        this.longJumpTimer = LONG_JUMP.interval;
        room.emit(null, S2C.PICKUP_SPAWNED, room.pickups.place('longjump', room.arena, spot, room.time));
    }

    // ---- revive -----------------------------------------------------------------------------

    // Hold E on a fallen teammate: { id } starts, { id: null } stops
    onRevive(player, { id } = {}) {
        if (id == null) return this.stopRevive(player.id);
        const target = this.room.players.get(id);
        if (this.phase !== 'wave' || !this.canRevive(player, target) || this.revives.get(player.id)?.targetId === id) return;
        this.stopRevive(player.id);
        // One helper per body
        for (const r of this.revives.values()) if (r.targetId === id) return;
        const until = this.room.time + ZOMBIES.revive.time;
        this.revives.set(player.id, { targetId: id, until });
        this.room.emit(null, S2C.REVIVE, { reviverId: player.id, targetId: id, until });
    }

    canRevive(player, target) {
        if (!player?.alive || player.isZombie || !target || target.alive || target.isZombie || target === player) return false;
        const reach = ZOMBIES.revive.reach;
        return Math.hypot(player.x - target.x, player.z - target.z) <= reach && Math.abs(player.y - target.y) <= reach;
    }

    stopRevive(reviverId) {
        const r = this.revives.get(reviverId);
        if (!r) return;
        this.revives.delete(reviverId);
        this.room.emit(null, S2C.REVIVE, { reviverId, targetId: r.targetId, until: null });
    }

    stopRevives() {
        for (const id of [...this.revives.keys()]) this.stopRevive(id);
    }

    // Helpers who walked off, died or lost the body stop; those who held on long enough revive
    updateRevives(now) {
        for (const [reviverId, r] of this.revives) {
            const player = this.room.players.get(reviverId);
            const target = this.room.players.get(r.targetId);
            if (!this.canRevive(player, target)) {
                this.stopRevive(reviverId);
            } else if (now >= r.until) {
                this.stopRevive(reviverId);
                this.room.revive(target, ZOMBIES.revive.health);
                this.room.emit(null, S2C.REVIVED, { reviverId, targetId: target.id });
                this.dirty = true;
            }
        }
    }

    onKill(victim, killer) {
        this.dirty = true;
        victim.longJump = false;     // kept until you die, even if a teammate revives you
        victim.godUntil = 0;
        if (victim.isZombie) {
            victim.diedAt = this.room.time;
            this.kills++;
            if (killer) {
                killer.score = killer.kills;
                if (!killer.isZombie) this.pay(killer, victim.isGiant ? ZOMBIES.giant.killMoney : ZOMBIES.killMoney);
                // A gunner always leaves its gun behind
                const gun = victim.inventory.hotbar.find(isGun);
                this.dropLoot(victim, victim.isGiant || gun ? 'weapon' : null, gun);
            }
        }
    }

    // One roll per kill: maybe ammo, a potion, armor or a better gun on the ground.
    // sure: a drop type that always comes (a giant always leaves a gun); weapon: which gun
    dropLoot(zombie, sure = null, weapon = null) {
        const rng = this.room.rng;
        let type = sure;
        if (!type) {
            const roll = rng();
            let acc = 0;
            for (const [kind, chance] of Object.entries(ZOMBIES.drops)) {
                acc += chance;
                if (roll < acc) {
                    type = kind;
                    break;
                }
            }
        }
        if (!type) return;
        let extra = {};
        if (type === 'weapon') {
            // Better guns as the waves go on
            const ladder = GUN_GAME.ladder;
            const top = Math.min(ladder.length - 1, 2 + this.wave);
            extra = { weapon: weapon || ladder[Math.floor(rng() * (top + 1))] };
        }
        // The angel lies there longer: it's rare, and its searchlight shows the way
        const life = type === 'godmode' ? ZOMBIES.dropLife * 2 : ZOMBIES.dropLife;
        const pickup = this.room.pickups.drop(type, this.room.arena, zombie, this.room.time, life, extra);
        if (pickup) this.room.emit(null, S2C.PICKUP_SPAWNED, pickup);
    }

    stateJSON() {
        const zombies = this.zombies;
        const left = this.toSpawn + this.giantsToSpawn + zombies.filter(z => z.alive).length;
        return {
            mode: this.id,
            phase: this.phase,
            wave: this.wave,
            left,
            breakLeft: this.phase === 'break' ? Math.max(0, this.phaseEndsAt - this.room.time) : 0,
            kills: this.kills,
            bestWave: this.bestWave
        };
    }

    playerJSON(player) {
        if (!player.isZombie) {
            const godLeft = this.isBlessed(player) ? Math.round((player.godUntil - this.room.time) * 10) / 10 : 0;
            return { money: player.money ?? 0, longJump: !!player.longJump, godLeft };
        }
        return player.isGiant ? { isZombie: true, maxHealth: player.maxHealth, scale: player.scale } : { isZombie: true, maxHealth: player.maxHealth };
    }

    standings() {
        return super.standings().filter(s => !this.room.players.get(s.id)?.isZombie);
    }
}
