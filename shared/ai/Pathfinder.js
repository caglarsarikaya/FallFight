// A* over the places a player can stand. A node is a tile column plus a standing height, so the
// floor inside a house and its roof are different nodes. Moves: walk to the same height, jump up 1,
// or drop down at most MAX_DROP (see Arena.levelNear).
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

export class Pathfinder {
    constructor(arena) {
        this.arena = arena;
    }

    // Standing height at a start position: { ix, iz, y? } with y the feet height when known
    startLevel(start) {
        const { arena } = this;
        if (start.y === undefined || start.y === null) return arena.surfaceHeight(start.ix, start.iz);
        return arena.levelNear(start.ix, start.iz, Math.round(start.y), 3);
    }

    // Returns waypoints [{ ix, iz, y }] from start (exclusive) to goal, or to the reachable spot
    // closest to the goal when it can't be reached. Returns [] when already there, null if stuck.
    // goal.y is optional: without it any height of the goal column will do.
    find(start, goal, maxNodes = 5000) {
        const { arena } = this;
        const size = arena.size;
        const height = arena.height;
        const key = (ix, iz, y) => (iz * size + ix) * height + y;
        const startH = this.startLevel(start);
        if (startH === null) return null;

        const open = new MinHeap();
        const closed = new Set();
        const came = new Map();
        const cost = new Map([[key(start.ix, start.iz, startH), 0]]);
        const goalY = goal.y ?? null;
        const heuristic = (ix, iz, y) => Math.hypot(ix - goal.ix, iz - goal.iz) + (goalY === null ? 0 : Math.abs(y - goalY) * 0.5);
        open.push({ ix: start.ix, iz: start.iz, y: startH }, heuristic(start.ix, start.iz, startH));
        let best = { ix: start.ix, iz: start.iz, y: startH, h: heuristic(start.ix, start.iz, startH) };

        for (let expanded = 0; open.size && expanded < maxNodes; expanded++) {
            const node = open.pop();
            const k = key(node.ix, node.iz, node.y);
            if (closed.has(k)) continue;
            closed.add(k);
            if (node.ix === goal.ix && node.iz === goal.iz && (goalY === null || node.y === goalY)) return this.build(came, node, key);
            const h = heuristic(node.ix, node.iz, node.y);
            if (h < best.h) best = { ...node, h };

            for (const [dx, dz] of DIRS) {
                const nx = node.ix + dx;
                const nz = node.iz + dz;
                if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
                const nh = arena.levelNear(nx, nz, node.y);
                if (nh === null) continue;
                if (dx && dz) {
                    // Diagonals only across flat ground, so bots don't clip corners
                    if (nh !== node.y || arena.levelNear(node.ix + dx, node.iz, node.y) !== node.y || arena.levelNear(node.ix, node.iz + dz, node.y) !== node.y) continue;
                }
                let step = dx && dz ? Math.SQRT2 : 1;
                if (nh > node.y) step += 0.6;                               // jumping is slower
                if (!arena.isStable(nx, nh, nz)) step += 8;                 // avoid cracking blocks
                const nk = key(nx, nz, nh);
                const next = cost.get(k) + step;
                if (next < (cost.get(nk) ?? Infinity)) {
                    cost.set(nk, next);
                    came.set(nk, node);
                    open.push({ ix: nx, iz: nz, y: nh }, next + heuristic(nx, nz, nh));
                }
            }
        }
        if (best.ix === start.ix && best.iz === start.iz && best.y === startH) return [];
        return this.build(came, best, key);
    }

    build(came, node, key) {
        const path = [];
        let current = node;
        while (current && came.has(key(current.ix, current.iz, current.y))) {
            path.push({ ix: current.ix, iz: current.iz, y: current.y });
            current = came.get(key(current.ix, current.iz, current.y));
        }
        return path.reverse();
    }
}

class MinHeap {
    constructor() {
        this.items = [];
    }

    get size() {
        return this.items.length;
    }

    push(value, priority) {
        const items = this.items;
        items.push({ value, priority });
        let i = items.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (items[parent].priority <= items[i].priority) break;
            [items[parent], items[i]] = [items[i], items[parent]];
            i = parent;
        }
    }

    pop() {
        const items = this.items;
        const top = items[0];
        const last = items.pop();
        if (items.length) {
            items[0] = last;
            let i = 0;
            for (;;) {
                const l = i * 2 + 1;
                const r = l + 1;
                let m = i;
                if (l < items.length && items[l].priority < items[m].priority) m = l;
                if (r < items.length && items[r].priority < items[m].priority) m = r;
                if (m === i) break;
                [items[m], items[i]] = [items[i], items[m]];
                i = m;
            }
        }
        return top.value;
    }
}
