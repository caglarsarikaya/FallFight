import { PLAYER } from './constants.js';

// One movement step for a player body, shared by client prediction and server-side bots.
// body:  { x, y, z, vx, vy, vz, onGround } (mutated); y is the feet height, 0 = standing on the floor
// input: { moveX, moveZ } world-space wish direction (length <= 1), { jump } boolean
export function stepMovement(body, input, arena, dt) {
    const accel = body.onGround ? PLAYER.groundAccel : PLAYER.airAccel;
    const blend = 1 - Math.exp(-accel * dt);
    body.vx += (input.moveX * PLAYER.walkSpeed - body.vx) * blend;
    body.vz += (input.moveZ * PLAYER.walkSpeed - body.vz) * blend;

    if (input.jump && body.onGround) {
        body.vy = PLAYER.jumpSpeed;
        body.onGround = false;
    }
    body.vy -= PLAYER.gravity * dt;

    // Once inside a hole, the surrounding blocks act as walls
    const inHole = body.y < -0.02;
    const nx = body.x + body.vx * dt;
    if (inHole && arena.overlapsBlock(nx, body.z, PLAYER.radius)) body.vx = 0;
    else body.x = nx;
    const nz = body.z + body.vz * dt;
    if (inHole && arena.overlapsBlock(body.x, nz, PLAYER.radius)) body.vz = 0;
    else body.z = nz;

    const ny = body.y + body.vy * dt;
    if (body.vy <= 0 && body.y >= 0 && ny <= 0 && arena.hasSupport(body.x, body.z, PLAYER.radius)) {
        body.y = 0;
        body.vy = 0;
        body.onGround = true;
    } else {
        body.y = ny;
        body.onGround = false;
    }
    return body;
}

// Convert WASD-style input and a yaw into a world-space wish direction
export function wishDirection(forward, strafe, yaw) {
    const len = Math.hypot(forward, strafe);
    if (len < 1e-6) return { moveX: 0, moveZ: 0 };
    const f = forward / Math.max(len, 1);
    const s = strafe / Math.max(len, 1);
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    return { moveX: -sin * f + cos * s, moveZ: -cos * f - sin * s };
}
