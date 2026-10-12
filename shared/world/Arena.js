import { ARENA, BLOCK } from '../constants.js';

export const TILE = Object.freeze({ SOLID: 0, CRACKING: 1, BROKEN: 2 });

// A single-layer floor of blocks. Tile (ix, iz) covers world x in [ix + min, ix + min + 1),
// z likewise, and y in [-1, 0]; players stand at y = 0.
export class Arena {
    constructor(size = ARENA.size) {
        this.size = size;
        this.min = -size / 2;
        this.tiles = new Uint8Array(size * size);
        this.timers = new Map();     // tile index -> { at, next } pending state change
        this.lastBreak = new Map();  // tile index -> { by, time } for fall kill credit
    }

    index(ix, iz) {
        return iz * this.size + ix;
    }

    inBounds(ix, iz) {
        return ix >= 0 && iz >= 0 && ix < this.size && iz < this.size;
    }

    tileAt(x, z) {
        return { ix: Math.floor(x - this.min), iz: Math.floor(z - this.min) };
    }

    tileCenter(ix, iz) {
        return { x: ix + this.min + 0.5, z: iz + this.min + 0.5 };
    }

    getTile(ix, iz) {
        return this.inBounds(ix, iz) ? this.tiles[this.index(ix, iz)] : TILE.BROKEN;
    }

    // Cracking blocks still hold you up until they break
    isSolidTile(ix, iz) {
        return this.getTile(ix, iz) !== TILE.BROKEN;
    }

    isSolidAt(x, z) {
        const { ix, iz } = this.tileAt(x, z);
        return this.isSolidTile(ix, iz);
    }

    // Solid and not about to break
    isSafeTile(ix, iz) {
        return this.getTile(ix, iz) === TILE.SOLID;
    }

    // Standing support for a body of the given radius (any corner over a block holds you)
    hasSupport(x, z, radius) {
        return this.isSolidAt(x - radius, z - radius) || this.isSolidAt(x + radius, z - radius) ||
            this.isSolidAt(x - radius, z + radius) || this.isSolidAt(x + radius, z + radius);
    }

    // Does a body's footprint overlap any block column (used to stop walking into hole walls)
    overlapsBlock(x, z, radius) {
        const a = this.tileAt(x - radius, z - radius);
        const b = this.tileAt(x + radius, z + radius);
        for (let ix = a.ix; ix <= b.ix; ix++) {
            for (let iz = a.iz; iz <= b.iz; iz++) {
                if (this.isSolidTile(ix, iz)) return true;
            }
        }
        return false;
    }

    startBreak(ix, iz, by, now) {
        if (this.getTile(ix, iz) !== TILE.SOLID) return false;
        const i = this.index(ix, iz);
        this.tiles[i] = TILE.CRACKING;
        this.timers.set(i, { at: now + BLOCK.breakDelay, next: TILE.BROKEN });
        this.lastBreak.set(i, { by, time: now });
        return true;
    }

    // Advance timers; returns [{ type: 'broken' | 'restored', ix, iz }]
    update(now) {
        const events = [];
        for (const [i, timer] of this.timers) {
            if (now < timer.at) continue;
            const ix = i % this.size;
            const iz = Math.floor(i / this.size);
            if (timer.next === TILE.BROKEN) {
                this.tiles[i] = TILE.BROKEN;
                this.timers.set(i, { at: now + BLOCK.regrowDelay, next: TILE.SOLID });
                events.push({ type: 'broken', ix, iz });
            } else {
                this.tiles[i] = TILE.SOLID;
                this.timers.delete(i);
                events.push({ type: 'restored', ix, iz });
            }
        }
        return events;
    }

    breakerOf(ix, iz, now, window) {
        const record = this.lastBreak.get(this.index(ix, iz));
        return record && now - record.time <= window ? record.by : null;
    }

    // First block hit by a ray within maxDist: { ix, iz, distance, point } or null
    raycast(origin, dir, maxDist) {
        const step = 0.05;
        for (let t = 0; t <= maxDist; t += step) {
            const y = origin.y + dir.y * t;
            if (y > 0 || y < -1) continue;
            const x = origin.x + dir.x * t;
            const z = origin.z + dir.z * t;
            const { ix, iz } = this.tileAt(x, z);
            if (this.isSolidTile(ix, iz)) return { ix, iz, distance: t, point: { x, y, z } };
        }
        return null;
    }

    // Random tile that is safe to stand on, preferring tiles far from the given points
    findSpawnTile(rng, avoid = [], attempts = 24) {
        let best = null;
        let bestScore = -Infinity;
        for (let n = 0; n < attempts; n++) {
            const ix = 2 + Math.floor(rng() * (this.size - 4));
            const iz = 2 + Math.floor(rng() * (this.size - 4));
            if (!this.isSafeTile(ix, iz)) continue;
            const c = this.tileCenter(ix, iz);
            const nearest = avoid.reduce((m, p) => Math.min(m, Math.hypot(p.x - c.x, p.z - c.z)), 99);
            if (nearest > bestScore) {
                bestScore = nearest;
                best = { ix, iz };
            }
        }
        if (best) return best;
        // Fallback: scan for any safe tile
        for (let i = 0; i < this.tiles.length; i++) {
            if (this.tiles[i] === TILE.SOLID) return { ix: i % this.size, iz: Math.floor(i / this.size) };
        }
        return null;
    }

    toJSON() {
        const changed = [];
        for (let i = 0; i < this.tiles.length; i++) {
            if (this.tiles[i] !== TILE.SOLID) changed.push([i, this.tiles[i]]);
        }
        return { size: this.size, changed };
    }

    static fromJSON(data) {
        const arena = new Arena(data.size);
        for (const [i, state] of data.changed) arena.tiles[i] = state;
        return arena;
    }

    // Client-side mirror updates (the server owns the timers)
    setTile(ix, iz, state) {
        if (this.inBounds(ix, iz)) this.tiles[this.index(ix, iz)] = state;
    }
}
