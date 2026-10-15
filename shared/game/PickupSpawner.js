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
        return this.place(type, arena, spot, now, { amount: PICKUPS[type].amount });
    }

    // A pickup on a given standing spot { ix, iz, y }. extra: more fields (amount, spot name...)
    place(type, arena, spot, now = 0, extra = {}) {
        const { x, z } = arena.tileCenter(spot.ix, spot.iz);
        // baseY is the surface it rests on (floor or a platform top); iy is the supporting block
        const pickup = {
            id: this.nextId++, type, amount: 1,
            x, y: spot.y + 0.6, z, baseY: spot.y,
            ix: spot.ix, iy: spot.y, iz: spot.iz,
            spawnedAt: now,
            ...extra
        };
        this.pickups.set(pickup.id, pickup);
        return pickup;
    }

    has(type) {
        for (const pickup of this.pickups.values()) if (pickup.type === type) return true;
        return false;
    }

    // Takes every pickup of a type off the map. Returns them.
    removeType(type) {
        const removed = [...this.pickups.values()].filter(p => p.type === type);
        for (const pickup of removed) this.pickups.delete(pickup.id);
        return removed;
    }

    // Loot dropped where something died (Zombies). extra: e.g. { weapon } for gun drops.
    drop(type, arena, pos, now, life, extra = {}) {
        const { ix, iz } = arena.tileAt(pos.x, pos.z);
        const y = arena.levelNear(ix, iz, Math.round(pos.y)) ?? arena.spawnLevel(ix, iz);
        if (y === null) return null;
        const { x, z } = arena.tileCenter(ix, iz);
        const pickup = {
            id: this.nextId++, type, amount: 1,
            x, y: y + 0.6, z, baseY: y,
            ix, iy: y, iz,
            spawnedAt: now, expiresAt: now + life,
            ...extra
        };
        this.pickups.set(pickup.id, pickup);
        return pickup;
    }

    // Dropped loot left lying too long disappears. Returns the removed pickups.
    expire(now) {
        const removed = [];
        for (const pickup of this.pickups.values()) {
            if (pickup.expiresAt !== undefined && now >= pickup.expiresAt) {
                this.pickups.delete(pickup.id);
                removed.push(pickup);
            }
        }
        return removed;
    }

    // First living player overlapping a pickup takes it; canTake(player) can rule some out.
    // players: an array or a Map's values (re-iterable). Returns [{ pickup, player }]
    collect(players, canTake = () => true) {
        const taken = [];
        if (this.pickups.size === 0) return taken;
        const list = Array.isArray(players) ? players : [...players];
        for (const pickup of this.pickups.values()) {
            for (const player of list) {
                if (!player.alive || !canTake(player)) continue;
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
