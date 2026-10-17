import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../shared/game/GameRoom.js';
import { PLAYER } from '../shared/constants.js';
import { LONG_JUMP } from '../shared/features/longjump/config.js';
import { longJumpMovement } from '../shared/features/longjump/movement.js';
import { DEFAULT_RULESET } from '../shared/ruleset.js';
import { S2C } from '../shared/protocol.js';
import { stepMovement } from '../shared/physics.js';
import { Arena } from '../shared/world/Arena.js';
import { getMap } from '../shared/world/maps/index.js';
import { createRng } from '../shared/math.js';
import { place, run, recorder } from './helpers.js';
import { mapOverlay } from '../shared/modes/zombies/maps.js';

function zombieRoom(map = 'fallfight_classic') {
    const events = [];
    const room = new GameRoom({ mode: 'zombies', map, rng: createRng(3), emit: recorder(events) });
    room.eventsOf = type => events.filter(e => e.type === type).map(e => e.data);
    return room;
}

const longJumps = room => [...room.pickups.pickups.values()].filter(p => p.type === 'longjump');

test('long jump spot: the Lava Arena plaza is a reachable place to stand', () => {
    const map = getMap('fallfight_classic');
    const arena = new Arena(map);
    const s = mapOverlay.fallfight_classic.longJumpSpot;
    assert.ok(arena.isStandable(s.ix, s.y, s.iz));
    assert.ok(arena.isReachable(s.ix, s.iz, s.y));
});

test('long jump: appears on the plaza every interval, never two at once', () => {
    const room = zombieRoom();
    const spot = room.mapRules.longJumpSpot;
    room.feature('longjump').update(LONG_JUMP.interval - 1);
    assert.equal(longJumps(room).length, 0);
    room.feature('longjump').update(1.1);
    const [lj] = longJumps(room);
    assert.ok(lj);
    assert.deepEqual([lj.ix, lj.iz, lj.baseY], [spot.ix, spot.iz, spot.y]);
    assert.ok(room.eventsOf(S2C.PICKUP_SPAWNED).some(e => e.type === 'longjump'));
    room.feature('longjump').update(LONG_JUMP.interval + 1);
    assert.equal(longJumps(room).length, 1, 'no second one while one is lying there');
});

test('long jump: a human takes it and keeps it until they die; zombies leave it', () => {
    const room = zombieRoom();
    const spot = room.mapRules.longJumpSpot;
    const a = room.addPlayer({ id: 'a', name: 'A' });
    room.feature('longjump').update(LONG_JUMP.interval);
    room.mode.spawnZombie();
    const z = [...room.players.values()].find(p => p.isZombie);
    place(room, z, spot.ix, spot.iz);
    place(room, a, 2, 2);
    run(room, 0.1);
    assert.equal(longJumps(room).length, 1, 'a zombie does not take it');
    room.removePlayer(z.id);

    place(room, a, spot.ix, spot.iz);
    run(room, 0.1);
    assert.equal(longJumps(room).length, 0);
    assert.equal(a.longJump, true);
    assert.equal(room.playerJSON(a, true).longJump, true);

    // A carrier doesn't take a second one
    room.feature('longjump').update(LONG_JUMP.interval);
    run(room, 0.1);
    assert.equal(longJumps(room).length, 1);

    a.protectedUntil = 0;
    room.damage(a, 1000, null, 'test', null, {});
    assert.equal(a.alive, false);
    assert.equal(a.longJump, false);
});

test('long jump: only on maps with a spot', () => {
    const room = zombieRoom('de_dust_mini');
    room.feature('longjump').update(LONG_JUMP.interval * 2);
    assert.equal(longJumps(room).length, 0);
});

test('long jump physics: crouch + jump while moving leaps far, otherwise a normal jump', () => {
    const arena = new Arena(getMap('fallfight_classic'));
    const { ix, iz } = getMap('fallfight_classic').landmarks.openFloor;
    const { x, z } = arena.tileCenter(ix, iz);
    const body = (crouching = true) => ({ x, y: arena.surfaceHeight(ix, iz), z, vx: 2, vy: 0, vz: 0, onGround: true, crouching });
    const input = extra => ({ moveX: 1, moveZ: 0, jump: true, crouch: true, longJump: true, ...extra });
    const dt = 1 / 60;

    const leap = stepMovement(body(), input(), arena, dt, DEFAULT_RULESET, [longJumpMovement]);
    assert.equal(leap.jumpKind, 'longjump');
    assert.ok(Math.abs(leap.vy - (LONG_JUMP.up - PLAYER.gravity * dt)) < 1e-9);
    assert.ok(Math.abs(Math.hypot(leap.vx, leap.vz) - LONG_JUMP.speed) < 0.5);

    for (const extra of [{ longJump: false }, { crouch: false }]) {
        const hop = stepMovement(body(extra.crouch !== false), input(extra), arena, dt, DEFAULT_RULESET, [longJumpMovement]);
        assert.equal(hop.jumpKind, 'jump');
        assert.ok(Math.abs(hop.vy - (PLAYER.jumpSpeed - PLAYER.gravity * dt)) < 1e-9);
        assert.ok(Math.hypot(hop.vx, hop.vz) < 5);
    }
    // Standing still: no leap
    const still = stepMovement({ ...body(), vx: 0 }, input(), arena, dt, DEFAULT_RULESET, [longJumpMovement]);
    assert.equal(still.jumpKind, 'jump');
});
