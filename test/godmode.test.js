import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../shared/game/GameRoom.js';
import { GOD_MODE } from '../shared/features/angel/config.js';
import { WEAPON_SLOT } from '../shared/config/weapons.js';
import { createRng } from '../shared/math.js';
import { run, recorder } from './helpers.js';

function zombieRoom() {
    const events = [];
    const room = new GameRoom({ mode: 'zombies', map: 'de_dust_mini', rng: createRng(3), emit: recorder(events) });
    room.eventsOf = type => events.filter(e => e.type === type).map(e => e.data);
    return room;
}

const DOWN = { x: 0, y: -1, z: 0 };

test('angel: a zombie drop goes into slot 8, only one carried at a time', () => {
    const room = zombieRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    assert.equal(a.inventory.hotbar[WEAPON_SLOT.EXTRA], null, 'no slot until you have one');
    const drop = room.pickups.drop('godmode', room.arena, a, room.time, 30);
    assert.ok(drop);
    room.tick(1 / 30);
    assert.equal(a.inventory.count('godmode'), 1);
    assert.equal(a.inventory.hotbar[WEAPON_SLOT.EXTRA], 'godmode');
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

    assert.ok(room.useItem(a, WEAPON_SLOT.EXTRA, DOWN));
    assert.equal(a.inventory.count('godmode'), 0);
    assert.equal(a.inventory.hotbar[WEAPON_SLOT.EXTRA], null, 'slot gone once used');
    assert.notEqual(a.inventory.selected, WEAPON_SLOT.EXTRA);
    assert.equal(room.eventsOf('action').at(-1).action, 'angel');
    assert.ok(room.playerJSON(a, true).godLeft > GOD_MODE.duration - 0.1);

    room.mode.zombieAttack(z, a, 30);
    assert.equal(a.health, 100);
    assert.equal(a.armor, 50, 'claws do not even scratch the armor');
    assert.equal(room.damage(a, 30, z, 'glock'), false, 'zombie gunners miss too');
    assert.equal(room.damage(a, 10, null, 'landing'), false, 'falls do not hurt either');

    room.time += GOD_MODE.duration + 0.1;
    assert.equal(room.playerJSON(a, true).godLeft, 0);
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

test('angel: a hit that would kill you brings it out by itself, and the hit never lands', () => {
    const room = zombieRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const z = room.addPlayer({ id: 'z', name: 'Z' });
    z.isZombie = true;
    a.protectedUntil = 0;
    a.health = 5;
    a.armor = 40;
    a.inventory.add('godmode', 1);

    room.mode.zombieAttack(z, a, 30);
    assert.ok(a.alive);
    assert.equal(a.health, 5);
    assert.equal(a.armor, 40, 'armor kept too');
    assert.equal(a.inventory.count('godmode'), 0, 'used up');
    assert.ok(room.playerJSON(a, true).godLeft > GOD_MODE.duration - 0.1);
    const action = room.eventsOf('action').at(-1);
    assert.equal(action.action, 'angel');
    assert.equal(action.auto, true);

    // Untouchable while it lasts
    room.mode.zombieAttack(z, a, 30);
    assert.equal(room.damage(a, 50, z, 'glock'), false);
    assert.ok(a.alive);
    assert.equal(a.health, 5);

    // Then mortal again, and with no angel left the next deadly hit kills
    room.time += GOD_MODE.duration + 0.1;
    room.mode.zombieAttack(z, a, 30);
    assert.equal(a.alive, false);
});

test('angel: saves you from a deadly bullet or fall too, but only when the hit would kill', () => {
    for (const [amount, attacker, weapon] of [[50, 'z', 'glock'], [40, null, 'landing']]) {
        const room = zombieRoom();
        const a = room.addPlayer({ id: 'a', name: 'A' });
        const z = room.addPlayer({ id: 'z', name: 'Z' });
        z.isZombie = true;
        a.protectedUntil = 0;
        a.inventory.add('godmode', 1);

        assert.ok(room.damage(a, 20, attacker && z, weapon), 'a hit you survive lands');
        assert.equal(a.health, 80);
        assert.equal(a.inventory.count('godmode'), 1, 'and keeps the angel');

        a.health = 20;
        assert.equal(room.damage(a, amount, attacker && z, weapon), false, `${weapon}: saved`);
        assert.ok(a.alive);
        assert.equal(a.inventory.count('godmode'), 0);
    }
});

test('angel: without one a deadly hit kills, and nothing saves you from the void', () => {
    const room = zombieRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    a.protectedUntil = b.protectedUntil = 0;
    room.damage(a, 200, null, 'landing');
    assert.equal(a.alive, false);

    b.inventory.add('godmode', 1);
    room.fall(b);
    assert.equal(b.alive, false);
});
