import { PLAYER } from '../constants.js';
import { WEAPON_KIND, weaponSpec } from '../config/weapons.js';
import { normalize } from '../math.js';
import { BLOCK_STATE, MAX_DROP } from '../world/Arena.js';

export const rand = (rng, [min, max]) => min + rng() * (max - min);
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
const LOOK_AHEAD = PLAYER.radius + 0.35;   // how far ahead the ground is checked
const FIRE_CHECK = 0.15;                    // seconds between "is anyone aiming at me" checks

// What every computer-controlled body shares, seat bot or zombie (a zombie is a bot that looks
// different): senses (sight, being shot at), shooting in bursts, juking sideways under fire,
// keeping apart from its own side, ground checks and hopping off a cracking block.
// Subclasses decide what to do with it; profile holds the tuning:
//   reactionTime, aimError, shotJitter, headChance, burst, burstPause, tapDelay   (shooting)
//   dodgeChance, dodgeReaction                                                    (cracking floor)
//   juke: { flip, memory, aimMiss, forward }, separation: { radius, weight }
export class Brain {
    constructor(room, player, rng, profile) {
        this.room = room;
        this.player = player;
        this.rng = rng;
        this.profile = profile;
        this.dodgeChance = profile.dodgeChance ?? 0;
        this.seenTargetId = null;     // target in sight (the reaction time applies when it changes)
        this.nextShotAt = 0;
        this.burstLeft = 0;
        this.aimOffset = { yaw: 0, pitch: 0, head: false };
        this.seq = 0;
        this.dodge = null;
        this.handledCrackKey = null;
        this.jukeDir = rng() < 0.5 ? 1 : -1;
        this.jukeFlipAt = 0;
        this.fireCheckAt = 0;
        this.fired = false;
        this.sep = { x: 0, z: 0 };
    }

    get now() {
        return this.room.time;
    }

    get arena() {
        return this.room.arena;
    }

    get weapon() {
        return weaponSpec(this.player.inventory.selectedId);
    }

    // ---- senses -------------------------------------------------------------------------

    hasLineOfSight(target) {
        const eye = this.player.eye;
        const to = { x: target.x - eye.x, y: target.y + 1.2 - eye.y, z: target.z - eye.z };
        const dist = Math.hypot(to.x, to.y, to.z);
        return !this.arena.raycast(eye, normalize(to), dist) && !this.room.smokeBlocks(eye, to);
    }

    // Hit a moment ago, or an enemy's crosshair is on us right now. Checked a few times a second.
    underFire() {
        if (this.now < this.fireCheckAt) return this.fired;
        this.fireCheckAt = this.now + FIRE_CHECK;
        const p = this.player;
        const j = this.profile.juke;
        this.fired = !!(p.lastDamage && this.now - p.lastDamage.time < j.memory) || this.aimedAt(j.aimMiss);
        return this.fired;
    }

    // Is any enemy within gun range looking at a point less than `miss` blocks from our chest
    aimedAt(miss) {
        const p = this.player;
        for (const o of this.room.players.values()) {
            if (!o.alive || !this.room.mode.isEnemy(p, o)) continue;
            const eye = o.eye;
            const tx = p.x - eye.x;
            const ty = p.y + 1.1 - eye.y;
            const tz = p.z - eye.z;
            const d2 = tx * tx + ty * ty + tz * tz;
            if (d2 > 45 * 45) continue;
            const cp = Math.cos(o.pitch);
            const along = -Math.sin(o.yaw) * cp * tx + Math.sin(o.pitch) * ty - Math.cos(o.yaw) * cp * tz;
            if (along > 0 && d2 - along * along < miss * miss) return true;
        }
        return false;
    }

    // ---- shooting -----------------------------------------------------------------------

    // Aim at the chest (sometimes the head) with a per-burst error and a little per-shot jitter
    aimAt(target, dist) {
        const bot = this.player;
        const eye = bot.eye;
        const scale = target.crouching ? PLAYER.crouchHeight / PLAYER.height : 1;
        // Rockets go at the feet: a near miss still blows up the floor under them
        const launcher = this.weapon?.kind === WEAPON_KIND.LAUNCHER;
        const y = target.y + (launcher ? 0.3 : (this.aimOffset.head ? 1.62 : 1.15) * scale);
        const lead = Math.min(0.12, dist / 300);
        const dir = normalize({ x: target.x + target.vx * lead - eye.x, y: y - eye.y, z: target.z + target.vz * lead - eye.z });
        const j = this.profile.shotJitter;
        const yaw = Math.atan2(-dir.x, -dir.z) + this.aimOffset.yaw + (this.rng() - 0.5) * j;
        const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y))) + this.aimOffset.pitch + (this.rng() - 0.5) * j;
        bot.pitch = pitch;
        return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
    }

    newBurst(spec) {
        const e = this.profile.aimError;
        this.aimOffset = {
            yaw: (this.rng() + this.rng() - 1) * e,
            pitch: (this.rng() + this.rng() - 1) * e * 0.7,
            head: this.rng() < this.profile.headChance
        };
        this.burstLeft = spec.auto ? Math.round(rand(this.rng, this.profile.burst)) : 1;
    }

    // Fire the gun in hand at a target in sight: a reaction time for a newly seen target, then bursts
    shoot(target, dist) {
        const bot = this.player;
        const spec = this.weapon;
        if (!spec || spec.kind === WEAPON_KIND.KNIFE) return;
        if (this.seenTargetId !== target.id) {
            this.seenTargetId = target.id;
            this.nextShotAt = Math.max(this.nextShotAt, this.now + rand(this.rng, this.profile.reactionTime));
            this.burstLeft = 0;
        }
        if (spec.scope && bot.gun.scoped === 0 && dist > 8) this.room.setScope(bot, 1);
        if (this.now < this.nextShotAt) return;
        if (this.burstLeft <= 0) this.newBurst(spec);

        const dir = this.aimAt(target, dist);
        if (!this.room.fire(bot, { slot: bot.inventory.selected, seq: ++this.seq, dir, t: this.now })) return;
        this.burstLeft--;
        if (this.burstLeft <= 0) {
            this.nextShotAt = this.now + (spec.auto
                ? rand(this.rng, this.profile.burstPause)
                : spec.interval + rand(this.rng, this.profile.tapDelay));
        }
    }

    // ---- moving like you don't want to be hit ---------------------------------------------

    // -1 or 1: which way to side-step, flipping on an uneven timer so the rhythm can't be read
    jukeSide() {
        if (this.now >= this.jukeFlipAt) {
            if (this.rng() < 0.8) this.jukeDir *= -1;
            this.jukeFlipAt = this.now + rand(this.rng, this.profile.juke.flip);
        }
        return this.jukeDir;
    }

    // A unit direction mostly along (fx, fz) (forward share 0..1) with a side-step mixed in
    juke(fx, fz, forward = this.profile.juke.forward) {
        const s = this.jukeSide();
        const wx = fx * forward - fz * s;
        const wz = fz * forward + fx * s;
        const len = Math.hypot(wx, wz) || 1;
        return { x: wx / len, z: wz / len };
    }

    // A push away from our own side standing too close (weighted so the nearest counts most)
    separation() {
        const p = this.player;
        const { radius } = this.profile.separation;
        const sep = this.sep;
        sep.x = sep.z = 0;
        const crowd = this.room.crowd;
        if (!crowd) return sep;
        crowd.forNeighbours(p, Math.ceil(radius), o => {
            if (this.room.mode.isEnemy(p, o) || Math.abs(o.y - p.y) > 1.5) return;
            const dx = p.x - o.x;
            const dz = p.z - o.z;
            const d = Math.hypot(dx, dz);
            if (d >= radius) return;
            if (d < 1e-3) {
                // Exactly on top of each other: split by id so the two go opposite ways
                const a = p.id < o.id ? 1 : -1;
                sep.x += a;
                return;
            }
            const w = (radius - d) / (radius * d);
            sep.x += dx * w;
            sep.z += dz * w;
        });
        return sep;
    }

    // ---- ground ---------------------------------------------------------------------------

    // Is there ground (or a wall) just ahead in direction (nx, nz)? Checks straight ahead and both
    // shoulders. A pit, the map edge or a cracking block over nothing counts as a fall.
    safe(nx, nz) {
        const p = this.player;
        const r = PLAYER.radius * 0.9;
        const ax = p.x + nx * LOOK_AHEAD;
        const az = p.z + nz * LOOK_AHEAD;
        return this.groundAt(ax, az) && this.groundAt(ax - nz * r, az + nx * r) && this.groundAt(ax + nz * r, az - nx * r);
    }

    groundAt(x, z) {
        const arena = this.arena;
        const { ix, iz } = arena.tileAt(x, z);
        const y = Math.round(this.player.y);
        for (let l = y + 2; l >= Math.max(0, y - MAX_DROP); l--) {
            if (!arena.isSolid(ix, l, iz)) continue;
            return l > y || arena.isStable(ix, l, iz);   // above the feet: a wall, which just stops us
        }
        return false;
    }

    // A tile the body can step onto from where it stands: stable, not higher, not a deadly drop
    isSafeStep(ix, iz) {
        const y = this.player.y;
        const h = this.arena.levelNear(ix, iz, Math.round(y));
        return h !== null && h <= y + 0.5 && h >= y - 3 && this.arena.isStable(ix, h, iz);
    }

    // React to the block under its feet cracking by jumping to a safe neighbour (dodgeChance of
    // the time, after profile.dodgeReaction). Returns movement input while dodging, else null.
    updateDodge() {
        const bot = this.player;
        const arena = this.arena;
        const under = arena.supportBlock(bot.x, bot.y, bot.z, 0);
        const key = under ? `${under.ix},${under.iy},${under.iz}` : null;

        if (!this.dodge && bot.onGround && under && arena.stateAt(under.ix, under.iy, under.iz) === BLOCK_STATE.CRACKING && this.handledCrackKey !== key) {
            this.handledCrackKey = key;
            if (this.rng() < this.dodgeChance) {
                const options = NEIGHBOURS
                    .map(([ox, oz]) => ({ ix: under.ix + ox, iz: under.iz + oz }))
                    .filter(t => this.isSafeStep(t.ix, t.iz));
                if (options.length) {
                    const pick = options[Math.floor(this.rng() * options.length)];
                    this.dodge = {
                        at: this.now + rand(this.rng, this.profile.dodgeReaction),
                        until: this.now + 0.9,
                        target: arena.tileCenter(pick.ix, pick.iz)
                    };
                }
            }
        }
        if (!this.dodge) return null;
        if (this.now < this.dodge.at) return { moveX: 0, moveZ: 0, jump: false };
        const dx = this.dodge.target.x - bot.x;
        const dz = this.dodge.target.z - bot.z;
        const d = Math.hypot(dx, dz);
        if (this.now > this.dodge.until || d < 0.2) {
            this.dodge = null;
            return null;
        }
        return { moveX: dx / d, moveZ: dz / d, jump: true };
    }
}
