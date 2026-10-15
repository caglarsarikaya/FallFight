import { HITBOX, PLAYER } from '../constants.js';
import { rayBox } from '../math.js';

// Bullet/knife hit test against a player's head, body and legs boxes.
// pose: { x, y, z, crouching } (feet position). Returns { distance, zone } or null.
// Scratch boxes are reused so a burst of pellets doesn't allocate.
const min = { x: 0, y: 0, z: 0 };
const max = { x: 0, y: 0, z: 0 };

function setBox(pose, radius, y0, y1) {
    min.x = pose.x - radius;
    min.y = pose.y + y0;
    min.z = pose.z - radius;
    max.x = pose.x + radius;
    max.y = pose.y + y1;
    max.z = pose.z + radius;
}

export function bodyHeight(crouching) {
    return crouching ? PLAYER.crouchHeight : PLAYER.height;
}

export function hitTest(origin, dir, maxDist, pose) {
    const h = bodyHeight(pose.crouching);
    const k = h / PLAYER.height;
    // Broad phase: the whole body
    setBox(pose, HITBOX.body.radius, 0, h);
    if (rayBox(origin, dir, min, max, maxDist) === null) return null;

    let best = null;
    const headFrom = h - HITBOX.head.height;
    setBox(pose, HITBOX.head.radius, headFrom, h);
    let t = rayBox(origin, dir, min, max, maxDist);
    if (t !== null) best = { distance: t, zone: 'head' };

    setBox(pose, HITBOX.body.radius, HITBOX.body.from * k, headFrom);
    t = rayBox(origin, dir, min, max, maxDist);
    if (t !== null && (!best || t < best.distance)) best = { distance: t, zone: 'body' };

    setBox(pose, HITBOX.legs.radius, 0, HITBOX.body.from * k);
    t = rayBox(origin, dir, min, max, maxDist);
    if (t !== null && (!best || t < best.distance)) best = { distance: t, zone: 'legs' };
    return best;
}
