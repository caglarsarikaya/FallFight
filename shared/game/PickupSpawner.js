import { PICKUPS } from '../constants.js';

// Spawns arrow and potion pickups on a timer; the first player to touch one takes it.
export class PickupSpawner {
    constructor(rng) {
        this.rng = rng;
        this.pickups = new Map();
        this.nextId = 1;
        this.timers = Object.fromEntries(this.types().map(type => [type, PICKUPS[type].interval]));
    }

    types() {
        return ['arrow', 'health_potion'];
    }

    // Returns newly spawned pickups
    update(dt, arena) {
        const spawned = [];
        for (const type of this.types()) {
            this.timers[type] -= dt;
            if (this.timers[type] > 0) continue;
            this.timers[type] += PICKUPS[type].interval;
            const onMap = [...this.pickups.values()].filter(p => p.type === type).length;
            if (onMap >= PICKUPS[type].max) continue;
            const pickup = this.spawn(type, arena);
            if (pickup) spawned.push(pickup);
        }
        return spawned;
    }

    spawn(type, arena) {
        const tile = arena.findSpawnTile(this.rng, [...this.pickups.values()]);
        if (!tile) return null;
        const { x, z } = arena.tileCenter(tile.ix, tile.iz);
        const pickup = { id: this.nextId++, type, amount: PICKUPS[type].amount, x, y: 0.6, z, ix: tile.ix, iz: tile.iz };
        this.pickups.set(pickup.id, pickup);
        return pickup;
    }

    // First living player overlapping a pickup takes it. Returns [{ pickup, player }]
    collect(players) {
        const taken = [];
        for (const pickup of this.pickups.values()) {
            for (const player of players) {
                if (!player.alive) continue;
                const near = Math.hypot(player.x - pickup.x, player.z - pickup.z) <= PICKUPS.radius;
                if (near && player.y > -1 && player.y < 1.5) {
                    this.pickups.delete(pickup.id);
                    taken.push({ pickup, player });
                    break;
                }
            }
        }
        return taken;
    }

    // Pickups whose floor tile broke disappear. Returns the removed pickups.
    removeUnsupported(arena) {
        const removed = [];
        for (const pickup of this.pickups.values()) {
            if (!arena.isSolidTile(pickup.ix, pickup.iz)) {
                this.pickups.delete(pickup.id);
                removed.push(pickup);
            }
        }
        return removed;
    }

    toJSON() {
        return [...this.pickups.values()];
    }
}
