import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, PICKUPS, PLAYER } from '../shared/constants.js';
import { Arena } from '../shared/world/Arena.js';
import { stepMovement } from '../shared/physics.js';
import { createRoom, place, run } from './helpers.js';

test('a kill grants the killer exactly one health potion', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    place(room, a, 10, 10);
    place(room, b, 10, 8);
    b.health = 10;

    room.useItem(a, 1, { x: 0, y: -0.1, z: -1 });
    assert.equal(b.alive, false);
    assert.equal(a.kills, 1);
    assert.equal(b.deaths, 1);
    assert.equal(a.inventory.count('health_potion'), 1);
    const death = room.eventsOf('death').at(-1);
    assert.deepEqual([death.victimId, death.killerId], ['b', 'a']);
});

test('falling after an opponent broke your block credits them', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    place(room, a, 10, 10);
    place(room, b, 10, 8);

    // A chops the block B stands on
    room.useItem(a, 1, { x: 0, y: -1.6, z: -2 });
    run(room, 0.5);
    // B's client reports falling into the void
    room.handleMessage('b', 'state', { x: b.x, y: ARENA.voidY - 1, z: b.z, vx: 0, vy: -10, vz: 0, yaw: 0, pitch: 0, onGround: false });

    assert.equal(b.alive, false);
    const death = room.eventsOf('death').at(-1);
    assert.deepEqual([death.victimId, death.killerId, death.cause], ['b', 'a', 'fall']);
    assert.equal(a.inventory.count('health_potion'), 1);
});

test('falling on your own gives no credit', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    room.handleMessage('a', 'state', { x: 0, y: ARENA.voidY - 1, z: 0, vx: 0, vy: -10, vz: 0, yaw: 0, pitch: 0, onGround: false });
    assert.equal(room.eventsOf('death').at(-1).killerId, null);
});

test('respawn after the delay with full health and the default loadout', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    a.inventory.add('health_potion', 3);
    a.inventory.counts.arrow = 0;
    room.kill(a, null, 'test');

    run(room, PLAYER.respawnDelay - 0.2);
    assert.equal(a.alive, false);
    run(room, 0.4);
    assert.equal(a.alive, true);
    assert.equal(a.health, PLAYER.maxHealth);
    assert.equal(a.inventory.count('arrow'), 5);
    assert.equal(a.inventory.count('health_potion'), 0);
    assert.ok(a.isProtected(room.time), 'spawn protection');
});

test('spawn protection blocks damage', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    assert.ok(b.isProtected(room.time));
    assert.equal(room.damage(b, 10, a, 'axe'), false);
    assert.equal(b.health, PLAYER.maxHealth);
});

test('pickups spawn every 15s (arrows) and 60s (potion); first player to touch takes it', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    place(room, a, 0, 0);
    place(room, b, 1, 0);

    run(room, PICKUPS.arrow.interval - 0.5);
    assert.equal(room.eventsOf('pickupSpawned').length, 0);
    run(room, 1);
    const arrow = room.eventsOf('pickupSpawned')[0];
    assert.equal(arrow.type, 'arrow');

    // Both players arrive; whoever is processed first wins, the other gets nothing
    for (const p of [a, b]) Object.assign(p, { x: arrow.x, z: arrow.z, y: 0 });
    room.tick(1 / 30);
    const taken = room.eventsOf('pickupTaken');
    assert.equal(taken.length, 1);
    const winner = taken[0].by === 'a' ? a : b;
    const loser = winner === a ? b : a;
    assert.equal(winner.inventory.count('arrow'), 5 + PICKUPS.arrow.amount);
    assert.equal(loser.inventory.count('arrow'), 5);
    assert.equal(room.pickups.pickups.size, 0);

    for (const p of [a, b]) place(room, p, 0, p === a ? 0 : 1);
    run(room, 60);
    assert.ok(room.eventsOf('pickupSpawned').some(p => p.type === 'health_potion'));
});

test('profile changes are sanitised and broadcast', () => {
    const room = createRoom();
    room.addPlayer({ id: 'a', name: 'A' });
    room.handleMessage('a', 'profile', { name: '  <b>Hacker</b>  ', characterId: 'doctor-octopus' });
    const update = room.eventsOf('playerUpdated').at(-1);
    assert.equal(update.name, 'bHackerb');
    assert.equal(update.characterId, 'doctor-octopus');
    room.handleMessage('a', 'profile', { name: 'X', characterId: 'nope' });
    assert.equal(room.players.get('a').characterId, 'doctor-octopus');
});

test('physics: walk speed, jump height, falling through a hole', () => {
    const arena = new Arena();
    const body = { x: 0.5, y: 0, z: 0.5, vx: 0, vy: 0, vz: 0, onGround: true };
    for (let i = 0; i < 60; i++) stepMovement(body, { moveX: 1, moveZ: 0, jump: false }, arena, 1 / 60);
    assert.ok(body.vx > PLAYER.walkSpeed * 0.95 && body.vx <= PLAYER.walkSpeed + 1e-9);
    assert.equal(body.y, 0);

    let peak = 0;
    stepMovement(body, { moveX: 0, moveZ: 0, jump: true }, arena, 1 / 60);
    for (let i = 0; i < 60; i++) {
        stepMovement(body, { moveX: 0, moveZ: 0, jump: false }, arena, 1 / 60);
        peak = Math.max(peak, body.y);
    }
    assert.ok(peak > 1.0 && peak < 1.4, `jump peak ${peak}`);
    assert.equal(body.onGround, true);

    // Remove the tile under the body: it falls
    const { ix, iz } = arena.tileAt(body.x, body.z);
    arena.setTile(ix, iz, 2);
    Object.assign(body, { x: arena.tileCenter(ix, iz).x, z: arena.tileCenter(ix, iz).z });
    for (let i = 0; i < 30; i++) stepMovement(body, { moveX: 0, moveZ: 0, jump: false }, arena, 1 / 60);
    assert.ok(body.y < -1);
});

test('arena raycast finds the tile under the crosshair', () => {
    const arena = new Arena();
    const hit = arena.raycast({ x: 0.5, y: 1.6, z: 0.5 }, { x: 0, y: -0.6247, z: -0.7809 }, 4);
    assert.ok(hit);
    assert.equal(arena.tileCenter(hit.ix, hit.iz).z, -1.5);
    assert.equal(arena.raycast({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 1, z: 0 }, 4), null);
});
