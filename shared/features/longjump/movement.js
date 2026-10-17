import { LONG_JUMP } from './config.js';

// The long jump for stepMovement. input.longJump: true while carrying the module.
export const longJumpMovement = {
    prepare(input, perks) {
        if (perks.longJump) input.longJump = true;
    },

    // Crouch + jump while moving: a leap along the keys instead of the normal jump
    jump(body, input) {
        if (!input.longJump || !body.crouching) return false;
        const wish = Math.hypot(input.moveX, input.moveZ);
        if (wish <= 1e-6 || Math.hypot(body.vx, body.vz) <= LONG_JUMP.minSpeed) return false;
        body.vx = (input.moveX / wish) * LONG_JUMP.speed;
        body.vz = (input.moveZ / wish) * LONG_JUMP.speed;
        body.vy = LONG_JUMP.up;
        body.jumpKind = 'longjump';
        return true;
    }
};
