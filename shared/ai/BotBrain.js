import { AXE, BOW, PROJECTILE } from '../constants.js';
import { normalize, yawTowards } from '../math.js';
import { TILE } from '../world/Arena.js';

// Bot tuning (distances in blocks, times in seconds)
export const BOT_SETTINGS = {
    reactionTime: [0.15, 0.35],
    meleeRange: 3.0,             // axe reach is 3.5 from the eye
    preferredMeleeDistance: 2.2,
    bowRange: [5, 18],
    drawTime: [0.5, 1.0],
    aimError: 0.05,              // radians of random aim noise
    attackDelay: [0.1, 0.45],    // extra pause on top of weapon cooldowns
    trapChance: 0.35,            // chop the floor under/ahead of the target instead of hitting it
    potionBelowHealth: 50,
    pickupRange: 9,
    retargetInterval: 2.5,
    crowdPenalty: 4,             // prefer targets other bots aren't already chasing
    dodgeChance: 0.8
};

const rand = (rng, [min, max]) => min + rng() * (max - min);
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

// Decides what a bot does each tick. Movement is returned as input for shared physics;
// attacks go through the same GameRoom actions human players use.
export class BotBrain {
    constructor(room, player, rng) {
        this.room = room;
        this.player = player;
        this.rng = rng;
        this.targetId = null;
        this.retargetAt = 0;
        this.nextAttackAt = 1 + rng() * 2;
        this.drawStartedAt = null;
        this.drawFor = 0;
        this.trapMode = false;
        this.strafeDir = rng() < 0.5 ? 1 : -1;
        this.dodge = null;            // { at, tile } reacting to a cracking block
        this.handledCrackTile = null;
    }

    get now() {
        return this.room.time;
    }

    update(_dt) {
        const bot = this.player;
        if (!bot.alive) {
            this.drawStartedAt = null;
            this.dodge = null;
            return idle();
        }

        const dodgeInput = this.updateDodge();
        if (dodgeInput) return dodgeInput;

        this.maybeDrinkPotion();

        const target = this.pickTarget();
        const pickup = this.wantedPickup();
        if (!target) return pickup ? this.moveTowards(pickup.x, pickup.z) : idle();

        const dx = target.x - bot.x;
        const dz = target.z - bot.z;
        const dist = Math.hypot(dx, dz);
        bot.yaw = yawTowards(dx, dz);

        const arrows = bot.inventory.count('arrow');
        if (dist <= BOT_SETTINGS.meleeRange + 0.6) {
            this.cancelDraw();
            this.melee(target);
            return this.circle(target, dist, BOT_SETTINGS.preferredMeleeDistance);
        }
        if (arrows > 0 && dist >= BOT_SETTINGS.bowRange[0] && dist <= BOT_SETTINGS.bowRange[1]) {
            this.shoot(target, dist);
            // Shuffle sideways while drawing to be harder to hit
            return this.strafe(target, dist, 0.35);
        }
        this.cancelDraw();
        if (pickup && Math.hypot(pickup.x - bot.x, pickup.z - bot.z) < dist) return this.moveTowards(pickup.x, pickup.z);
        return this.moveTowards(target.x, target.z);
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

    wantedPickup() {
        const bot = this.player;
        const needArrows = bot.inventory.count('arrow') < 3;
        const needPotion = bot.inventory.count('health_potion') === 0 || bot.health < 70;
        let best = null;
        let bestDist = BOT_SETTINGS.pickupRange;
        for (const pickup of this.room.pickups.pickups.values()) {
            if (pickup.type === 'arrow' && !needArrows) continue;
            if (pickup.type === 'health_potion' && !needPotion) continue;
            const d = Math.hypot(pickup.x - bot.x, pickup.z - bot.z);
            if (d < bestDist) {
                best = pickup;
                bestDist = d;
            }
        }
        return best;
    }

    maybeDrinkPotion() {
        const bot = this.player;
        if (bot.health >= BOT_SETTINGS.potionBelowHealth || bot.inventory.count('health_potion') === 0) return;
        const slot = bot.inventory.hotbar.indexOf('health_potion');
        if (slot >= 0) this.room.useItem(bot, slot, { x: 0, y: -1, z: 0 });
    }

    melee(target) {
        const bot = this.player;
        if (this.now < this.nextAttackAt) return;
        const slot = bot.inventory.hotbar.indexOf('axe');
        if (slot < 0) return;

        const eye = bot.eye;
        let aim;
        if (this.trapMode) {
            // Chop the block under (or just ahead of) the target so it falls
            const lead = 0.25;
            const tx = target.x + target.vx * lead;
            const tz = target.z + target.vz * lead;
            const { ix, iz } = this.room.arena.tileAt(tx, tz);
            const own = this.room.arena.tileAt(bot.x, bot.z);
            if ((ix === own.ix && iz === own.iz) || !this.room.arena.isSafeTile(ix, iz)) {
                aim = { x: target.x, y: target.y + 1.0, z: target.z };
            } else {
                const c = this.room.arena.tileCenter(ix, iz);
                aim = { x: c.x, y: -0.05, z: c.z };
            }
        } else {
            aim = { x: target.x, y: target.y + 1.0, z: target.z };
        }
        const dir = this.withError(normalize({ x: aim.x - eye.x, y: aim.y - eye.y, z: aim.z - eye.z }));
        if (Math.hypot(aim.x - eye.x, aim.y - eye.y, aim.z - eye.z) > AXE.reach) return;

        this.room.useItem(bot, slot, dir);
        this.nextAttackAt = this.now + AXE.cooldown + rand(this.rng, BOT_SETTINGS.attackDelay);
        // Mix it up: sometimes switch between hitting and trapping
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
            y: target.y + 1.1 + 0.5 * PROJECTILE.gravity * time * time,
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
        const arena = this.room.arena;
        const tile = arena.tileAt(bot.x, bot.z);
        const key = `${tile.ix},${tile.iz}`;

        if (!this.dodge && bot.onGround && arena.getTile(tile.ix, tile.iz) === TILE.CRACKING && this.handledCrackTile !== key) {
            this.handledCrackTile = key;
            if (this.rng() < BOT_SETTINGS.dodgeChance) {
                const options = NEIGHBOURS.filter(([ox, oz]) => arena.isSafeTile(tile.ix + ox, tile.iz + oz));
                if (options.length) {
                    const [ox, oz] = options[Math.floor(this.rng() * options.length)];
                    this.dodge = {
                        at: this.now + rand(this.rng, BOT_SETTINGS.reactionTime),
                        until: this.now + 0.9,
                        target: arena.tileCenter(tile.ix + ox, tile.iz + oz)
                    };
                }
            }
        }
        if (!this.dodge) return null;
        if (this.now < this.dodge.at) return idle();
        if (this.now > this.dodge.until) {
            this.dodge = null;
            return null;
        }
        const dx = this.dodge.target.x - bot.x;
        const dz = this.dodge.target.z - bot.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.2) {
            this.dodge = null;
            return idle();
        }
        return { moveX: dx / d, moveZ: dz / d, jump: true };
    }

    // ---- movement -----------------------------------------------------------------------

    moveTowards(x, z) {
        const bot = this.player;
        const dx = x - bot.x;
        const dz = z - bot.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) return idle();
        return this.steer(dx / d, dz / d);
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

    // Pick the safe direction closest to the wanted one; jump over 1-wide gaps
    steer(wantX, wantZ) {
        const bot = this.player;
        const arena = this.room.arena;
        const safeAt = (x, z) => {
            const { ix, iz } = arena.tileAt(x, z);
            return arena.isSafeTile(ix, iz);
        };

        if (safeAt(bot.x + wantX * 0.7, bot.z + wantZ * 0.7)) return { moveX: wantX, moveZ: wantZ, jump: false };
        // Gap ahead: jump it if there is floor right behind it
        if (bot.onGround && safeAt(bot.x + wantX * 2.0, bot.z + wantZ * 2.0) && safeAt(bot.x + wantX * 0.25, bot.z + wantZ * 0.25)) {
            const edge = !safeAt(bot.x + wantX * 0.45, bot.z + wantZ * 0.45);
            return { moveX: wantX, moveZ: wantZ, jump: edge };
        }

        let best = null;
        let bestScore = -0.3;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const dx = Math.cos(a);
            const dz = Math.sin(a);
            const score = dx * wantX + dz * wantZ;
            if (score > bestScore && safeAt(bot.x + dx * 0.7, bot.z + dz * 0.7)) {
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

const idle = () => ({ moveX: 0, moveZ: 0, jump: false });

