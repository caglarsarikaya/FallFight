// Who stands where, one tile per cell, rebuilt once a tick before the brains think. Brains ask it
// for their neighbours (to keep apart) and how crowded a tile is (to pick a less busy road), so
// neither costs a pass over every player. Linked lists in typed arrays: nothing allocated per tick.
export class Crowd {
    constructor(arena) {
        this.arena = arena;
        this.head = new Int32Array(arena.size * arena.size).fill(-1);
        this.next = new Int32Array(64);
        this.list = [];
        this.used = [];             // cells filled this tick, to clear cheaply
    }

    rebuild(players) {
        const { head, list, used } = this;
        for (const c of used) head[c] = -1;
        used.length = 0;
        list.length = 0;
        for (const p of players.values()) {
            if (!p.alive) continue;
            const c = this.cell(p.x, p.z);
            if (c < 0) continue;
            const i = list.length;
            if (i >= this.next.length) {
                const grown = new Int32Array(this.next.length * 2);
                grown.set(this.next);
                this.next = grown;
            }
            list.push(p);
            if (head[c] === -1) used.push(c);
            this.next[i] = head[c];
            head[c] = i;
        }
    }

    cell(x, z) {
        const { ix, iz } = this.arena.tileAt(x, z);
        const size = this.arena.size;
        return ix < 0 || iz < 0 || ix >= size || iz >= size ? -1 : iz * size + ix;
    }

    // How many matching players stand on tile (ix, iz)
    countAt(ix, iz, match = null) {
        const size = this.arena.size;
        if (ix < 0 || iz < 0 || ix >= size || iz >= size) return 0;
        let n = 0;
        for (let i = this.head[iz * size + ix]; i !== -1; i = this.next[i]) if (!match || match(this.list[i])) n++;
        return n;
    }

    // fn(other) for every other living player whose tile is within `tiles` of this one's
    forNeighbours(player, tiles, fn) {
        const { ix, iz } = this.arena.tileAt(player.x, player.z);
        const size = this.arena.size;
        for (let z = Math.max(0, iz - tiles); z <= Math.min(size - 1, iz + tiles); z++) {
            for (let x = Math.max(0, ix - tiles); x <= Math.min(size - 1, ix + tiles); x++) {
                for (let i = this.head[z * size + x]; i !== -1; i = this.next[i]) {
                    const other = this.list[i];
                    if (other !== player) fn(other);
                }
            }
        }
    }
}
