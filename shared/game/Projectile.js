import { ARENA, PLAYER, PROJECTILE } from '../constants.js';
import { rayBox } from '../math.js';

// A flying projectile (kept for future grenades). Simulated by the room; clients replay it from
// the spawn velocity.
export class Projectile {
    constructor({ id, ownerId, itemId, x, y, z, vx, vy, vz, born, power = 1 }) {
        Object.assign(this, { id, ownerId, itemId, x, y, z, vx, vy, vz, born, power });
    }

    // Advance one step. Returns { type: 'player', player, zone } | { type: 'block' } | { type: 'expired' } | null
    step(dt, room, now) {
        this.vy -= PROJECTILE.gravity * dt;
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
        if (this.y < ARENA.voidY || now - this.born > PROJECTILE.maxLife) return { type: 'expired' };
        return null;
    }

    moveTo(from, dir, t) {
        this.x = from.x + dir.x * t;
        this.y = from.y + dir.y * t;
        this.z = from.z + dir.z * t;
    }

    toJSON() {
        const { id, ownerId, itemId, x, y, z, vx, vy, vz, power } = this;
        return { id, ownerId, itemId, x, y, z, vx, vy, vz, power };
    }
}

// Which part of the body a hit at this height above the feet lands on
export function hitZone(height) {
    if (height >= PLAYER.zones.headFrom) return 'head';
    if (height >= PLAYER.zones.bodyFrom) return 'body';
    return 'legs';
}
