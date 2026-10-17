import { S2C } from '../../protocol.js';
import { Feature } from '../Feature.js';
import { RPG } from './config.js';

// One RPG at a time, on a random tower top of maps that have rpgSpots. Once it's gone (fired,
// its carrier died or left, its tower top was shot away) the next one comes after a cooldown.
export class MapRpg extends Feature {
    static id = 'rpg';

    reset() {
        this.timer = RPG.firstDelay;    // seconds until the next RPG appears
        this.out = false;               // an RPG is on the map or in someone's hands
        for (const pickup of this.room.pickups.removeType('rpg')) this.room.emit(null, S2C.PICKUP_TAKEN, { id: pickup.id, by: null });
    }

    tick(dt) {
        const room = this.room;
        const spots = room.map.rpgSpots;
        if (!spots?.length || room.matchOver) return;
        if (this.exists()) {
            this.out = true;
            return;
        }
        if (this.out) {
            this.out = false;
            this.timer = RPG.cooldown;
        }
        this.timer -= dt;
        if (this.timer > 0) return;
        const free = spots.filter(s => room.arena.isStandable(s.ix, s.y, s.iz));
        if (!free.length) {
            this.timer = 1; // every tower top is broken right now: try again soon
            return;
        }
        const spot = free[Math.floor(room.rng() * free.length)];
        this.out = true;
        room.emit(null, S2C.PICKUP_SPAWNED, room.pickups.place('rpg', room.arena, spot, room.time, { spot: spot.name }));
    }

    exists() {
        if (this.room.pickups.has('rpg')) return true;
        for (const p of this.room.players.values()) if (p.alive && p.inventory.has('rpg')) return true;
        return false;
    }

    get pickups() {
        return {
            rpg: { apply: player => this.room.select(player, player.inventory.give('rpg')) }
        };
    }
}
