import { PLAYER } from '../constants.js';
import { KNIFE, WEAPON_KIND, WEAPON_SLOT } from '../config/weapons.js';
import { normalize, yawTowards } from '../math.js';
import { Brain, rand } from './Brain.js';
import { Pathfinder } from './Pathfinder.js';

// Bot tuning (distances in blocks, times in seconds)
export const BOT_SETTINGS = {
    reactionTime: [0.3, 0.55],   // before the first shot at a newly seen target
    knifeRange: 1.7,
    preferredKnifeDistance: 1.2,
    aimError: 0.03,              // radians of aim noise per burst
    shotJitter: 0.006,           // extra noise per shot
    headChance: 0.12,            // share of bursts aimed at the head
    burst: [3, 7],               // rounds per burst with automatic guns
    burstPause: [0.25, 0.6],
    tapDelay: [0.08, 0.3],       // extra delay between semi-auto shots
    effectiveRange: { pistol: 45, smg: 20, shotgun: 11, rifle: 48, mg: 40, sniper: 70, launcher: 30, knife: 2 },
    rpgMinRange: 5,              // never fire the RPG at anyone closer (the blast would get us too)
    rpgValue: 120,               // how much the RPG on a tower top is worth the trip
    trapChance: 0.3,             // knife the block under a close target instead of stabbing it
    potionBelowHealth: 50,
    retargetInterval: 2.5,
    crowdPenalty: 4,             // prefer targets other bots aren't already chasing
    dodgeChance: 0.8,
    dodgeReaction: [0.3, 0.55],
    // Under fire (hit in the last `memory` s, or someone's crosshair within aimMiss blocks of us):
    // side-step, flipping every `flip` s; sometimes hop or duck
    juke: { flip: [0.25, 0.7], memory: 1.2, aimMiss: 0.9, forward: 0.35, hop: 0.2, duck: 0.15 },
    separation: { radius: 1.5, weight: 0.6 },
    replanInterval: 0.5,
    // Pickup racing
    pickupNotice: [0.3, 0.9],    // how long after a pickup appears before this bot reacts
    pickupRethink: 0.4,
    pickupDistanceCost: 1.5,     // value lost per block of distance
    pickupGrabRange: 3,          // grab it even in the middle of a fight
    // Sniper towers
    sniperChance: 0.25,          // chance, every sniperThink seconds, to go and snipe when it's quiet
    sniperThink: 5,
    sniperRange: 60,
    sniperStay: [15, 25]
};

const idle = () => ({ moveX: 0, moveZ: 0, jump: false });

// Decides what a bot does each tick. Movement is returned as input for shared physics;
// attacks go through the same GameRoom actions human players use. Senses, shooting, juking and
// dodging are shared with the zombies (./Brain.js).
export class BotBrain extends Brain {
    constructor(room, player, rng) {
        super(room, player, rng, BOT_SETTINGS);
        this.pathfinder = new Pathfinder(room.arena);
        this.targetId = null;
        this.retargetAt = 0;
        this.nextShotAt = 1 + rng() * 2;
        this.trapMode = false;
        this.duckUntil = 0;
        this.noticeDelay = rand(rng, BOT_SETTINGS.pickupNotice);
        this.pickupId = null;
        this.pickupThinkAt = 0;
        this.path = null;
        this.pathKey = null;
        this.replanAt = 0;
        this.sniper = null;          // { perch, until } while heading to / holding a sniper tower top
        this.sniperThinkAt = 2 + rng() * BOT_SETTINGS.sniperThink;
    }

    update(_dt) {
        const bot = this.player;
        if (!bot.alive) {
            this.dodge = null;
            this.path = null;
            this.seenTargetId = null;
            return idle();
        }

        const dodgeInput = this.updateDodge();
        if (dodgeInput) return dodgeInput;

        this.maybeDrinkPotion();
        this.manageWeapon();
        const target = this.pickTarget();
        const pickup = this.choosePickup();
        const dist = target ? Math.hypot(target.x - bot.x, target.z - bot.z) : Infinity;
        const spec = this.weapon;
        const knifeOnly = !spec || spec.kind === WEAPON_KIND.KNIFE;
        const enemyClose = target && dist <= BOT_SETTINGS.knifeRange + 0.6 && Math.abs(target.y - bot.y) < 1.6;

        if (enemyClose && (knifeOnly || this.trapMode)) {
            this.sniper = null;
            bot.yaw = yawTowards(target.x - bot.x, target.z - bot.z);
            this.knife(target);
            const pickupDist = pickup ? Math.hypot(pickup.x - bot.x, pickup.z - bot.z) : Infinity;
            if (pickupDist < BOT_SETTINGS.pickupGrabRange) return this.followPath(pickup.x, pickup.z);
            return this.circle(target, dist, BOT_SETTINGS.preferredKnifeDistance);
        }

        const sniping = this.updateSniper(target, dist);
        if (sniping) return sniping;

        if (pickup) return this.faceMovement(this.followPath(pickup.x, pickup.z));
        if (!target) return idle();

        bot.yaw = yawTowards(target.x - bot.x, target.z - bot.z);
        const range = BOT_SETTINGS.effectiveRange[spec?.kind] ?? 2;
        const visible = this.hasLineOfSight(target);
        if (!knifeOnly && visible && dist <= range) {
            this.shoot(target, dist);
            // Snipers, and rifles at range, stand still to shoot accurately; the rest strafe.
            // Being shot at beats accuracy: everyone dances then.
            const still = spec.kind === WEAPON_KIND.SNIPER || spec.kind === WEAPON_KIND.LAUNCHER || (spec.kind === WEAPON_KIND.RIFLE && dist > 15);
            if (this.underFire()) return this.evade(target, dist);
            return still ? idle() : this.strafe(target, dist, 0.45);
        }
        if (!visible) this.seenTargetId = null;
        return this.followPath(target.x, target.z);
    }

    // ---- weapons ------------------------------------------------------------------------

    ammoOf(slot) {
        const id = this.player.inventory.hotbar[slot];
        return id ? this.player.inventory.ammo[id] || null : null;
    }

    // Keep the best gun that still has ammo in hand; reload empty magazines
    manageWeapon() {
        const bot = this.player;
        const inv = bot.inventory;
        if (bot.gun.reload) return;
        // The map's RPG: out for a target in sight at a safe distance, put away otherwise
        if (inv.has('rpg')) {
            const target = this.room.players.get(this.targetId);
            const d = target?.alive ? Math.hypot(target.x - bot.x, target.z - bot.z) : Infinity;
            if (d >= BOT_SETTINGS.rpgMinRange && d <= BOT_SETTINGS.effectiveRange.launcher && this.hasLineOfSight(target)) {
                if (inv.selected !== WEAPON_SLOT.SPECIAL) this.room.select(bot, WEAPON_SLOT.SPECIAL);
                return;
            }
        }
        for (const slot of [WEAPON_SLOT.PRIMARY, WEAPON_SLOT.SECONDARY]) {
            const ammo = this.ammoOf(slot);
            if (!ammo || ammo.mag + ammo.reserve <= 0) continue;
            if (inv.selected !== slot) {
                this.room.select(bot, slot);
                return;
            }
            if (ammo.mag === 0) this.room.reload(bot);
            return;
        }
        if (inv.selected !== WEAPON_SLOT.KNIFE) this.room.select(bot, WEAPON_SLOT.KNIFE);
    }

    knife(target) {
        const bot = this.player;
        if (this.now < this.nextShotAt) return;
        if (bot.inventory.selected !== WEAPON_SLOT.KNIFE) this.room.select(bot, WEAPON_SLOT.KNIFE);
        const eye = bot.eye;
        let aim = { x: target.x, y: target.y + 1.1, z: target.z };
        let reach = KNIFE.reach;
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
                reach = KNIFE.blockReach;
            }
        }
        if (Math.hypot(aim.x - eye.x, aim.y - eye.y, aim.z - eye.z) > reach) return;
        const e = BOT_SETTINGS.aimError;
        const dir = normalize({
            x: aim.x - eye.x + (this.rng() - 0.5) * e,
            y: aim.y - eye.y + (this.rng() - 0.5) * e,
            z: aim.z - eye.z + (this.rng() - 0.5) * e
        });
        const stab = this.rng() < 0.3;
        if (this.room.fire(bot, { slot: WEAPON_SLOT.KNIFE, dir, alt: stab, t: this.now })) {
            this.nextShotAt = this.now + (stab ? KNIFE.stab.interval : KNIFE.slash.interval) + rand(this.rng, BOT_SETTINGS.tapDelay);
            if (this.rng() < 0.3) this.trapMode = this.rng() < BOT_SETTINGS.trapChance;
        }
    }

    // ---- decisions ----------------------------------------------------------------------

    pickTarget() {
        const bot = this.player;
        const current = this.room.players.get(this.targetId);
        if (current?.alive && this.now < this.retargetAt) return current;

        let best = null;
        let bestScore = Infinity;
        for (const other of this.room.players.values()) {
            if (!other.alive || !this.room.mode.isEnemy(bot, other)) continue;
            let chasers = 0;
            for (const b of this.room.bots.values()) if (b !== this && b.targetId === other.id) chasers++;
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
        if (pickup.type === 'rpg') return BOT_SETTINGS.rpgValue;
        if (pickup.type === 'health_potion') {
            return 45 + (this.player.health < 70 ? 25 : 0) + (inv.count('health_potion') === 0 ? 15 : 0);
        }
        if (!inv.needsAmmo()) return 10;
        const primary = this.ammoOf(WEAPON_SLOT.PRIMARY);
        const left = primary ? primary.mag + primary.reserve : 0;
        return left < 20 ? 60 : 35;
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

    // With a rifle or sniper, climb a sniper tower when things are quiet and hold it for a while
    updateSniper(target, targetDist) {
        const bot = this.player;
        const kind = this.weapon?.kind;
        const longGun = kind === WEAPON_KIND.SNIPER || kind === WEAPON_KIND.RIFLE;
        const ammo = this.ammoOf(WEAPON_SLOT.PRIMARY);
        const rounds = ammo ? ammo.mag + ammo.reserve : 0;
        if (!this.sniper && this.now >= this.sniperThinkAt) {
            this.sniperThinkAt = this.now + BOT_SETTINGS.sniperThink;
            const quiet = !target || targetDist > 10;
            if (quiet && longGun && rounds >= 10 && bot.health >= 50 && this.rng() < BOT_SETTINGS.sniperChance) {
                const perch = this.freePerch();
                if (perch) this.sniper = { perch, until: this.now + rand(this.rng, BOT_SETTINGS.sniperStay) };
            }
        }
        if (!this.sniper) return null;
        if (this.now > this.sniper.until || !longGun || rounds < 3 || bot.health < 40) {
            this.sniper = null;
            return null;
        }

        const { x, z, y } = this.sniper.perch;
        const onPerch = Math.hypot(x - bot.x, z - bot.z) < 0.8 && bot.y >= y - 0.1;
        if (!onPerch) return this.faceMovement(this.followPath(x, z));
        // Hold the perch and shoot whoever is visible
        const victim = this.sniperTarget();
        if (victim) {
            const d = Math.hypot(victim.x - bot.x, victim.z - bot.z);
            bot.yaw = yawTowards(victim.x - bot.x, victim.z - bot.z);
            this.shoot(victim, d);
        }
        return idle();
    }

    freePerch() {
        const bot = this.player;
        const taken = new Set();
        for (const b of this.room.bots.values()) {
            if (b !== this && b.sniper) taken.add(`${b.sniper.perch.ix},${b.sniper.perch.iz}`);
        }
        let best = null;
        let bestDist = Infinity;
        for (const perch of this.room.map.landmarks?.sniperPerches ?? []) {
            if (taken.has(`${perch.ix},${perch.iz}`)) continue;
            if (this.arena.surfaceHeight(perch.ix, perch.iz) !== perch.y) continue; // chopped up
            const c = this.arena.tileCenter(perch.ix, perch.iz);
            const d = Math.hypot(c.x - bot.x, c.z - bot.z);
            if (d < bestDist) {
                bestDist = d;
                best = { ...perch, x: c.x, z: c.z };
            }
        }
        return best;
    }

    sniperTarget() {
        const bot = this.player;
        let best = null;
        let bestDist = BOT_SETTINGS.sniperRange;
        for (const other of this.room.players.values()) {
            if (!other.alive || !this.room.mode.isEnemy(bot, other)) continue;
            const d = Math.hypot(other.x - bot.x, other.z - bot.z);
            if (d < bestDist && this.hasLineOfSight(other)) {
                best = other;
                bestDist = d;
            }
        }
        return best;
    }

    // ---- movement -----------------------------------------------------------------------

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
            this.path = this.pathfinder.find({ ...this.arena.tileAt(bot.x, bot.z), y: bot.y }, goal);
            this.pathKey = key;
            this.replanAt = this.now + BOT_SETTINGS.replanInterval;
        }
        if (!this.path) return this.moveDirect(x, z);

        // Only on the ground: turning for the next waypoint in mid-jump can carry the bot past
        // the edge it was jumping onto (and a fall hurts)
        while (this.path.length && bot.onGround) {
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
        // Jump up only once moving towards the step: jumping with the run still carrying us the
        // other way (round a corner at the top of the stairs) flies past it and down the side
        const speed = Math.hypot(bot.vx, bot.vz);
        const heading = speed > 1 ? (bot.vx * dx + bot.vz * dz) / (speed * d) : 1;
        const jump = bot.onGround && waypoint.y > bot.y + 0.3 && d < 1.3 && heading > 0.8;
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
        const side = this.jukeSide();
        const radial = dist > preferred + 0.4 ? 1 : dist < preferred - 0.4 ? -1 : 0;
        const wx = dx * radial + -dz * side * 0.6;
        const wz = dz * radial + dx * side * 0.6;
        const len = Math.hypot(wx, wz);
        return len > 0.01 ? this.steer(wx / len, wz / len) : idle();
    }

    // Side-step while shooting, away from teammates standing too close
    strafe(target, dist, amount) {
        const dx = (target.x - this.player.x) / (dist || 1);
        const dz = (target.z - this.player.z) / (dist || 1);
        const side = this.jukeSide();
        const sep = this.separation();
        const w = BOT_SETTINGS.separation.weight;
        const wx = -dz * side + sep.x * w;
        const wz = dx * side + sep.z * w;
        const len = Math.hypot(wx, wz) || 1;
        const input = this.steer(wx / len, wz / len);
        return { moveX: input.moveX * amount, moveZ: input.moveZ * amount, jump: false };
    }

    // Under fire: full-speed side-steps on an uneven rhythm, now and then a hop or a duck as the
    // direction changes, so the crosshair has to keep chasing
    evade(target, dist) {
        const j = BOT_SETTINGS.juke;
        const flipAt = this.jukeFlipAt;
        const input = this.strafe(target, dist, 1);
        if (this.jukeFlipAt !== flipAt) {
            const r = this.rng();
            input.jump = r < j.hop && this.player.onGround;
            if (!input.jump && r < j.hop + j.duck) this.duckUntil = this.now + 0.35;
        }
        input.crouch = this.now < this.duckUntil;
        return input;
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
}
