import { normalize, yawTowards } from '../../math.js';
import { weaponSpec } from '../../config/weapons.js';
import { Brain, rand } from '../../ai/Brain.js';
import { UNREACHED } from '../../ai/FlowField.js';
import { Pathfinder } from '../../ai/Pathfinder.js';
import { ZOMBIES } from './config.js';

const STUCK_TIME = 1.5;       // seconds without progress before it starts tearing through blocks
const DIRECT_RANGE = 2.5;     // close enough to walk straight at the target
const BREAK_REACH = 1.6;

const idle = () => ({ moveX: 0, moveZ: 0, jump: false, speedMul: 0 });

// A zombie: a bot that looks different (the senses, shooting, juking and dodging are the shared
// ./ai/Brain.js). It follows the shared flow field to the nearest human, picking among equally short
// roads by how busy they are, which side it likes and where others just fell, so a wave spreads
// out instead of walking single file into one trap. A share are flankers, who path round the side
// or behind. Close in, each comes from its own angle, keeps off the others, weaves when shot at and
// leaps the last few blocks. In reach it claws; stuck, it claws through blocks; a target standing
// just above it gets the floor clawed out from under them. Every move is checked against the ground
// just ahead, so it never walks off into a hole. Cheap on purpose: dozens of these run at once.
// A gunner (gunner: ZOMBIES.gunner) shoots at its target when it can see it in range, in short badly
// aimed bursts, from a distance it tries to keep.
export class ZombieBrain extends Brain {
    constructor(mode, player, { speed, damage, attackInterval, reach, gunner = null, giant = false }) {
        const b = ZOMBIES.brain;
        // The room's dice, looked up each roll (tests swap them)
        super(mode.room, player, () => mode.room.rng(), { ...b, ...(gunner || {}) });
        const rng = this.rng;
        this.mode = mode;
        this.speed = speed;
        this.damage = damage;
        this.attackInterval = attackInterval;
        this.reach = reach;
        this.gunner = gunner;
        this.giant = giant;
        this.dodgeChance = Math.min(b.dodgeChanceMax, b.dodgeChance + b.dodgeChancePerWave * (mode.wave - 1));
        this.nextAttackAt = this.now + 0.5;
        this.lastProgressAt = this.now;
        this.lastDistance = Infinity;
        this.nextBreakAt = 0;
        this.canSee = false;
        // Personality, rolled once
        this.side = rng() < 0.35 ? 0 : rng() < 0.5 ? -1 : 1;
        this.surroundAngle = (rng() * 2 - 1) * b.surround.spread;
        this.flanker = !giant && !gunner && rng() < b.flankers;
        this.flankPath = null;
        this.replanAt = this.now + rng() * b.flank.replan[1];   // staggered, so few plan on one tick
        this.pathfinder = this.flanker ? new Pathfinder(mode.room.arena) : null;
        this.lungeAt = this.now + rand(rng, b.lunge.cooldown);
        // The road choice (FlowField.next): bound once, nothing allocated per step
        this.toX = 0;
        this.toZ = 0;
        this.otherZombie = p => p.isZombie && p !== player;
        this.stepCost = (nx, nz, dx, dz) => {
            const crowd = this.room.crowd.countAt(nx, nz, this.otherZombie) * b.crowdCost;
            const side = this.side ? this.side * (this.toX * dz - this.toZ * dx) * b.sideCost / Math.hypot(dx, dz) : 0;
            return crowd - side + (this.mode.isDangerous(nx, nz) ? b.dangerCost : 0);
        };
    }

    update() {
        const z = this.player;
        if (!z.alive) return idle();
        const speedMul = this.speed / 5.2;
        const dodge = this.updateDodge();
        if (dodge) {
            dodge.speedMul = speedMul;
            return dodge;
        }
        const target = this.mode.nearestHuman(z);
        if (!target) return idle();

        const dx = target.x - z.x;
        const dz = target.z - z.z;
        const dist = Math.hypot(dx, dz);
        const dy = target.y - z.y;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        this.toX = nx;
        this.toZ = nz;
        z.yaw = yawTowards(dx, dz);
        if (this.gunner) this.gunnerShoot(target);

        // In reach: claw, edging in while keeping off the others round the target
        if (dist <= this.reach && Math.abs(dy) < 1.6) {
            if (this.now >= this.nextAttackAt) {
                this.nextAttackAt = this.now + this.attackInterval;
                this.mode.zombieAttack(z, target, this.damage);
            }
            return this.go(nx * 0.3, nz * 0.3, speedMul, 0.3) || idle();
        }

        // Track progress so a zombie walled in starts breaking through
        if (dist < this.lastDistance - 0.3) {
            this.lastDistance = dist;
            this.lastProgressAt = this.now;
        }
        if (this.now - this.lastProgressAt > STUCK_TIME) this.breakThrough(nx, nz);
        this.clawFloorUnder(target, dist, dy);

        const lunge = this.lunge(target, dist, dy, nx, nz, speedMul);
        if (lunge) return lunge;
        const mul = speedMul * this.packWait(target, dist);

        // Gunners fight from a distance: back off when you close in, weave once there
        if (this.gunner && this.canSee) {
            const [near, far] = this.gunner.keep;
            if (dist < near) return this.go(-nx, -nz, mul, 1) || this.flowStep(target, dist, dy, mul);
            if (dist <= far) {
                const j = this.juke(nx, nz, 0);
                return this.go(j.x, j.z, mul * 0.6, 0) || idle();
            }
        }

        // Close: straight at them (unless there's a hole in between), from this zombie's own angle
        const open = dist <= ZOMBIES.brain.surround.range && this.clearRun(target.x, target.z);
        if (open && dist <= DIRECT_RANGE && Math.abs(dy) < 1.2) {
            const move = this.go(nx, nz, mul);
            if (move) {
                move.jump = dy > 0.5 && z.onGround;
                return move;
            }
        }
        if (open && Math.abs(dy) < 0.6) {
            const a = this.surroundAngle;
            const ox = -nx * Math.cos(a) + nz * Math.sin(a);
            const oz = -nz * Math.cos(a) - nx * Math.sin(a);
            const sx = target.x + ox * 1.2 - z.x;
            const sz = target.z + oz * 1.2 - z.z;
            const sd = Math.hypot(sx, sz) || 1;
            const move = this.go(sx / sd, sz / sd, mul);
            if (move) return move;
        }
        if (this.flanker) {
            const move = this.flank(target, dist, mul);
            if (move) return move;
        }
        return this.flowStep(target, dist, dy, mul);
    }

    // Move along (wx, wz) with the others' push and, under fire, a weave mixed in. Falls back to
    // the plain direction if the mix would step off an edge; null if the plain one isn't safe
    // (so the caller tries another way rather than shuffling along the edge of a pit).
    go(wx, wz, speedMul, amount = 1) {
        const len = Math.hypot(wx, wz) || 1;
        const fx = wx / len;
        const fz = wz / len;
        if (!this.safe(fx, fz)) return null;
        const sep = this.separation();
        const w = this.profile.separation.weight;
        let mx = fx + sep.x * w;
        let mz = fz + sep.z * w;
        if (this.underFire()) {
            const ml = Math.hypot(mx, mz) || 1;
            const j = this.juke(mx / ml, mz / ml);
            mx = j.x;
            mz = j.z;
        }
        const ml = Math.hypot(mx, mz);
        if (ml > 1e-3 && this.safe(mx / ml, mz / ml)) {
            const m = Math.min(1, ml) * amount;
            return { moveX: (mx / ml) * m, moveZ: (mz / ml) * m, jump: false, speedMul };
        }
        return { moveX: fx * amount, moveZ: fz * amount, jump: false, speedMul };
    }

    // The flow field's next step towards the nearest human, by the road this zombie likes best
    flowStep(target, dist, dy, speedMul) {
        const z = this.player;
        const arena = this.arena;
        const here = arena.tileAt(z.x, z.z);
        const step = this.mode.flow.next(here.ix, here.iz, z.y, this.stepCost);
        if (!step) {
            // No path: edge towards them as far as the ground allows
            return this.go(this.toX, this.toZ, speedMul) || idle();
        }
        const c = arena.tileCenter(step.ix, step.iz);
        const sx = c.x - z.x;
        const sz = c.z - z.z;
        const sd = Math.hypot(sx, sz) || 1;
        const climb = z.onGround && step.y > z.y + 0.3 && sd < 1.4;
        // Climbing needs a straight run at the step; on the flat the weave and the push can mix in
        const move = climb ? (this.safe(sx / sd, sz / sd) ? { moveX: sx / sd, moveZ: sz / sd, jump: false, speedMul } : null)
            : this.go(sx, sz, speedMul);
        if (move) {
            move.jump = climb;
            return move;
        }
        // Cutting the corner would clip a hole: back to the middle of this tile first
        const m = arena.tileCenter(here.ix, here.iz);
        const mx = m.x - z.x;
        const mz = m.z - z.z;
        const md = Math.hypot(mx, mz);
        if (md < 0.08) return idle();
        return { moveX: mx / md, moveZ: mz / md, jump: false, speedMul: speedMul * Math.min(1, md * 3) };
    }

    // Flankers: from far off, path to a spot to the side of or behind the target (away from where the
    // rest of the pack comes from) instead of the shortest road. null to chase normally.
    flank(target, dist, speedMul) {
        const f = ZOMBIES.brain.flank;
        const z = this.player;
        const arena = this.arena;
        if (dist < f.closeIn) {
            this.flankPath = null;
            return null;
        }
        if (this.now >= this.replanAt) {
            this.replanAt = this.now + rand(this.rng, f.replan);
            this.flankPath = null;
            if (dist >= f.from) {
                const pack = this.mode.pack;
                let bx = target.x - (pack.n ? pack.x : z.x);
                let bz = target.z - (pack.n ? pack.z : z.z);
                const bl = Math.hypot(bx, bz) || 1;
                bx /= bl;
                bz /= bl;
                const side = this.side || 1;
                const d = rand(this.rng, f.distance);
                const goal = arena.tileAt(target.x + (-bz * side * 0.8 + bx * 0.6) * d, target.z + (bx * side * 0.8 + bz * 0.6) * d);
                const gy = arena.levelNear(goal.ix, goal.iz, Math.round(target.y), 3);
                if (gy !== null && arena.isStable(goal.ix, gy, goal.iz)) {
                    this.flankPath = this.pathfinder.find({ ...arena.tileAt(z.x, z.z), y: z.y }, { ...goal, y: gy }, f.maxNodes);
                }
            }
        }
        const path = this.flankPath;
        if (!path) return null;
        while (path.length && z.onGround) {
            const c = arena.tileCenter(path[0].ix, path[0].iz);
            if (Math.hypot(c.x - z.x, c.z - z.z) < 0.35 && Math.abs(path[0].y - z.y) < 0.6) path.shift();
            else break;
        }
        if (!path.length || !arena.isStable(path[0].ix, path[0].y, path[0].iz)) {
            this.flankPath = null;
            return null;
        }
        const waypoint = path[0];
        const c = arena.tileCenter(waypoint.ix, waypoint.iz);
        const sx = c.x - z.x;
        const sz = c.z - z.z;
        const sd = Math.hypot(sx, sz) || 1;
        if (!this.safe(sx / sd, sz / sd)) {
            this.flankPath = null;
            return null;
        }
        return { moveX: sx / sd, moveZ: sz / sd, jump: z.onGround && waypoint.y > z.y + 0.3 && sd < 1.4, speedMul };
    }

    // A leap at the target from a few blocks off, if the ground on the way holds
    lunge(target, dist, dy, nx, nz, speedMul) {
        const l = ZOMBIES.brain.lunge;
        const z = this.player;
        if (this.giant || this.gunner || this.now < this.lungeAt || !z.onGround) return null;
        if (dist < l.range[0] || dist > l.range[1] || Math.abs(dy) > 0.6) return null;
        if (!this.clearRun(target.x, target.z) || !this.hasLineOfSight(target)) return null;
        this.lungeAt = this.now + rand(this.rng, l.cooldown);
        const v = this.speed * l.speed;
        z.vx = nx * v;
        z.vz = nz * v;
        z.vy = l.up;
        z.onGround = false;
        return { moveX: nx, moveZ: nz, jump: false, speedMul };
    }

    // Ground all the way along the straight line to (x, z), every half block, and no wall at the
    // knees: walking (or leaping) straight there can't end in a pit
    clearRun(x, z) {
        const p = this.player;
        const dx = x - p.x;
        const dz = z - p.z;
        const d = Math.hypot(dx, dz);
        const steps = Math.ceil(d / 0.5);
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            if (!this.groundAt(p.x + dx * t, p.z + dz * t)) return false;
        }
        return d < 1e-3 || !this.arena.raycast({ x: p.x, y: p.y + 0.5, z: p.z }, { x: dx / d, y: 0, z: dz / d }, d);
    }

    // Facing an automatic gun far ahead of the pack: slow down so the others catch up
    packWait(target, dist) {
        const p = ZOMBIES.brain.packWait;
        const pack = this.mode.pack;
        if (!pack.n || dist > 25 || !weaponSpec(target.inventory.selectedId)?.auto) return 1;
        const packDist = Math.hypot(target.x - pack.x, target.z - pack.z);
        if (packDist - dist < p.lead) return 1;
        let friends = 0;
        this.room.crowd.forNeighbours(this.player, 3, o => {
            if (o.isZombie) friends++;
        });
        return friends >= p.friends ? 1 : p.slow;
    }

    // Gunners: fire at the target if it's in range and in sight (not behind blocks or smoke)
    gunnerShoot(target) {
        const z = this.player;
        const eye = z.eye;
        const to = { x: target.x - eye.x, y: target.y + 1.15 - eye.y, z: target.z - eye.z };
        const dist = Math.hypot(to.x, to.y, to.z);
        this.canSee = dist <= this.gunner.range && !this.arena.raycast(eye, normalize(to), dist) && !this.room.smokeBlocks(eye, to);
        if (!this.canSee) {
            this.seenTargetId = null;
            return;
        }
        const id = z.inventory.selectedId;
        const spec = weaponSpec(id);
        const ammo = z.inventory.ammo[id];
        if (!spec || !ammo || z.gun.reload) return;
        ammo.reserve = spec.reserve;   // never runs dry
        if (ammo.mag === 0) {
            this.room.reload(z);
            return;
        }
        this.shoot(target, dist);
    }

    // Claw at the block in front (at chest height, then feet height)
    breakThrough(nx, nz) {
        if (this.now < this.nextBreakAt) return;
        this.nextBreakAt = this.now + 0.8;
        const z = this.player;
        const arena = this.arena;
        for (const height of [1.2, 0.4]) {
            const origin = { x: z.x, y: z.y + height, z: z.z };
            const block = arena.raycast(origin, { x: nx, y: 0, z: nz }, BREAK_REACH);
            if (block && arena.isBreakable(block.ix, block.iy, block.iz)) {
                this.room.breakBlock(block.ix, block.iy, block.iz, z);
                this.lastProgressAt = this.now;
                return;
            }
        }
    }

    // Someone standing out of reach just above us (on a ledge or a short pillar we can't get up):
    // claw out the block they stand on, so they come down to us
    clawFloorUnder(target, dist, dy) {
        if (dy < 1.5 || dy > 3.5 || dist > 2.2 || this.now < this.nextBreakAt) return;
        const z = this.player;
        const arena = this.arena;
        const here = arena.tileAt(z.x, z.z);
        const flow = this.mode.flow;
        if (flow.distanceAt(here.ix, here.iz, flow.levelNear(here.ix, here.iz, Math.round(z.y))) !== UNREACHED) return;
        const under = arena.supportBlock(target.x, target.y, target.z, 0);
        if (!under || !arena.isBreakable(under.ix, under.iy, under.iz)) return;
        const c = arena.blockCenter(under.ix, under.iy, under.iz);
        const eye = z.eye;
        if (Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z) > BREAK_REACH + 0.9) return;
        this.nextBreakAt = this.now + 0.8;
        this.room.breakBlock(under.ix, under.iy, under.iz, z);
    }
}
