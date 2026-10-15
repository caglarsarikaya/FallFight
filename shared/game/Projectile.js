import { ARENA, PLAYER, PROJECTILE } from '../constants.js';
import { rayBox } from '../math.js';

// A flying projectile (rockets, grenades). Simulated by the room; clients replay it from the
// spawn velocity. life: seconds before it expires in the air.
// Grenades (bounce > 0) ignore players, bounce off blocks and go off after `fuse` seconds.
export class Projectile {
    constructor({ id, ownerId, itemId, x, y, z, vx, vy, vz, born, power = 1, life = PROJECTILE.maxLife,
        gravity = PROJECTILE.gravity, bounce = 0, fuse = null }) {
        Object.assign(this, { id, ownerId, itemId, x, y, z, vx, vy, vz, born, power, life, gravity, bounce, fuse });
        this.resting = false;
    }

    // Advance one step. Returns { type: 'player', player, zone } | { type: 'block' } | { type: 'fuse' }
    // | { type: 'expired' } | null
    step(dt, room, now) {
        if (this.bounce > 0) {
            stepBouncing(this, dt, room.arena);
            if (this.y < ARENA.voidY) return { type: 'expired' };
            if (now - this.born >= this.fuse) return { type: 'fuse' };
            return null;
        }
        this.vy -= this.gravity * dt;
        const from = { x: this.x, y: this.y, z: this.z };
        const move = { x: this.vx * dt, y: this.vy * dt, z: this.vz * dt };
        const length = Math.hypot(move.x, move.y, move.z);
        const dir = { x: move.x / length, y: move.y / length, z: move.z / length };

        // Nearest player hit along this step's segment
        let best = null;
        for (const player of room.players.values()) {
            if (!player.alive || player.id === this.ownerId) continue;
            const { min, max } = player.bounds;
            const t = rayBox(from, dir, min, max, length);
            if (t !== null && (!best || t < best.t)) best = { t, player };
        }
        const block = room.arena.raycast(from, dir, length);

        if (best && (!block || best.t <= block.distance)) {
            this.moveTo(from, dir, best.t);
            return { type: 'player', player: best.player, zone: hitZone(this.y - best.player.y) };
        }
        if (block) {
            this.moveTo(from, dir, block.distance);
            return { type: 'block' };
        }

        this.x += move.x;
        this.y += move.y;
        this.z += move.z;
        if (this.y < ARENA.voidY || now - this.born > this.life) return { type: 'expired' };
        return null;
    }

    moveTo(from, dir, t) {
        this.x = from.x + dir.x * t;
        this.y = from.y + dir.y * t;
        this.z = from.z + dir.z * t;
    }

    toJSON() {
        const { id, ownerId, itemId, x, y, z, vx, vy, vz, power, gravity, bounce, fuse } = this;
        return { id, ownerId, itemId, x, y, z, vx, vy, vz, power, gravity, bounce, fuse };
    }
}

const SKIN = 0.03;   // how far from a face a bouncing projectile stops

// One step of a bouncing projectile (grenades) against the blocks only, so the client can replay
// it on its own copy of the arena. p: { x, y, z, vx, vy, vz, gravity, bounce, resting }.
// Returns true if it hit something this step (for the bounce sound).
export function stepBouncing(p, dt, arena) {
    if (p.resting) {
        if (arena.isSolidAt(p.x, p.y - SKIN * 3, p.z)) return false;
        p.resting = false;   // the floor under it broke
    }
    p.vy -= p.gravity * dt;
    let left = dt;
    let bounced = false;
    for (let i = 0; i < 3 && left > 0; i++) {
        const mx = p.vx * left;
        const my = p.vy * left;
        const mz = p.vz * left;
        const length = Math.hypot(mx, my, mz);
        if (length < 1e-6) break;
        const dir = { x: mx / length, y: my / length, z: mz / length };
        const hit = arena.raycast(p, dir, length);
        if (!hit) {
            p.x += mx;
            p.y += my;
            p.z += mz;
            break;
        }
        const t = Math.max(0, hit.distance - SKIN);
        p.x += dir.x * t;
        p.y += dir.y * t;
        p.z += dir.z * t;
        left *= 1 - hit.distance / length;
        bounced = true;
        // The face it hit: the axis where the hit point is furthest from the block's centre
        const c = arena.blockCenter(hit.ix, hit.iy, hit.iz);
        const dx = hit.point.x - c.x;
        const dy = hit.point.y - c.y;
        const dz = hit.point.z - c.z;
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        const az = Math.abs(dz);
        if (ay >= ax && ay >= az) {
            p.vy = -p.vy * p.bounce;
            p.vx *= 0.8;
            p.vz *= 0.8;
            // Landed: stop hopping, and come to rest once it has slid to a stop
            if (dy > 0 && Math.abs(p.vy) < 1.2) {
                p.vy = 0;
                if (Math.hypot(p.vx, p.vz) < 0.3) {
                    p.vx = p.vz = 0;
                    p.resting = true;
                    break;
                }
            }
        } else if (ax >= az) {
            p.vx = -p.vx * p.bounce;
            p.vy *= 0.8;
            p.vz *= 0.8;
        } else {
            p.vz = -p.vz * p.bounce;
            p.vx *= 0.8;
            p.vy *= 0.8;
        }
    }
    return bounced;
}

// Which part of the body a hit at this height above the feet lands on
export function hitZone(height) {
    if (height >= PLAYER.zones.headFrom) return 'head';
    if (height >= PLAYER.zones.bodyFrom) return 'body';
    return 'legs';
}
