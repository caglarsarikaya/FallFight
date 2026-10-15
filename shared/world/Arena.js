import { BLOCK } from '../constants.js';
import { BLOCK_KIND, BREAKABLE, FLOOR_HP_SCALE, SOLID, blockProps } from './blocks.js';
import { DEFAULT_MAP, getMap } from './maps/index.js';

export { BLOCK_KIND };
export const BLOCK_STATE = Object.freeze({ SOLID: 0, CRACKING: 1, BROKEN: 2 });

const EPS = 1e-6;

// Voxel arena. Cell (ix, iy, iz) covers world x in [ix + min, ix + min + 1), z likewise, and
// y in [iy - 1, iy): layer 0 is the floor, so players standing on it have their feet at y = 0,
// and standing on top of block layer iy puts the feet at y = iy.
// Any block can crack, break and later regrow; the layout itself never changes.
// Built from a map definition (shared/world/maps/).
export class Arena {
    constructor(map = getMap(DEFAULT_MAP)) {
        const { id, size, height, layout, floor = 0 } = map;
        this.mapId = id;
        this.map = map;
        this.floor = floor;          // the block layer players normally stand on
        this.size = size;
        this.height = height;
        this.min = -size / 2;
        this.kinds = new Uint8Array(size * size * height);
        this.states = new Uint8Array(size * size * height);
        this.timers = new Map();     // voxel index -> { at, next }
        this.lastBreak = new Map();  // voxel index -> { by, time } for fall kill credit
        this.wear = new Map();       // voxel index -> bullet damage taken so far

        for (const box of layout) {
            for (let iy = box.y0; iy <= box.y1; iy++) {
                for (let iz = box.z0; iz <= box.z1; iz++) {
                    for (let ix = box.x0; ix <= box.x1; ix++) {
                        if (this.inBounds(ix, iy, iz)) this.kinds[this.index(ix, iy, iz)] = box.kind;
                    }
                }
            }
        }
        this.reachable = this.computeReachable();
    }

    // Columns a player can get onto from the floor (walking, jumping up 1, dropping down),
    // e.g. tower tops via their steps but not the tops of 2-high walls
    computeReachable() {
        const reachable = new Uint8Array(this.size * this.size);
        const queue = [];
        for (let iz = 0; iz < this.size; iz++) {
            for (let ix = 0; ix < this.size; ix++) {
                if (this.surfaceHeight(ix, iz) === this.floor) {
                    reachable[iz * this.size + ix] = 1;
                    queue.push([ix, iz]);
                }
            }
        }
        while (queue.length) {
            const [ix, iz] = queue.pop();
            const h = this.surfaceHeight(ix, iz);
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = ix + dx;
                const nz = iz + dz;
                if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size || reachable[nz * this.size + nx]) continue;
                const nh = this.surfaceHeight(nx, nz);
                if (nh !== null && nh - h <= 1) {
                    reachable[nz * this.size + nx] = 1;
                    queue.push([nx, nz]);
                }
            }
        }
        return reachable;
    }

    // ---- coordinates --------------------------------------------------------------------

    index(ix, iy, iz) {
        return (iy * this.size + iz) * this.size + ix;
    }

    coords(i) {
        const ix = i % this.size;
        const iz = Math.floor(i / this.size) % this.size;
        const iy = Math.floor(i / (this.size * this.size));
        return { ix, iy, iz };
    }

    inBounds(ix, iy, iz) {
        return ix >= 0 && iz >= 0 && iy >= 0 && ix < this.size && iz < this.size && iy < this.height;
    }

    cellAt(x, y, z) {
        return { ix: Math.floor(x - this.min), iy: Math.floor(y) + 1, iz: Math.floor(z - this.min) };
    }

    tileAt(x, z) {
        return { ix: Math.floor(x - this.min), iz: Math.floor(z - this.min) };
    }

    tileCenter(ix, iz) {
        return { x: ix + this.min + 0.5, z: iz + this.min + 0.5 };
    }

    blockCenter(ix, iy, iz) {
        return { x: ix + this.min + 0.5, y: iy - 0.5, z: iz + this.min + 0.5 };
    }

    // ---- block queries -------------------------------------------------------------------

    kindAt(ix, iy, iz) {
        return this.inBounds(ix, iy, iz) ? this.kinds[this.index(ix, iy, iz)] : BLOCK_KIND.AIR;
    }

    stateAt(ix, iy, iz) {
        return this.inBounds(ix, iy, iz) ? this.states[this.index(ix, iy, iz)] : BLOCK_STATE.BROKEN;
    }

    // Cracking blocks still hold you up until they break. Water is not solid.
    isSolid(ix, iy, iz) {
        if (!this.inBounds(ix, iy, iz)) return false;
        const i = this.index(ix, iy, iz);
        return SOLID[this.kinds[i]] === 1 && this.states[i] !== BLOCK_STATE.BROKEN;
    }

    isWater(ix, iy, iz) {
        return this.kindAt(ix, iy, iz) === BLOCK_KIND.WATER;
    }

    isWaterAt(x, y, z) {
        const { ix, iy, iz } = this.cellAt(x, y, z);
        return this.isWater(ix, iy, iz);
    }

    isBreakable(ix, iy, iz) {
        return BREAKABLE[this.kindAt(ix, iy, iz)] === 1;
    }

    // Grip of the ground under a point (ice is slippery); 1 in the air or on normal ground
    frictionAt(x, y, z) {
        const { ix, iy, iz } = this.cellAt(x, y - 0.05, z);
        return this.isSolid(ix, iy, iz) ? blockProps(this.kinds[this.index(ix, iy, iz)]).friction : 1;
    }

    // Solid and not about to break
    isStable(ix, iy, iz) {
        return this.isSolid(ix, iy, iz) && this.stateAt(ix, iy, iz) === BLOCK_STATE.SOLID;
    }

    isSolidAt(x, y, z) {
        const { ix, iy, iz } = this.cellAt(x, y, z);
        return this.isSolid(ix, iy, iz);
    }

    // Does an axis-aligned box overlap any solid block (max edges exclusive)
    boxCollides(minX, minY, minZ, maxX, maxY, maxZ) {
        const x0 = Math.floor(minX - this.min);
        const x1 = Math.floor(maxX - this.min - EPS);
        const y0 = Math.floor(minY) + 1;
        const y1 = Math.floor(maxY - EPS) + 1;
        const z0 = Math.floor(minZ - this.min);
        const z1 = Math.floor(maxZ - this.min - EPS);
        for (let iy = y0; iy <= y1; iy++) {
            for (let iz = z0; iz <= z1; iz++) {
                for (let ix = x0; ix <= x1; ix++) {
                    if (this.isSolid(ix, iy, iz)) return true;
                }
            }
        }
        return false;
    }

    // Feet height of the walkable surface of a column (top solid block with 2 free blocks above), or null
    surfaceHeight(ix, iz) {
        for (let iy = this.height - 1; iy >= 0; iy--) {
            if (!this.isSolid(ix, iy, iz)) continue;
            if (this.isSolid(ix, iy + 1, iz) || this.isSolid(ix, iy + 2, iz)) return null;
            return iy;
        }
        return null;
    }

    // The block a body of the given radius is standing on (centre first, then its corners)
    supportBlock(x, y, z, radius) {
        const iy = Math.floor(y - 0.05) + 1;
        for (const [dx, dz] of [[0, 0], [-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]]) {
            const { ix, iz } = this.tileAt(x + dx, z + dz);
            if (this.isSolid(ix, iy, iz)) return { ix, iy, iz };
        }
        return null;
    }

    // ---- breaking ---------------------------------------------------------------------------

    startBreak(ix, iy, iz, by, now) {
        if (!this.isStable(ix, iy, iz) || !this.isBreakable(ix, iy, iz)) return false;
        const i = this.index(ix, iy, iz);
        this.states[i] = BLOCK_STATE.CRACKING;
        this.timers.set(i, { at: now + BLOCK.breakDelay, next: BLOCK_STATE.BROKEN });
        this.lastBreak.set(i, { by, time: now });
        return true;
    }

    // Bullets wear blocks down. Returns true when this hit used up the block's HP (it should break).
    damageBlock(ix, iy, iz, amount) {
        if (!this.isStable(ix, iy, iz) || !this.isBreakable(ix, iy, iz)) return false;
        const i = this.index(ix, iy, iz);
        const hp = blockProps(this.kinds[i]).hp * (iy <= this.floor ? FLOOR_HP_SCALE : 1);
        const wear = (this.wear.get(i) || 0) + amount;
        if (wear >= hp) {
            this.wear.delete(i);
            return true;
        }
        this.wear.set(i, wear);
        return false;
    }

    // Advance timers. isOccupied(ix, iy, iz) postpones regrowing a block someone is standing in.
    // Returns [{ type: 'broken' | 'restored', ix, iy, iz }]
    update(now, isOccupied = () => false) {
        const events = [];
        for (const [i, timer] of this.timers) {
            if (now < timer.at) continue;
            const { ix, iy, iz } = this.coords(i);
            if (timer.next === BLOCK_STATE.BROKEN) {
                this.states[i] = BLOCK_STATE.BROKEN;
                this.timers.set(i, { at: now + BLOCK.regrowDelay, next: BLOCK_STATE.SOLID });
                events.push({ type: 'broken', ix, iy, iz });
            } else if (isOccupied(ix, iy, iz)) {
                timer.at = now + 1;
            } else {
                this.states[i] = BLOCK_STATE.SOLID;
                this.timers.delete(i);
                this.wear.delete(i);
                events.push({ type: 'restored', ix, iy, iz });
            }
        }
        return events;
    }

    breakerOf(block, now, window) {
        if (!block) return null;
        const record = this.lastBreak.get(this.index(block.ix, block.iy, block.iz));
        return record && now - record.time <= window ? record.by : null;
    }

    // ---- raycast ----------------------------------------------------------------------------

    // First solid block along a ray (voxel DDA): { ix, iy, iz, distance, point } or null
    raycast(origin, dir, maxDist) {
        const gx = origin.x - this.min;
        const gy = origin.y + 1;
        const gz = origin.z - this.min;
        let ix = Math.floor(gx);
        let iy = Math.floor(gy);
        let iz = Math.floor(gz);
        const step = [Math.sign(dir.x), Math.sign(dir.y), Math.sign(dir.z)];
        const delta = [dir.x, dir.y, dir.z].map(d => (d === 0 ? Infinity : Math.abs(1 / d)));
        const next = [
            dir.x > 0 ? (ix + 1 - gx) / dir.x : dir.x < 0 ? (gx - ix) / -dir.x : Infinity,
            dir.y > 0 ? (iy + 1 - gy) / dir.y : dir.y < 0 ? (gy - iy) / -dir.y : Infinity,
            dir.z > 0 ? (iz + 1 - gz) / dir.z : dir.z < 0 ? (gz - iz) / -dir.z : Infinity
        ];
        let t = 0;
        for (let n = 0; n < 256 && t <= maxDist; n++) {
            if (this.isSolid(ix, iy, iz)) {
                return {
                    ix, iy, iz,
                    distance: t,
                    point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t }
                };
            }
            const axis = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : (next[1] < next[2] ? 1 : 2);
            t = next[axis];
            next[axis] += delta[axis];
            if (axis === 0) ix += step[0];
            else if (axis === 1) iy += step[1];
            else iz += step[2];
        }
        return null;
    }

    // Distance along a ray (origin inside or entering the cell) at which it leaves the cell
    cellExit(ix, iy, iz, origin, dir) {
        const lo = [ix + this.min, iy - 1, iz + this.min];
        const o = [origin.x, origin.y, origin.z];
        const d = [dir.x, dir.y, dir.z];
        let exit = Infinity;
        for (let a = 0; a < 3; a++) {
            if (d[a] > 1e-9) exit = Math.min(exit, (lo[a] + 1 - o[a]) / d[a]);
            else if (d[a] < -1e-9) exit = Math.min(exit, (lo[a] - o[a]) / d[a]);
        }
        return Math.max(0, exit);
    }

    // ---- spawning -------------------------------------------------------------------------

    // Random stable, reachable surface far from the given points: { ix, iz, y } or null.
    // maxY limits how high it may be (players spawn on the floor, pickups anywhere);
    // zones (tile rectangles { x0, x1, z0, z1 }) limit where, e.g. a team's base.
    findSpawn(rng, avoid = [], { maxY = Infinity, attempts = 40, zones = null } = {}) {
        let best = null;
        let bestScore = -Infinity;
        for (let n = 0; n < attempts; n++) {
            let ix;
            let iz;
            if (zones?.length) {
                const zone = zones[Math.floor(rng() * zones.length)];
                ix = zone.x0 + Math.floor(rng() * (zone.x1 - zone.x0 + 1));
                iz = zone.z0 + Math.floor(rng() * (zone.z1 - zone.z0 + 1));
            } else {
                ix = 1 + Math.floor(rng() * (this.size - 2));
                iz = 1 + Math.floor(rng() * (this.size - 2));
            }
            const y = this.surfaceHeight(ix, iz);
            if (y === null || y > maxY || !this.isStable(ix, y, iz) || !this.reachable[iz * this.size + ix]) continue;
            const c = this.tileCenter(ix, iz);
            const nearest = avoid.reduce((m, p) => Math.min(m, Math.hypot(p.x - c.x, p.z - c.z)), 99);
            if (nearest > bestScore) {
                bestScore = nearest;
                best = { ix, iz, y };
            }
        }
        if (best) return best;
        for (let iz = 0; iz < this.size; iz++) {
            for (let ix = 0; ix < this.size; ix++) {
                const y = this.surfaceHeight(ix, iz);
                if (y !== null && y <= maxY && this.isStable(ix, y, iz)) return { ix, iz, y };
            }
        }
        return null;
    }

    // ---- sync -------------------------------------------------------------------------------

    toJSON() {
        const changed = [];
        for (let i = 0; i < this.states.length; i++) {
            if (this.states[i] !== BLOCK_STATE.SOLID) changed.push([i, this.states[i]]);
        }
        return { map: this.mapId, changed };
    }

    static fromJSON(data) {
        const arena = new Arena(getMap(data.map) || getMap(DEFAULT_MAP));
        for (const [i, state] of data.changed) arena.states[i] = state;
        return arena;
    }

    // Client-side mirror updates (the server owns the timers)
    setState(ix, iy, iz, state) {
        if (this.inBounds(ix, iy, iz)) this.states[this.index(ix, iy, iz)] = state;
    }
}
