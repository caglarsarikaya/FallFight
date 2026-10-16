import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../shared/game/GameRoom.js';
import { GOD_MODE } from '../shared/constants.js';
import { WEAPON_SLOT } from '../shared/config/weapons.js';
import { createRng } from '../shared/math.js';
import { run } from './helpers.js';

function zombieRoom() {
    const events = [];
    const room = new GameRoom({ mode: 'zombies', map: 'de_dust_mini', rng: createRng(3), emit: (target, type, data) => events.push({ type, data }) });
    room.eventsOf = type => events.filter(e => e.type === type).map(e => e.data);
    return room;
}

const DOWN = { x: 0, y: -1, z: 0 };

test('angel: a zombie drop goes into slot 8, only one carried at a time', () => {
    const room = zombieRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    assert.equal(a.inventory.hotbar[WEAPON_SLOT.ANGEL], null, 'no slot until you have one');
    const drop = room.pickups.drop('godmode', room.arena, a, room.time, 30);
    assert.ok(drop);
    room.tick(1 / 30);
    assert.equal(a.inventory.count('godmode'), 1);
    assert.equal(a.inventory.hotbar[WEAPON_SLOT.ANGEL], 'godmode');
    // A second one is left lying there
    room.pickups.drop('godmode', room.arena, a, room.time, 30);
    room.tick(1 / 30);
    assert.equal(a.inventory.count('godmode'), 1);
    assert.equal([...room.pickups.pickups.values()].filter(p => p.type === 'godmode').length, 1);
});

test('angel: used from slot 8, zombies can not hurt you for its duration, then they can again', () => {
    const room = zombieRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const z = room.addPlayer({ id: 'z', name: 'Z' });
    z.isZombie = true;
    a.protectedUntil = 0;
    a.armor = 50;
    a.inventory.add('godmode', 1);

    assert.ok(room.useItem(a, WEAPON_SLOT.ANGEL, DOWN));
    assert.equal(a.inventory.count('godmode'), 0);
    assert.equal(a.inventory.hotbar[WEAPON_SLOT.ANGEL], null, 'slot gone once used');
    assert.notEqual(a.inventory.selected, WEAPON_SLOT.ANGEL);
    assert.equal(room.eventsOf('action').at(-1).action, 'angel');
    assert.ok(room.mode.playerJSON(a).godLeft > GOD_MODE.duration - 0.1);

    room.mode.zombieAttack(z, a, 30);
    assert.equal(a.health, 100);
    assert.equal(a.armor, 50, 'claws do not even scratch the armor');
    assert.equal(room.damage(a, 30, z, 'glock'), false, 'zombie gunners miss too');
    assert.ok(room.damage(a, 10, null, 'landing'), 'still mortal otherwise');

    room.time += GOD_MODE.duration + 0.1;
    assert.equal(room.mode.playerJSON(a).godLeft, 0);
    room.mode.zombieAttack(z, a, 30);
    assert.ok(a.health < 90);
});

test('angel: zombies drop it rarely, under the drop table', () => {
    const room = zombieRoom();
    room.addPlayer({ id: 'a', name: 'A' });
    run(room, 1);
    for (let i = 0; i < 2000; i++) {
        room.mode.dropLoot({ x: 0, y: 1, z: 0 });
        room.pickups.pickups.clear();
    }
    const drops = room.eventsOf('pickupSpawned');
    const angels = drops.filter(p => p.type === 'godmode').length;
    assert.ok(angels > 0, 'it does drop');
    assert.ok(angels < drops.length / 10, `rare: ${angels} of ${drops.length} drops`);
});
