import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '../shared/constants.js';
import { Arena, BLOCK_STATE } from '../shared/world/Arena.js';
import { stepMovement } from '../shared/physics.js';
import { Pathfinder } from '../shared/ai/Pathfinder.js';
import { createRoom, place, run } from './helpers.js';

const step = (body, arena, input, seconds) => {
    for (let t = 0; t < seconds; t += 1 / 60) stepMovement(body, { moveX: 0, moveZ: 0, jump: false, ...input }, arena, 1 / 60);
};

const bodyAt = (arena, ix, iz) => {
    const c = arena.tileCenter(ix, iz);
    return { x: c.x, y: arena.surfaceHeight(ix, iz), z: c.z, vx: 0, vy: 0, vz: 0, onGround: true };
};

test('layout has platforms: plaza 1 high, towers and walls 2 high', () => {
    const arena = new Arena();
    assert.equal(arena.surfaceHeight(10, 10), 0, 'open floor');
    assert.equal(arena.surfaceHeight(14, 14), 1, 'plaza');
    assert.equal(arena.surfaceHeight(5, 5), 2, 'tower');
    assert.equal(arena.surfaceHeight(7, 5), 1, 'tower step');
    assert.equal(arena.surfaceHeight(9, 14), 2, 'wall top');
    assert.ok(arena.reachable[5 * arena.size + 5], 'tower top reachable via its step');
    assert.ok(!arena.reachable[14 * arena.size + 9], 'wall top is not reachable');
});

test('walls block walking', () => {
    const arena = new Arena();
    const body = bodyAt(arena, 7, 14);
    step(body, arena, { moveX: 1 }, 2);
    assert.ok(body.x + PLAYER.radius <= arena.tileCenter(9, 14).x - 0.5 + 1e-3, 'stopped at the wall face');
    assert.equal(body.y, 0);
});

test('a 1-high block can be jumped onto, a 2-high one cannot', () => {
    const arena = new Arena();
    // Step block at (7, 5), floor at (8, 5)
    const body = bodyAt(arena, 8, 5);
    step(body, arena, { moveX: -1, jump: true }, 0.3);
    step(body, arena, { moveX: -1 }, 0.6);
    assert.equal(body.y, 1, 'on the step, pressed against the tower');
    assert.equal(arena.tileAt(body.x, body.z).ix <= 7, true);
    // From the floor straight at the tower side (2 high)
    const low = bodyAt(arena, 5, 8);
    step(low, arena, { moveZ: -1, jump: true }, 1);
    step(low, arena, {}, 0.5);
    assert.equal(low.y, 0, 'tower too high to jump on from the floor');
    // From the step onto the tower top
    step(body, arena, { moveX: -1, jump: true }, 0.8);
    step(body, arena, {}, 0.5);
    assert.equal(body.y, 2, 'climbed the tower via its step');
});

test('standing on a platform and falling when it is chopped away', () => {
    const arena = new Arena();
    const body = bodyAt(arena, 14, 14);
    step(body, arena, {}, 0.3);
    assert.equal(body.y, 1);
    arena.setState(14, 1, 14, BLOCK_STATE.BROKEN);
    step(body, arena, {}, 0.6);
    assert.equal(body.y, 0, 'dropped to the floor below');
});

test('a block does not regrow while someone stands in its space', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    place(room, a, 14, 14); // on the plaza (feet at y = 1)
    room.arena.startBreak(14, 1, 14, 'x', room.time);
    run(room, 0.5);
    assert.ok(!room.arena.isSolid(14, 1, 14));
    // Player now stands where the block was (as if it fell into the gap)
    Object.assign(a, { y: 0 });
    run(room, 22);
    assert.ok(!room.arena.isSolid(14, 1, 14), 'still waiting because the player is inside');
    a.x += 3;
    run(room, 1.5);
    assert.ok(room.arena.isSolid(14, 1, 14), 'regrew once the space was free');
});

test('pathfinder climbs a tower via its step', () => {
    const arena = new Arena();
    const path = new Pathfinder(arena).find({ ix: 12, iz: 5 }, { ix: 5, iz: 5 });
    assert.ok(path && path.length, 'found a path');
    const last = path.at(-1);
    assert.deepEqual([last.ix, last.iz, last.y], [5, 5, 2]);
    assert.ok(path.some(p => p.ix === 7 && p.iz === 5 && p.y === 1), 'goes over the step');
});

test('all pickups on the map can be collected (regression)', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const pickups = [room.pickups.spawn('arrow', room.arena), room.pickups.spawn('arrow', room.arena), room.pickups.spawn('health_potion', room.arena)];
    // Visit the newest first: with the old iterator bug only the first-inserted could be taken
    for (const pickup of [...pickups].reverse()) {
        Object.assign(a, { x: pickup.x, y: pickup.baseY, z: pickup.z });
        room.tick(1 / 30);
    }
    assert.equal(room.pickups.pickups.size, 0);
    assert.equal(room.eventsOf('pickupTaken').filter(p => p.by === 'a').length, 3);
});
