import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '../shared/constants.js';
import { Arena, BLOCK_STATE } from '../shared/world/Arena.js';
import { stepMovement } from '../shared/physics.js';
import { Pathfinder } from '../shared/ai/Pathfinder.js';
import { createRoom, place, run } from './helpers.js';
import { LANDMARKS } from '../shared/world/layout.js';

const step = (body, arena, input, seconds) => {
    for (let t = 0; t < seconds; t += 1 / 60) stepMovement(body, { moveX: 0, moveZ: 0, jump: false, ...input }, arena, 1 / 60);
};

const bodyAt = (arena, ix, iz) => {
    const c = arena.tileCenter(ix, iz);
    return { x: c.x, y: arena.surfaceHeight(ix, iz), z: c.z, vx: 0, vy: 0, vz: 0, onGround: true };
};

test('layout has platforms: plaza 1 high, towers and walls 2 high', () => {
    const arena = new Arena();
    const { openFloor, plaza, lookout, wall, sniper } = LANDMARKS;
    const at = t => arena.surfaceHeight(t.ix, t.iz);
    const reachable = t => !!arena.reachable[t.iz * arena.size + t.ix];
    assert.equal(arena.size, 60);
    assert.equal(at(openFloor), 0, 'open floor');
    assert.equal(at(plaza), 1, 'plaza');
    assert.equal(at(lookout.top), 2, 'lookout tower');
    assert.equal(at(lookout.step), 1, 'lookout step');
    assert.equal(at(wall), 2, 'wall top');
    assert.equal(at(sniper.top), 8, 'sniper tower top');
    assert.ok(reachable(lookout.top), 'lookout top reachable via its step');
    assert.ok(reachable(sniper.top), 'sniper top reachable via its stairs');
    assert.ok(!reachable(wall), 'wall top is not reachable');
});

test('walls block walking', () => {
    const arena = new Arena();
    const { wall } = LANDMARKS;
    const body = bodyAt(arena, wall.ix - 2, wall.iz);
    step(body, arena, { moveX: 1 }, 2);
    assert.ok(body.x + PLAYER.radius <= arena.tileCenter(wall.ix, wall.iz).x - 0.5 + 1e-3, 'stopped at the wall face');
    assert.equal(body.y, 0);
});

test('a 1-high block can be jumped onto, a 2-high one cannot', () => {
    const arena = new Arena();
    const { lookout } = LANDMARKS;
    // Step block east of the tower, floor beside it
    const body = bodyAt(arena, lookout.besideStep.ix, lookout.besideStep.iz);
    step(body, arena, { moveX: -1, jump: true }, 0.3);
    step(body, arena, { moveX: -1 }, 0.6);
    assert.equal(body.y, 1, 'on the step, pressed against the tower');
    assert.ok(arena.tileAt(body.x, body.z).ix <= lookout.step.ix, 'standing on the step');
    // From the floor straight at the tower side (2 high)
    const low = bodyAt(arena, lookout.belowSide.ix, lookout.belowSide.iz);
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
    const { plaza } = LANDMARKS;
    const body = bodyAt(arena, plaza.ix, plaza.iz);
    step(body, arena, {}, 0.3);
    assert.equal(body.y, 1);
    arena.setState(plaza.ix, 1, plaza.iz, BLOCK_STATE.BROKEN);
    step(body, arena, {}, 0.6);
    assert.equal(body.y, 0, 'dropped to the floor below');
});

test('a block does not regrow while someone stands in its space', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const { ix, iz } = LANDMARKS.plaza;
    place(room, a, ix, iz); // on the plaza (feet at y = 1)
    room.arena.startBreak(ix, 1, iz, 'x', room.time);
    run(room, 0.5);
    assert.ok(!room.arena.isSolid(ix, 1, iz));
    // Player now stands where the block was (as if it fell into the gap)
    Object.assign(a, { y: 0 });
    run(room, 22);
    assert.ok(!room.arena.isSolid(ix, 1, iz), 'still waiting because the player is inside');
    a.x += 3;
    run(room, 1.5);
    assert.ok(room.arena.isSolid(ix, 1, iz), 'regrew once the space was free');
});

test('pathfinder climbs a lookout via its step', () => {
    const arena = new Arena();
    const { top, step: stepTile } = LANDMARKS.lookout;
    const path = new Pathfinder(arena).find({ ix: top.ix + 6, iz: top.iz }, top);
    assert.ok(path && path.length, 'found a path');
    const last = path.at(-1);
    assert.deepEqual([last.ix, last.iz, last.y], [top.ix, top.iz, 2]);
    assert.ok(path.some(p => p.ix === stepTile.ix && p.iz === stepTile.iz && p.y === 1), 'goes over the step');
});

test('pathfinder reaches a sniper perch from the middle of the arena', () => {
    const arena = new Arena();
    const perch = LANDMARKS.sniperPerches[3];
    const path = new Pathfinder(arena).find(LANDMARKS.openFloor, perch);
    assert.ok(path && path.length > 10);
    assert.deepEqual([path.at(-1).ix, path.at(-1).iz, path.at(-1).y], [perch.ix, perch.iz, 8]);
    // Climbs at most one block per step
    let prev = 0;
    for (const p of path) {
        assert.ok(p.y - prev <= 1, `step from ${prev} to ${p.y}`);
        prev = p.y;
    }
});

test('a player can climb the sniper stairs to the top', () => {
    const arena = new Arena();
    const { stairsStart, approach } = LANDMARKS.sniper;
    const ox = stairsStart.ix + 1;   // tower origin
    const oz = stairsStart.iz + 1;
    // Walk (jumping) from tile to tile like a player holding W + Space
    const walkTo = (body, ix, iz) => {
        const c = arena.tileCenter(ix, iz);
        for (let t = 0; t < 4; t += 1 / 60) {
            const dx = c.x - body.x;
            const dz = c.z - body.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.15 && body.onGround) break;
            const s = Math.min(1, d * 2);
            stepMovement(body, { moveX: (dx / d) * s, moveZ: (dz / d) * s, jump: d > 0.5 }, arena, 1 / 60);
        }
        step(body, arena, {}, 0.4); // settle
    };
    const body = bodyAt(arena, approach.ix, stairsStart.iz);
    walkTo(body, ox + 5, oz - 1);      // up the steps along the north side
    assert.equal(body.y, 7, 'top step');
    walkTo(body, ox + 5, oz);          // landing
    assert.equal(body.y, 8, 'landing');
    walkTo(body, ox + 4, oz);          // through the parapet gap
    walkTo(body, ox + 4, oz + 1);
    walkTo(body, ox + 2, oz + 1);
    walkTo(body, ox + 2, oz + 2);      // the perch in the middle
    step(body, arena, {}, 0.3);
    assert.equal(body.y, 8, 'standing on the sniper top');
    assert.deepEqual(arena.tileAt(body.x, body.z), { ix: ox + 2, iz: oz + 2 });
});

test('the parapet stops a flat shot at a crouching sniper from the ground', () => {
    const arena = new Arena();
    const { top } = LANDMARKS.sniper;
    const c = arena.tileCenter(top.ix, top.iz);
    // From 10 blocks south, aim straight at the sniper's legs (just above the tower top)
    const from = { x: c.x, y: 8.3, z: c.z + 10 };
    const hit = arena.raycast(from, { x: 0, y: 0, z: -1 }, 10);
    assert.ok(hit, 'blocked');
    assert.equal(hit.iy, 9, 'by the parapet');
});

test('players spawn on the floor, never on towers', () => {
    const room = createRoom(3);
    for (let i = 0; i < 40; i++) {
        const p = room.addPlayer({ id: `p${i}`, name: 'P' });
        assert.equal(p.y, 0);
    }
});

test('projectiles fly straight: no drop over 20 blocks', async () => {
    const { Projectile } = await import('../shared/game/Projectile.js');
    const room = createRoom();
    room.players.clear();
    const { ix, from } = LANDMARKS.lane;
    const c = room.arena.tileCenter(ix, from);
    const arrow = new Projectile({ id: 1, x: c.x, y: 1.5, z: c.z, vx: 0, vy: 0, vz: -40, born: 0 });
    let t = 0;
    while (c.z - arrow.z < 20 && t < 3) {
        assert.equal(arrow.step(1 / 30, room, t), null);
        t += 1 / 30;
    }
    assert.ok(c.z - arrow.z >= 20, 'travelled 20 blocks');
    assert.equal(arrow.y, 1.5, 'no drop');
});

test('all pickups on the map can be collected (regression)', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const pickups = [room.pickups.spawn('ammo', room.arena), room.pickups.spawn('ammo', room.arena), room.pickups.spawn('health_potion', room.arena)];
    // Visit the newest first: with the old iterator bug only the first-inserted could be taken
    for (const pickup of [...pickups].reverse()) {
        Object.assign(a, { x: pickup.x, y: pickup.baseY, z: pickup.z });
        room.tick(1 / 30);
    }
    assert.equal(room.pickups.pickups.size, 0);
    assert.equal(room.eventsOf('pickupTaken').filter(p => p.by === 'a').length, 3);
});
