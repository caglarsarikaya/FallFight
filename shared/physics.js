import { PLAYER } from './constants.js';
import { bodyHeight } from './game/Hitbox.js';

const SKIN = 1e-4;

function collides(arena, x, y, z, height) {
    const r = PLAYER.radius;
    return arena.boxCollides(x - r, y, z - r, x + r, y + height, z + r);
}

// Top speed for a stance: weapon weight (speedMul), crouching, walk key, being shot (slow)
export function moveSpeed({ speedMul = 1, crouching = false, walk = false, slow = 1, onGround = true }) {
    let speed = PLAYER.walkSpeed * speedMul * slow;
    if (crouching && onGround) speed *= PLAYER.crouchSpeed;
    else if (walk) speed *= PLAYER.slowWalkSpeed;
    return speed;
}

// One movement step for a player body, shared by client prediction and server-side bots.
// body:  { x, y, z, vx, vy, vz, onGround, crouching } (mutated); y is the feet height
// input: { moveX, moveZ } world-space wish direction (length <= 1), { jump, crouch, walk }
//        booleans, { speedMul } from the held weapon, { slow } while tagged
// Collision is box-vs-voxel, one axis at a time; there is no auto step-up, so 1-high blocks
// need a jump and 2-high blocks are walls. Standing up needs headroom.
export function stepMovement(body, input, arena, dt) {
    if (input.crouch) body.crouching = true;
    else if (body.crouching && !collides(arena, body.x, body.y, body.z, PLAYER.height)) body.crouching = false;

    const speed = moveSpeed({ ...input, crouching: body.crouching, onGround: body.onGround });
    const accel = body.onGround ? PLAYER.groundAccel : PLAYER.airAccel;
    const blend = 1 - Math.exp(-accel * dt);
    body.vx += (input.moveX * speed - body.vx) * blend;
    body.vz += (input.moveZ * speed - body.vz) * blend;

    if (input.jump && body.onGround) {
        body.vy = PLAYER.jumpSpeed;
        body.onGround = false;
    }
    body.vy -= PLAYER.gravity * dt;

    moveHorizontal(body, arena, 'x', body.vx * dt);
    moveHorizontal(body, arena, 'z', body.vz * dt);
    moveVertical(body, arena, body.vy * dt);
    return body;
}

function moveHorizontal(body, arena, axis, delta) {
    if (delta === 0) return;
    const velocity = axis === 'x' ? 'vx' : 'vz';
    const target = body[axis] + delta;
    const h = bodyHeight(body.crouching);
    const at = v => (axis === 'x' ? collides(arena, v, body.y, body.z, h) : collides(arena, body.x, body.y, v, h));
    if (!at(target)) {
        body[axis] = target;
        return;
    }
    // Slide up against the face of the blocking cell
    const r = PLAYER.radius;
    const face = delta > 0
        ? Math.floor(target + r - arena.min) + arena.min - r - SKIN
        : Math.floor(target - r - arena.min) + 1 + arena.min + r + SKIN;
    if ((delta > 0 ? face > body[axis] : face < body[axis]) && !at(face)) body[axis] = face;
    body[velocity] = 0;
}

function moveVertical(body, arena, delta) {
    const h = bodyHeight(body.crouching);
    const target = body.y + delta;
    body.onGround = false;
    if (!collides(arena, body.x, target, body.z, h)) {
        body.y = target;
        return;
    }
    if (delta < 0) {
        // Land on top of the block below
        const top = Math.floor(target) + 1;
        if (top <= body.y + SKIN && !collides(arena, body.x, top, body.z, h)) body.y = top;
        body.onGround = true;
    } else {
        // Bump the head on the block above
        const bottom = Math.floor(target + h) - h - SKIN;
        if (bottom >= body.y && !collides(arena, body.x, bottom, body.z, h)) body.y = bottom;
    }
    body.vy = 0;
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
