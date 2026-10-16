import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FALL_DAMAGE, PLAYER } from '../shared/constants.js';
import { C2S } from '../shared/protocol.js';
import { createRoom, place } from './helpers.js';

// Send the states a client would: in the air coming down at the speed a drop of `blocks` gives,
// then standing on the ground
function land(room, player, blocks) {
    const speed = Math.sqrt(2 * PLAYER.gravity * blocks);
    const at = { x: player.x, y: player.y, z: player.z, vx: 0, vz: 0, yaw: 0, pitch: 0 };
    room.handleMessage(player.id, C2S.STATE, { ...at, vy: -speed, onGround: false });
    room.handleMessage(player.id, C2S.STATE, { ...at, vy: 0, onGround: true });
}

function setup() {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    place(room, a, 30, 20);
    return { room, a };
}

test('fall damage: jumps and short drops are free, every block beyond the safe height hurts', () => {
    const { room, a } = setup();
    land(room, a, 1.2);   // a jump
    land(room, a, FALL_DAMAGE.safe);
    assert.equal(a.health, PLAYER.maxHealth);
    assert.equal(room.eventsOf('damage').length, 0);

    land(room, a, 8);
    assert.equal(a.health, PLAYER.maxHealth - (8 - FALL_DAMAGE.safe) * FALL_DAMAGE.perBlock);
    const hit = room.eventsOf('damage').at(-1);
    assert.equal(hit.weapon, 'landing');
    assert.equal(hit.attackerId, null);
});

test('fall damage: the height still left to fall after the last state in the air counts too', () => {
    const { room, a } = setup();
    const at = { x: a.x, z: a.z, vx: 0, vz: 0, yaw: 0, pitch: 0 };
    const speed = Math.sqrt(2 * PLAYER.gravity * 6);
    room.handleMessage('a', C2S.STATE, { ...at, y: a.y + 2, vy: -speed, onGround: false });
    room.handleMessage('a', C2S.STATE, { ...at, y: a.y - 2, vy: 0, onGround: true });
    assert.equal(a.health, PLAYER.maxHealth - (6 + 2 - FALL_DAMAGE.safe) * FALL_DAMAGE.perBlock);
});

test('fall damage: armor does not help, and a long enough fall kills', () => {
    const { room, a } = setup();
    a.armor = 100;
    land(room, a, FALL_DAMAGE.safe + 100 / FALL_DAMAGE.perBlock + 1);
    assert.equal(a.alive, false);
    assert.equal(a.armor, 100);
    assert.equal(room.eventsOf('death').at(-1).cause, 'landing');
});

test('fall damage: spawn protection covers it, and running down stairs never adds up to a fall', () => {
    const { room, a } = setup();
    a.protectedUntil = room.time + 5;
    land(room, a, 10);
    assert.equal(a.health, PLAYER.maxHealth);
    a.protectedUntil = 0;
    // Eight one-block steps down, touching ground on each
    for (let i = 0; i < 8; i++) land(room, a, 1);
    assert.equal(a.health, PLAYER.maxHealth);
});
