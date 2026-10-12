import { AXE, BOW, PLAYER, PROJECTILE } from '../constants.js';
import { normalize, yawTowards } from '../math.js';
import { BLOCK_STATE } from '../world/Arena.js';
import { Pathfinder } from './Pathfinder.js';

// Bot tuning (distances in blocks, times in seconds)
export const BOT_SETTINGS = {
    reactionTime: [0.15, 0.35],
    meleeRange: 3.0,             // axe reach is 3.5 from the eye
    preferredMeleeDistance: 2.2,
    bowRange: [5, 20],
    drawTime: [0.5, 1.0],
    aimError: 0.05,              // radians of random aim noise
    aimHeight: 0.95,             // aim at the lower chest; headshots happen, but rarely
    attackDelay: [0.1, 0.45],    // extra pause on top of weapon cooldowns
    trapChance: 0.35,            // chop the block under the target instead of hitting it
    potionBelowHealth: 50,
    retargetInterval: 2.5,
    crowdPenalty: 4,             // prefer targets other bots aren't already chasing
    dodgeChance: 0.8,
    replanInterval: 0.5,
    // Pickup racing
    pickupNotice: [0.3, 0.9],    // how long after a pickup appears before this bot reacts
    pickupRethink: 0.4,
    pickupDistanceCost: 1.5,     // value lost per block of distance
    pickupGrabRange: 3           // grab it even in the middle of a fight
};

const rand = (rng, [min, max]) => min + rng() * (max - min);
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
const idle = () => ({ moveX: 0, moveZ: 0, jump: false });

// Decides what a bot does each tick. Movement is returned as input for shared physics;
// attacks go through the same GameRoom actions human players use.
export class BotBrain {
    constructor(room, player, rng) {
        this.room = room;
        this.player = player;
        this.rng = rng;
        this.pathfinder = new Pathfinder(room.arena);
        this.targetId = null;
        this.retargetAt = 0;
        this.nextAttackAt = 1 + rng() * 2;
        this.drawStartedAt = null;
        this.drawFor = 0;
        this.trapMode = false;
        this.strafeDir = rng() < 0.5 ? 1 : -1;
        this.dodge = null;
        this.handledCrackKey = null;
        this.noticeDelay = rand(rng, BOT_SETTINGS.pickupNotice);
        this.pickupId = null;
        this.pickupThinkAt = 0;
        this.path = null;
        this.pathKey = null;
        this.replanAt = 0;
    }

    get now() {
        return this.room.time;
    }

    get arena() {
        return this.room.arena;
    }

    update(_dt) {
        const bot = this.player;
        if (!bot.alive) {
            this.drawStartedAt = null;
            this.dodge = null;
            this.path = null;
            return idle();
        }

        const dodgeInput = this.updateDodge();
        if (dodgeInput) return dodgeInput;

        this.maybeDrinkPotion();
        const target = this.pickTarget();
        const pickup = this.choosePickup();
        const dist = target ? Math.hypot(target.x - bot.x, target.z - bot.z) : Infinity;
        const enemyClose = target && dist <= BOT_SETTINGS.meleeRange + 0.6 && Math.abs(target.y - bot.y) < 1.6;

        if (enemyClose) {
            bot.yaw = yawTowards(target.x - bot.x, target.z - bot.z);
            this.cancelDraw();
            this.melee(target);
            const pickupDist = pickup ? Math.hypot(pickup.x - bot.x, pickup.z - bot.z) : Infinity;
            if (pickupDist < BOT_SETTINGS.pickupGrabRange) return this.followPath(pickup.x, pickup.z);
            return this.circle(target, dist, BOT_SETTINGS.preferredMeleeDistance);
        }

        if (pickup) {
            this.cancelDraw();
            return this.faceMovement(this.followPath(pickup.x, pickup.z));
        }

        if (!target) return idle();
        bot.yaw = yawTowards(target.x - bot.x, target.z - bot.z);
        const canShoot = bot.inventory.count('arrow') > 0 &&
            dist >= BOT_SETTINGS.bowRange[0] && dist <= BOT_SETTINGS.bowRange[1] && this.hasLineOfSight(target);
        if (canShoot) {
            this.shoot(target, dist);
            return this.strafe(target, dist, 0.35);
        }
        this.cancelDraw();
        return this.followPath(target.x, target.z);
    }

    // ---- decisions ----------------------------------------------------------------------

    pickTarget() {
        const bot = this.player;
        const current = this.room.players.get(this.targetId);
        if (current?.alive && this.now < this.retargetAt) return current;

        let best = null;
        let bestScore = Infinity;
        for (const other of this.room.players.values()) {
            if (other === bot || !other.alive) continue;
            const chasers = [...this.room.bots.values()].filter(b => b !== this && b.targetId === other.id).length;
            const score = Math.hypot(other.x - bot.x, other.z - bot.z) + chasers * BOT_SETTINGS.crowdPenalty;
            if (score < bestScore) {
                best = other;
                bestScore = score;
            }
        }
        this.targetId = best?.id ?? null;
        this.retargetAt = this.now + BOT_SETTINGS.retargetInterval;
        this.trapMode = this.rng() < BOT_SETTINGS.trapChance;
        return best;
    }

    pickupValue(pickup) {
        const inv = this.player.inventory;
        if (pickup.type === 'health_potion') {
            return 45 + (this.player.health < 70 ? 25 : 0) + (inv.count('health_potion') === 0 ? 15 : 0);
        }
        const arrows = inv.count('arrow');
        return arrows < 5 ? 60 : arrows < 20 ? 35 : 25;
    }

    // Race for pickups worth the trip; reconsidered a few times a second
    choosePickup() {
        const pickups = this.room.pickups.pickups;
        if (this.now < this.pickupThinkAt) return pickups.get(this.pickupId) || null;
        this.pickupThinkAt = this.now + BOT_SETTINGS.pickupRethink;

        const bot = this.player;
        let best = null;
        let bestScore = 0;
        for (const pickup of pickups.values()) {
            if (this.now - (pickup.spawnedAt || 0) < this.noticeDelay) continue;
            const d = Math.hypot(pickup.x - bot.x, pickup.z - bot.z) + Math.abs(pickup.baseY - bot.y) * 2;
            let score = this.pickupValue(pickup) - d * BOT_SETTINGS.pickupDistanceCost;
            // Probably lost if someone else is clearly closer
            for (const other of this.room.players.values()) {
                if (other === bot || !other.alive) continue;
                if (Math.hypot(pickup.x - other.x, pickup.z - other.z) + 3 < d) {
                    score *= 0.5;
                    break;
                }
            }
            if (score > bestScore) {
                best = pickup;
                bestScore = score;
            }
        }
        this.pickupId = best?.id ?? null;
        return best;
    }

    maybeDrinkPotion() {
        const bot = this.player;
        if (bot.health >= BOT_SETTINGS.potionBelowHealth || bot.inventory.count('health_potion') === 0) return;
        const slot = bot.inventory.hotbar.indexOf('health_potion');
        if (slot >= 0) this.room.useItem(bot, slot, { x: 0, y: -1, z: 0 });
    }

    hasLineOfSight(target) {
        const eye = this.player.eye;
        const to = { x: target.x - eye.x, y: target.y + 1.2 - eye.y, z: target.z - eye.z };
        const dist = Math.hypot(to.x, to.y, to.z);
        return !this.arena.raycast(eye, normalize(to), dist);
    }

    melee(target) {
        const bot = this.player;
        if (this.now < this.nextAttackAt) return;
        const slot = bot.inventory.hotbar.indexOf('axe');
        if (slot < 0) return;

        const eye = bot.eye;
        let aim = { x: target.x, y: target.y + 1.0, z: target.z };
        if (this.trapMode) {
            // Chop the block under (or just ahead of) the target so it falls
            const tx = target.x + target.vx * 0.25;
            const tz = target.z + target.vz * 0.25;
            const under = this.arena.supportBlock(tx, target.y, tz, 0);
            const own = this.arena.supportBlock(bot.x, bot.y, bot.z, PLAYER.radius);
            const isOwn = own && under && own.ix === under.ix && own.iy === under.iy && own.iz === under.iz;
            if (under && !isOwn && this.arena.isStable(under.ix, under.iy, under.iz)) {
                const c = this.arena.blockCenter(under.ix, under.iy, under.iz);
                aim = { x: c.x, y: c.y + 0.45, z: c.z };
            }
        }
        if (Math.hypot(aim.x - eye.x, aim.y - eye.y, aim.z - eye.z) > AXE.reach) return;
        const dir = this.withError(normalize({ x: aim.x - eye.x, y: aim.y - eye.y, z: aim.z - eye.z }));
        this.room.useItem(bot, slot, dir);
        this.nextAttackAt = this.now + AXE.cooldown + rand(this.rng, BOT_SETTINGS.attackDelay);
        if (this.rng() < 0.3) this.trapMode = this.rng() < BOT_SETTINGS.trapChance;
    }

    shoot(target, dist) {
        const bot = this.player;
        const slot = bot.inventory.hotbar.indexOf('bow');
        if (slot < 0) return;

        if (this.drawStartedAt === null) {
            if (this.now < this.nextAttackAt) return;
            if (bot.inventory.selected !== slot) this.room.select(bot, slot);
            this.room.setDrawing(bot, true);
            this.drawStartedAt = this.now;
            this.drawFor = rand(this.rng, BOT_SETTINGS.drawTime);
            return;
        }
        const held = this.now - this.drawStartedAt;
        if (held < this.drawFor) return;

        // Lead the target and aim above it to cancel gravity drop
        const speed = BOW.minSpeed + (BOW.maxSpeed - BOW.minSpeed) * Math.min(1, held / BOW.fullDraw);
        const eye = bot.eye;
        const time = dist / speed;
        const aim = {
            x: target.x + target.vx * time,
            y: target.y + BOT_SETTINGS.aimHeight + 0.5 * PROJECTILE.gravity * time * time,
            z: target.z + target.vz * time
        };
        const dir = this.withError(normalize({ x: aim.x - eye.x, y: aim.y - eye.y, z: aim.z - eye.z }));
        this.room.useItem(bot, slot, dir, held);
        this.drawStartedAt = null;
        this.nextAttackAt = this.now + BOW.cooldown + rand(this.rng, BOT_SETTINGS.attackDelay);
    }

    cancelDraw() {
        if (this.drawStartedAt !== null) {
            this.drawStartedAt = null;
            this.room.setDrawing(this.player, false);
        }
    }

    // React to the block under its feet cracking by jumping to a safe neighbour
    updateDodge() {
        const bot = this.player;
        const arena = this.arena;
        const under = arena.supportBlock(bot.x, bot.y, bot.z, 0);
        const key = under ? `${under.ix},${under.iy},${under.iz}` : null;

        if (!this.dodge && bot.onGround && under && arena.stateAt(under.ix, under.iy, under.iz) === BLOCK_STATE.CRACKING && this.handledCrackKey !== key) {
            this.handledCrackKey = key;
            if (this.rng() < BOT_SETTINGS.dodgeChance) {
                const options = NEIGHBOURS
                    .map(([ox, oz]) => ({ ix: under.ix + ox, iz: under.iz + oz }))
                    .filter(t => this.isSafeStep(t.ix, t.iz));
                if (options.length) {
                    const pick = options[Math.floor(this.rng() * options.length)];
                    this.dodge = {
                        at: this.now + rand(this.rng, BOT_SETTINGS.reactionTime),
                        until: this.now + 0.9,
                        target: arena.tileCenter(pick.ix, pick.iz)
                    };
                }
            }
        }
        if (!this.dodge) return null;
        if (this.now < this.dodge.at) return idle();
        const dx = this.dodge.target.x - bot.x;
        const dz = this.dodge.target.z - bot.z;
        const d = Math.hypot(dx, dz);
        if (this.now > this.dodge.until || d < 0.2) {
            this.dodge = null;
            return null;
        }
        return { moveX: dx / d, moveZ: dz / d, jump: true };
    }

    // ---- movement -----------------------------------------------------------------------

    // A tile the bot can step onto from where it stands: stable, not higher, not a deadly drop
    isSafeStep(ix, iz) {
        const h = this.arena.surfaceHeight(ix, iz);
        const y = this.player.y;
        return h !== null && h <= y + 0.5 && h >= y - 3 && this.arena.isStable(ix, h, iz);
    }

    safeAt(x, z) {
        const { ix, iz } = this.arena.tileAt(x, z);
        return this.isSafeStep(ix, iz);
    }

    // Walk along an A* path to (x, z), jumping up onto higher blocks
    followPath(x, z) {
        const bot = this.player;
        const goal = this.arena.tileAt(x, z);
        const key = `${goal.ix},${goal.iz}`;
        if (key !== this.pathKey || this.now >= this.replanAt || !this.path) {
            this.path = this.pathfinder.find(this.arena.tileAt(bot.x, bot.z), goal);
            this.pathKey = key;
            this.replanAt = this.now + BOT_SETTINGS.replanInterval;
        }
        if (!this.path) return this.moveDirect(x, z);

        while (this.path.length) {
            const c = this.arena.tileCenter(this.path[0].ix, this.path[0].iz);
            if (Math.hypot(c.x - bot.x, c.z - bot.z) < 0.3 && Math.abs(this.path[0].y - bot.y) < 0.6) this.path.shift();
            else break;
        }
        if (!this.path.length) return this.moveDirect(x, z);

        const waypoint = this.path[0];
        const c = this.arena.tileCenter(waypoint.ix, waypoint.iz);
        const dx = c.x - bot.x;
        const dz = c.z - bot.z;
        const d = Math.hypot(dx, dz) || 1;
        const jump = bot.onGround && waypoint.y > bot.y + 0.3 && d < 1.3;
        return { moveX: dx / d, moveZ: dz / d, jump };
    }

    moveDirect(x, z) {
        const bot = this.player;
        const dx = x - bot.x;
        const dz = z - bot.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.25) return idle();
        return this.steer(dx / d, dz / d);
    }

    faceMovement(input) {
        if (input.moveX || input.moveZ) this.player.yaw = yawTowards(input.moveX, input.moveZ);
        return input;
    }

    // Keep a preferred distance while orbiting the target
    circle(target, dist, preferred) {
        const dx = (target.x - this.player.x) / (dist || 1);
        const dz = (target.z - this.player.z) / (dist || 1);
        if (this.rng() < 0.02) this.strafeDir *= -1;
        const radial = dist > preferred + 0.4 ? 1 : dist < preferred - 0.4 ? -1 : 0;
        const wx = dx * radial + -dz * this.strafeDir * 0.6;
        const wz = dz * radial + dx * this.strafeDir * 0.6;
        const len = Math.hypot(wx, wz);
        return len > 0.01 ? this.steer(wx / len, wz / len) : idle();
    }

    strafe(target, dist, amount) {
        const dx = (target.x - this.player.x) / (dist || 1);
        const dz = (target.z - this.player.z) / (dist || 1);
        if (this.rng() < 0.02) this.strafeDir *= -1;
        const input = this.steer(-dz * this.strafeDir, dx * this.strafeDir);
        return { moveX: input.moveX * amount, moveZ: input.moveZ * amount, jump: false };
    }

    // Pick the safe direction closest to the wanted one
    steer(wantX, wantZ) {
        const bot = this.player;
        if (this.safeAt(bot.x + wantX * 0.7, bot.z + wantZ * 0.7)) return { moveX: wantX, moveZ: wantZ, jump: false };
        let best = null;
        let bestScore = -0.3;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const dx = Math.cos(a);
            const dz = Math.sin(a);
            const score = dx * wantX + dz * wantZ;
            if (score > bestScore && this.safeAt(bot.x + dx * 0.7, bot.z + dz * 0.7)) {
                best = { moveX: dx, moveZ: dz, jump: false };
                bestScore = score;
            }
        }
        return best || idle();
    }

    withError(dir) {
        const e = BOT_SETTINGS.aimError;
        return normalize({
            x: dir.x + (this.rng() - 0.5) * 2 * e,
            y: dir.y + (this.rng() - 0.5) * 2 * e,
            z: dir.z + (this.rng() - 0.5) * 2 * e
        });
    }
}
