import { S2C } from '../../protocol.js';
import { Feature } from '../Feature.js';
import { LONG_JUMP } from './config.js';
import { longJumpMovement } from './movement.js';

// The long jump module: one at a time on the map's spot (room.mapRules.longJumpSpot, from the
// mode's map overlay), every LONG_JUMP.interval seconds. Kept until you die, even if revived.
export class LongJump extends Feature {
    static id = 'longjump';
    static movement = longJumpMovement;

    reset() {
        this.timer = LONG_JUMP.interval;
        for (const pickup of this.room.pickups.removeType('longjump')) this.room.emit(null, S2C.PICKUP_TAKEN, { id: pickup.id, by: null });
    }

    resetPlayer(player) {
        player.longJump = false;
    }

    onDeath(player) {
        player.longJump = false;
    }

    tick(dt) {
        if (!this.room.matchOver) this.update(dt);
    }

    update(dt) {
        const room = this.room;
        const spot = room.mapRules.longJumpSpot;
        if (!spot || room.pickups.has('longjump')) return;
        this.timer -= dt;
        if (this.timer > 0) return;
        if (!room.arena.isStandable(spot.ix, spot.y, spot.iz)) {
            this.timer = 1; // the spot is blown away right now: try again soon
            return;
        }
        this.timer = LONG_JUMP.interval;
        room.emit(null, S2C.PICKUP_SPAWNED, room.pickups.place('longjump', room.arena, spot, room.time));
    }

    playerJSON(player) {
        return { longJump: !!player.longJump };
    }

    get pickups() {
        return {
            longjump: {
                canTake: player => !player.longJump,
                apply: player => {
                    player.longJump = true;
                }
            }
        };
    }
}
