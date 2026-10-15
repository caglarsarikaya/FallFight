import { PLAYER } from '../constants.js';
import { normalize, yawTowards } from '../math.js';
import { MAX_DROP } from '../world/Arena.js';

const STUCK_TIME = 1.5;       // seconds without progress before it starts tearing through blocks
const DIRECT_RANGE = 2.5;     // close enough to walk straight at the target
const BREAK_REACH = 1.6;
const LOOK_AHEAD = PLAYER.radius + 0.35;   // how far ahead the ground is checked

const idle = () => ({ moveX: 0, moveZ: 0, jump: false, speedMul: 0 });

// A zombie: follow the shared flow field to the nearest human, claw them when in reach, and
// claw through blocks when stuck. Never walks off into a hole: every move is checked against the
// ground just ahead. Cheap on purpose: dozens of these run at once.
export class ZombieBrain {
    constructor(mode, player, { speed, damage, attackInterval, reach }) {
        this.mode = mode;
        this.room = mode.room;
        this.player = player;
        this.speed = speed;
        this.damage = damage;
        this.attackInterval = attackInterval;
        this.reach = reach;
        this.nextAttackAt = this.room.time + 0.5;
        this.lastProgressAt = this.room.time;
        this.lastDistance = Infinity;
        this.nextBreakAt = 0;
    }

    update() {
        const z = this.player;
        if (!z.alive) return idle();
        const target = this.mode.nearestHuman(z);
        const speedMul = this.speed / 5.2;
        if (!target) return idle();

        const dx = target.x - z.x;
        const dz = target.z - z.z;
        const dist = Math.hypot(dx, dz);
        const dy = target.y - z.y;
        z.yaw = yawTowards(dx, dz);

        // In reach: claw
        if (dist <= this.reach && Math.abs(dy) < 1.6) {
            if (this.room.time >= this.nextAttackAt) {
                this.nextAttackAt = this.room.time + this.attackInterval;
                this.mode.zombieAttack(z, target, this.damage);
            }
            const nx = dx / (dist || 1);
            const nz = dz / (dist || 1);
            return this.safe(nx, nz) ? { moveX: nx * 0.3, moveZ: nz * 0.3, jump: false, speedMul } : idle();
        }

        // Track progress so a zombie walled in starts breaking through
        if (dist < this.lastDistance - 0.3) {
            this.lastDistance = dist;
            this.lastProgressAt = this.room.time;
        }
        if (this.room.time - this.lastProgressAt > STUCK_TIME) this.breakThrough(dx, dz, dist);

        // Close: straight at them, unless there's a hole in between
        if (dist <= DIRECT_RANGE && Math.abs(dy) < 1.2 && this.safe(dx / dist, dz / dist)) {
            return { moveX: dx / dist, moveZ: dz / dist, jump: dy > 0.5 && z.onGround, speedMul };
        }
        const arena = this.room.arena;
        const here = arena.tileAt(z.x, z.z);
        const step = this.mode.flow.next(here.ix, here.iz, z.y);
        if (!step) {
            // No path: edge towards them as far as the ground allows
            const nx = dx / (dist || 1);
            const nz = dz / (dist || 1);
            return this.safe(nx, nz) ? { moveX: nx, moveZ: nz, jump: false, speedMul } : idle();
        }
        const c = arena.tileCenter(step.ix, step.iz);
        const sx = c.x - z.x;
        const sz = c.z - z.z;
        const sd = Math.hypot(sx, sz) || 1;
        if (this.safe(sx / sd, sz / sd)) {
            return { moveX: sx / sd, moveZ: sz / sd, jump: z.onGround && step.y > z.y + 0.3 && sd < 1.4, speedMul };
        }
        // Cutting the corner would clip a hole: back to the middle of this tile first
        const m = arena.tileCenter(here.ix, here.iz);
        const mx = m.x - z.x;
        const mz = m.z - z.z;
        const md = Math.hypot(mx, mz);
        if (md < 0.08) return idle();
        return { moveX: mx / md, moveZ: mz / md, jump: false, speedMul: speedMul * Math.min(1, md * 3) };
    }

    // Is there ground (or a wall) just ahead in direction (nx, nz)? Checks straight ahead and both
    // shoulders. A pit, the map edge or a cracking block over nothing counts as a fall.
    safe(nx, nz) {
        const z = this.player;
        const r = PLAYER.radius * 0.9;
        const ax = z.x + nx * LOOK_AHEAD;
        const az = z.z + nz * LOOK_AHEAD;
        return this.groundAt(ax, az) && this.groundAt(ax - nz * r, az + nx * r) && this.groundAt(ax + nz * r, az - nx * r);
    }

    groundAt(x, zPos) {
        const arena = this.room.arena;
        const { ix, iz } = arena.tileAt(x, zPos);
        const y = Math.round(this.player.y);
        for (let l = y + 2; l >= Math.max(0, y - MAX_DROP); l--) {
            if (!arena.isSolid(ix, l, iz)) continue;
            return l > y || arena.isStable(ix, l, iz);   // above the feet: a wall, which just stops us
        }
        return false;
    }

    // Claw at the block in front (at chest height, then feet height)
    breakThrough(dx, dz, dist) {
        if (this.room.time < this.nextBreakAt) return;
        this.nextBreakAt = this.room.time + 0.8;
        const z = this.player;
        const arena = this.room.arena;
        for (const height of [1.2, 0.4]) {
            const origin = { x: z.x, y: z.y + height, z: z.z };
            const dir = normalize({ x: dx / (dist || 1), y: 0, z: dz / (dist || 1) });
            const block = arena.raycast(origin, dir, BREAK_REACH);
            if (block && arena.isBreakable(block.ix, block.iy, block.iz)) {
                this.room.breakBlock(block.ix, block.iy, block.iz, z);
                this.lastProgressAt = this.room.time;
                return;
            }
        }
    }
}
