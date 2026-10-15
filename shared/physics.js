import { LONG_JUMP, PLAYER } from './constants.js';
import { bodyHeight } from './game/BodyZones.js';

const SKIN = 1e-4;

// Movement in water, relative to normal
// climbOut: the kick out of the water onto a ledge (swimUp alone can't clear one block)
const WATER = { speed: 0.6, accel: 5, gravity: 0.25, swimUp: 4.2, sink: 2.5, climbOut: 6 };
const LEDGE_REACH = 0.15;

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
//        booleans, { speedMul } from the held weapon, { slow } while tagged, { longJump } with the
//        long jump module (crouch + jump while moving leaps far; sets body.longJumped that tick)
// In the air you keep your momentum and steer GoldSrc-style, so strafing while turning gains a
// little speed; jumping on the tick you land skips ground friction (bunny hop, capped).
// Collision is box-vs-voxel, one axis at a time; there is no auto step-up, so 1-high blocks
// need a jump and 2-high blocks are walls. Standing up needs headroom. In water, swimming into a
// ledge at the surface with Space held pops you out onto it.
export function stepMovement(body, input, arena, dt) {
    if (input.crouch) body.crouching = true;
    else if (body.crouching && !collides(arena, body.x, body.y, body.z, PLAYER.height)) body.crouching = false;

    // Swimming: slow, floaty, Space swims up
    const inWater = arena.isWaterAt(body.x, body.y + 0.4, body.z);
    body.inWater = inWater;
    let speed = moveSpeed({ ...input, crouching: body.crouching, onGround: body.onGround });
    if (inWater) speed *= WATER.speed;

    // The jump tick is an air tick (GoldSrc: the jump comes before friction), so a hop timed on
    // landing keeps its speed. The cap goes by the standing speed, so duck-hops don't lose it.
    let grounded = body.onGround;
    body.longJumped = false;
    if (input.jump && body.onGround && !inWater) {
        body.onGround = false;
        grounded = false;
        const hs = Math.hypot(body.vx, body.vz);
        const wish = Math.hypot(input.moveX, input.moveZ);
        if (input.longJump && body.crouching && wish > 1e-6 && hs > LONG_JUMP.minSpeed) {
            // Long jump module (Half-Life): a leap along the keys
            body.vx = (input.moveX / wish) * LONG_JUMP.speed;
            body.vz = (input.moveZ / wish) * LONG_JUMP.speed;
            body.vy = LONG_JUMP.up;
            body.longJumped = true;
        } else {
            body.vy = PLAYER.jumpSpeed;
            const cap = PLAYER.bhopCap * moveSpeed({ ...input, crouching: false, walk: false });
            if (hs > cap) {
                body.vx *= cap / hs;
                body.vz *= cap / hs;
            }
        }
    }

    if (grounded || inWater) {
        const grip = grounded ? arena.frictionAt(body.x, body.y, body.z) : 1;
        const blend = 1 - Math.exp(-(inWater ? WATER.accel : PLAYER.groundAccel * grip) * dt);
        body.vx += (input.moveX * speed - body.vx) * blend;
        body.vz += (input.moveZ * speed - body.vz) * blend;
    } else {
        // Air: only add speed along the wish direction. Below top speed you steer gently up to it
        // (so a jump from a standstill still gets you up a step); above it, GoldSrc-style, only up
        // to a small cap along the keys, so holding W does nothing but strafing A/D while turning
        // builds speed.
        const wish = Math.hypot(input.moveX, input.moveZ);
        if (wish > 1e-6) {
            const wx = input.moveX / wish, wz = input.moveZ / wish;
            const wishSpeed = speed * wish;
            const fast = Math.hypot(body.vx, body.vz) >= speed;
            const add = (fast ? Math.min(wishSpeed, PLAYER.airWishCap * speed) : wishSpeed) - (body.vx * wx + body.vz * wz);
            if (add > 0) {
                const gain = Math.min(add, (fast ? PLAYER.airAccel : PLAYER.airControl) * wishSpeed * dt);
                body.vx += wx * gain;
                body.vz += wz * gain;
            }
        }
    }
    if (inWater) {
        body.vy -= PLAYER.gravity * WATER.gravity * dt;
        if (input.jump) body.vy = Math.max(body.vy, canClimbOut(body, input, arena) ? WATER.climbOut : WATER.swimUp);
        body.vy = Math.max(body.vy, -WATER.sink);
    } else {
        body.vy -= PLAYER.gravity * dt;
    }

    moveHorizontal(body, arena, 'x', body.vx * dt);
    moveHorizontal(body, arena, 'z', body.vz * dt);
    moveVertical(body, arena, body.vy * dt);
    return body;
}

// Water jump (GoldSrc-style): head at the surface, swimming into a ledge with room on top
function canClimbOut(body, input, arena) {
    const wish = Math.hypot(input.moveX, input.moveZ);
    if (wish < 1e-6 || arena.isWaterAt(body.x, body.y + 1, body.z)) return false;
    const h = bodyHeight(body.crouching);
    const x = body.x + (input.moveX / wish) * LEDGE_REACH;
    const z = body.z + (input.moveZ / wish) * LEDGE_REACH;
    return collides(arena, x, body.y, z, h) && !collides(arena, x, body.y + 1, z, h);
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
