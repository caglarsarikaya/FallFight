import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../shared/game/GameRoom.js';
import { JETPACK } from '../shared/features/jetpack/config.js';
import { jetpackMovement } from '../shared/features/jetpack/movement.js';
import { DEFAULT_RULESET } from '../shared/ruleset.js';
import { stepMovement } from '../shared/physics.js';
import { createRng } from '../shared/math.js';
import { run, recorder } from './helpers.js';

function zombieRoom() {
    const events = [];
    const room = new GameRoom({ mode: 'zombies', map: 'de_dust_mini', rng: createRng(3), emit: recorder(events) });
    room.eventsOf = type => events.filter(e => e.type === type).map(e => e.data);
    return room;
}

const STEP = 1 / 60;
const fly = (body, arena, jetpack, seconds, move = {}) => {
    for (let t = 0; t < seconds; t += STEP) stepMovement(body, { moveX: 0, moveZ: 0, ...move, jetpack }, arena, STEP, DEFAULT_RULESET, [jetpackMovement]);
};

test('jetpack: a zombie drop is picked up and kept, only one at a time', () => {
    const room = zombieRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    assert.ok(room.pickups.drop('jetpack', room.arena, a, room.time, 30));
    room.tick(1 / 30);
    assert.equal(a.jetpack, true);
    assert.equal(room.playerJSON(a, true).jetpack, true);
    room.pickups.drop('jetpack', room.arena, a, room.time, 30);
    room.tick(1 / 30);
    assert.equal([...room.pickups.pickups.values()].filter(p => p.type === 'jetpack').length, 1, 'the second one stays on the ground');
});

test('jetpack: lost on death, even after a revive', () => {
    const room = zombieRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    a.jetpack = true;
    room.kill(a, null, 'fall');
    assert.equal(a.jetpack, false);
    room.feature('revive').reviveInPlace(a, 50);
    assert.equal(a.jetpack, false);
});

test('jetpack: zombies drop it rarely, under the drop table', () => {
    const room = zombieRoom();
    room.addPlayer({ id: 'a', name: 'A' });
    run(room, 1);
    for (let i = 0; i < 2000; i++) {
        room.mode.dropLoot({ x: 0, y: 1, z: 0 });
        room.pickups.pickups.clear();
    }
    const drops = room.eventsOf('pickupSpawned');
    const jetpacks = drops.filter(p => p.type === 'jetpack').length;
    assert.ok(jetpacks > 0, 'it does drop');
    assert.ok(jetpacks < drops.length / 10, `rare: ${jetpacks} of ${drops.length} drops`);
});

test('jetpack: Shift lifts off and climbs, no keys hovers, Ctrl sinks back down and lands', () => {
    const room = zombieRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const body = { x: a.x, y: a.y, z: a.z, vx: 0, vy: 0, vz: 0, onGround: true, crouching: false };
    const ground = body.y;

    fly(body, room.arena, { up: true, down: false }, 1.5);
    assert.ok(body.flying);
    assert.ok(body.y > ground + 3, `climbed to ${body.y - ground}`);

    fly(body, room.arena, { up: false, down: false }, 1);   // settle into the hover
    const hoverY = body.y;
    fly(body, room.arena, { up: false, down: false }, 2);
    assert.ok(Math.abs(body.y - hoverY) < 0.2, 'hovers in place');
    assert.ok(body.flying);

    fly(body, room.arena, { up: false, down: true }, 5);
    assert.ok(body.onGround, 'back on the ground');
    assert.equal(body.flying, false, 'landing ends the flight');

    // Without the jetpack, the same keys do nothing special
    fly(body, room.arena, null, 0.5);
    assert.equal(body.flying, false);
});

test('jetpack: WASD flies level, and there is a ceiling', () => {
    const room = zombieRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const body = { x: a.x, y: a.y, z: a.z, vx: 0, vy: 0, vz: 0, onGround: true, crouching: false };
    fly(body, room.arena, { up: true, down: false }, 30);
    assert.ok(body.y <= room.arena.height + JETPACK.ceiling + 1e-6);
    fly(body, room.arena, { up: false, down: false }, 2, { moveX: 1, moveZ: 0 });
    assert.ok(Math.abs(body.vx - JETPACK.speed) < 0.5, `flies at ${body.vx}`);
});

test('jetpack: carriers take no fall damage', () => {
    const room = zombieRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    a.protectedUntil = 0;
    a.jetpack = true;
    room.onState(a, { x: a.x, y: a.y + 12, z: a.z, vx: 0, vy: -20, vz: 0, yaw: 0, pitch: 0, onGround: false, flying: true });
    assert.equal(a.flying, true);
    room.onState(a, { x: a.x, y: a.y - 12, z: a.z, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: true });
    assert.equal(a.health, 100);
});
