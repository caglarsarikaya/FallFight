import { PICKUPS } from '../constants.js';

// Spawns ammo and potion pickups on a timer; the first player to touch one takes it.
export class PickupSpawner {
    constructor(rng, types = ['ammo', 'health_potion']) {
        this.rng = rng;
        this.typeList = types;
        this.pickups = new Map();
        this.nextId = 1;
        this.timers = Object.fromEntries(this.types().map(type => [type, PICKUPS[type].interval]));
    }

    types() {
        return this.typeList;
    }

    // Returns newly spawned pickups
    update(dt, arena, now = 0) {
        const spawned = [];
        for (const type of this.types()) {
            this.timers[type] -= dt;
            if (this.timers[type] > 0) continue;
            this.timers[type] += PICKUPS[type].interval;
            const onMap = [...this.pickups.values()].filter(p => p.type === type).length;
            if (onMap >= PICKUPS[type].max) continue;
            const pickup = this.spawn(type, arena, now);
            if (pickup) spawned.push(pickup);
        }
        return spawned;
    }

    spawn(type, arena, now = 0) {
        const spot = arena.findSpawn(this.rng, [...this.pickups.values()]);
        if (!spot) return null;
        const { x, z } = arena.tileCenter(spot.ix, spot.iz);
        // baseY is the surface it rests on (floor or a platform top); iy is the supporting block
        const pickup = {
            id: this.nextId++, type, amount: PICKUPS[type].amount,
            x, y: spot.y + 0.6, z, baseY: spot.y,
            ix: spot.ix, iy: spot.y, iz: spot.iz,
            spawnedAt: now
        };
        this.pickups.set(pickup.id, pickup);
        return pickup;
    }

    // First living player overlapping a pickup takes it. Returns [{ pickup, player }]
    collect(players) {
        const list = [...players]; // may be a one-shot iterator, and we loop over it once per pickup
        const taken = [];
        for (const pickup of this.pickups.values()) {
            for (const player of list) {
                if (!player.alive) continue;
                const near = Math.hypot(player.x - pickup.x, player.z - pickup.z) <= PICKUPS.radius;
                if (near && Math.abs(player.y - pickup.baseY) < 1.2) {
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
            if (!arena.isSolid(pickup.ix, pickup.iy, pickup.iz)) {
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
