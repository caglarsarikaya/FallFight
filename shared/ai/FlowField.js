import { MAX_DROP } from '../world/Arena.js';

// One breadth-first search from every living target at once, over every place a player can stand
// (a tile column plus a standing height, so a house floor and its roof are different places), with
// the same moves as the pathfinder: climb 1, drop up to MAX_DROP. Each follower then just steps to
// its lowest-distance neighbour, so the cost is one pass over the map per update however many
// zombies are chasing. Arrays are allocated once and reused.
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
export const UNREACHED = 0xffff;

export class FlowField {
    constructor(arena) {
        this.arena = arena;
        const n = arena.size * arena.size * arena.height;
        this.dist = new Uint16Array(n).fill(UNREACHED);
        this.standable = new Uint8Array(n);
        this.queue = new Int32Array(n);
    }

    index(ix, iz, y) {
        return (iz * this.arena.size + ix) * this.arena.height + y;
    }

    // Arena.levelNear, from the cached standable flags
    levelNear(ix, iz, y) {
        const { size, height } = this.arena;
        if (ix < 0 || iz < 0 || ix >= size || iz >= size) return -1;
        const base = (iz * size + ix) * height;
        for (let l = Math.min(y + 1, height - 1); l >= Math.max(0, y - MAX_DROP); l--) {
            if (this.standable[base + l]) return l;
        }
        return -1;
    }

    // targets: [{ x, y, z }] world positions (e.g. living humans)
    update(targets) {
        const { arena, dist, standable, queue } = this;
        const { size, height } = arena;
        dist.fill(UNREACHED);
        for (let iz = 0; iz < size; iz++) {
            for (let ix = 0; ix < size; ix++) {
                const base = (iz * size + ix) * height;
                for (let l = 0; l < height; l++) standable[base + l] = arena.isStandable(ix, l, iz) ? 1 : 0;
            }
        }
        let head = 0;
        let tail = 0;
        for (const t of targets) {
            const { ix, iz } = arena.tileAt(t.x, t.z);
            const y = this.levelNear(ix, iz, Math.round(t.y));
            if (y < 0) continue;
            const i = this.index(ix, iz, y);
            if (dist[i] === 0) continue;
            dist[i] = 0;
            queue[tail++] = i;
        }
        // Search backwards from the targets: who could step onto this spot?
        while (head < tail) {
            const i = queue[head++];
            const h = i % height;
            const col = (i - h) / height;
            const ix = col % size;
            const iz = (col - ix) / size;
            const d = dist[i] + 1;
            for (const [dx, dz] of DIRS) {
                const nx = ix + dx;
                const nz = iz + dz;
                if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
                const nbase = (nz * size + nx) * height;
                // Any standing height in the neighbour column from which a step lands here
                for (let nh = Math.max(0, h - 1); nh <= Math.min(height - 1, h + MAX_DROP); nh++) {
                    if (!standable[nbase + nh] || dist[nbase + nh] !== UNREACHED) continue;
                    if (this.levelNear(ix, iz, nh) !== h) continue;
                    if (dx && dz && (nh !== h || this.levelNear(ix, nz, nh) !== nh || this.levelNear(nx, iz, nh) !== nh)) continue;
                    dist[nbase + nh] = d;
                    queue[tail++] = nbase + nh;
                }
            }
        }
    }

    distanceAt(ix, iz, y) {
        const { size, height } = this.arena;
        if (ix < 0 || iz < 0 || ix >= size || iz >= size || y < 0 || y >= height) return UNREACHED;
        return this.dist[this.index(ix, iz, y)];
    }

    // Best spot to step to from feet position (ix, iz, y): { ix, iz, y } or null
    next(ix, iz, y) {
        const here = this.levelNear(ix, iz, Math.round(y));
        if (here < 0) return null;
        let best = null;
        let bestDist = this.distanceAt(ix, iz, here);
        for (const [dx, dz] of DIRS) {
            const ny = this.levelNear(ix + dx, iz + dz, here);
            if (ny < 0) continue;
            if (dx && dz && (ny !== here || this.levelNear(ix + dx, iz, here) !== here || this.levelNear(ix, iz + dz, here) !== here)) continue;
            const d = this.distanceAt(ix + dx, iz + dz, ny);
            if (d < bestDist) {
                bestDist = d;
                best = { ix: ix + dx, iz: iz + dz, y: ny };
            }
        }
        return best;
    }
}
