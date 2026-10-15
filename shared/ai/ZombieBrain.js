import { normalize, yawTowards } from '../math.js';

const STUCK_TIME = 1.5;       // seconds without progress before it starts tearing through blocks
const DIRECT_RANGE = 2.5;     // close enough to walk straight at the target
const BREAK_REACH = 1.6;

const idle = () => ({ moveX: 0, moveZ: 0, jump: false, speedMul: 0 });

// A zombie: follow the shared flow field to the nearest human, claw them when in reach, and
// claw through blocks when stuck. Cheap on purpose: dozens of these run at once.
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
            return { moveX: dx / (dist || 1) * 0.3, moveZ: dz / (dist || 1) * 0.3, jump: false, speedMul };
        }

        // Track progress so a zombie walled in starts breaking through
        if (dist < this.lastDistance - 0.3) {
            this.lastDistance = dist;
            this.lastProgressAt = this.room.time;
        }
        if (this.room.time - this.lastProgressAt > STUCK_TIME) this.breakThrough(dx, dz, dist);

        if (dist <= DIRECT_RANGE && Math.abs(dy) < 1.2) {
            return { moveX: dx / dist, moveZ: dz / dist, jump: dy > 0.5 && z.onGround, speedMul };
        }
        const arena = this.room.arena;
        const here = arena.tileAt(z.x, z.z);
        const step = this.mode.flow.next(here.ix, here.iz, z.y);
        if (!step) return { moveX: dx / (dist || 1), moveZ: dz / (dist || 1), jump: z.onGround && this.room.rng() < 0.02, speedMul };
        const c = arena.tileCenter(step.ix, step.iz);
        const sx = c.x - z.x;
        const sz = c.z - z.z;
        const sd = Math.hypot(sx, sz) || 1;
        return { moveX: sx / sd, moveZ: sz / sd, jump: z.onGround && step.y > z.y + 0.3 && sd < 1.4, speedMul };
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
