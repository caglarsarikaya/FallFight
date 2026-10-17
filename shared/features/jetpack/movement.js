import { PLAYER } from '../../constants.js';
import { collides, moveHorizontal, moveVertical } from '../../physics.js';
import { JETPACK } from './config.js';

// Jetpack flight for stepMovement. input.jetpack: { up, down } while carrying it, else absent.
export const jetpackMovement = {
    // The walk key (Shift) flies up and crouch (Ctrl) sinks instead
    prepare(input, perks) {
        if (!perks.jetpack) return;
        input.jetpack = { up: !!input.walk, down: !!input.crouch };
        input.walk = false;
    },

    // No gravity, the keys set where the velocity heads. Up climbs, down sinks, neither hovers;
    // WASD flies level. Ctrl only sinks, so you stand up in the air if there's room. Touching
    // down without holding up ends the flight.
    step(body, input, arena, dt) {
        const jet = input.jetpack;
        if (jet?.up) body.flying = true;
        else if (!jet) body.flying = false;
        if (!body.flying) return false;

        if (body.crouching && !collides(arena, body.x, body.y, body.z, PLAYER.height)) body.crouching = false;
        body.inWater = arena.isWaterAt(body.x, body.y + 0.4, body.z);
        const blend = 1 - Math.exp(-JETPACK.accel * dt);
        const climb = jet.up ? JETPACK.up : jet.down ? -JETPACK.down : 0;
        body.vx += (input.moveX * JETPACK.speed - body.vx) * blend;
        body.vz += (input.moveZ * JETPACK.speed - body.vz) * blend;
        body.vy += (climb - body.vy) * blend;

        moveHorizontal(body, arena, 'x', body.vx * dt);
        moveHorizontal(body, arena, 'z', body.vz * dt);
        moveVertical(body, arena, body.vy * dt);
        const top = arena.height + JETPACK.ceiling;
        if (body.y > top) {
            body.y = top;
            body.vy = Math.min(0, body.vy);
        }
        if (body.onGround && !jet.up) body.flying = false;
        return true;
    }
};
