// A* over the arena's walkable surfaces. A cell is a floor tile column with a standable surface
// height. Moves: walk to the same height, jump up 1, or drop down at most MAX_DROP.
const MAX_DROP = 3;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

export class Pathfinder {
    constructor(arena) {
        this.arena = arena;
    }

    height(ix, iz) {
        return this.arena.surfaceHeight(ix, iz);
    }

    canMove(fromH, toH) {
        return toH !== null && toH - fromH <= 1 && fromH - toH <= MAX_DROP;
    }

    // Returns waypoints [{ ix, iz, y }] from start (exclusive) to goal, or to the reachable cell
    // closest to the goal when it can't be reached. Returns [] when already there, null if stuck.
    find(start, goal, maxNodes = 5000) {
        const { arena } = this;
        const size = arena.size;
        const key = (ix, iz) => iz * size + ix;
        const startH = this.height(start.ix, start.iz);
        if (startH === null) return null;

        const open = new MinHeap();
        const closed = new Set();
        const came = new Map();
        const cost = new Map([[key(start.ix, start.iz), 0]]);
        const heuristic = (ix, iz) => Math.hypot(ix - goal.ix, iz - goal.iz);
        open.push({ ix: start.ix, iz: start.iz, y: startH }, heuristic(start.ix, start.iz));
        let best = { ix: start.ix, iz: start.iz, y: startH, h: heuristic(start.ix, start.iz) };

        for (let expanded = 0; open.size && expanded < maxNodes; expanded++) {
            const node = open.pop();
            const k = key(node.ix, node.iz);
            if (closed.has(k)) continue;
            closed.add(k);
            if (node.ix === goal.ix && node.iz === goal.iz) return this.build(came, node, key);
            const h = heuristic(node.ix, node.iz);
            if (h < best.h) best = { ...node, h };

            for (const [dx, dz] of DIRS) {
                const nx = node.ix + dx;
                const nz = node.iz + dz;
                if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
                const nh = this.height(nx, nz);
                if (!this.canMove(node.y, nh)) continue;
                if (dx && dz) {
                    // Diagonals only across flat ground, so bots don't clip corners
                    if (nh !== node.y || this.height(node.ix + dx, node.iz) !== node.y || this.height(node.ix, node.iz + dz) !== node.y) continue;
                }
                let step = dx && dz ? Math.SQRT2 : 1;
                if (nh > node.y) step += 0.6;                               // jumping is slower
                if (!arena.isStable(nx, nh, nz)) step += 8;                 // avoid cracking blocks
                const nk = key(nx, nz);
                const next = cost.get(k) + step;
                if (next < (cost.get(nk) ?? Infinity)) {
                    cost.set(nk, next);
                    came.set(nk, node);
                    open.push({ ix: nx, iz: nz, y: nh }, next + heuristic(nx, nz));
                }
            }
        }
        if (best.ix === start.ix && best.iz === start.iz) return [];
        return this.build(came, best, key);
    }

    build(came, node, key) {
        const path = [];
        let current = node;
        while (current && came.has(key(current.ix, current.iz))) {
            path.push({ ix: current.ix, iz: current.iz, y: current.y });
            current = came.get(key(current.ix, current.iz));
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
