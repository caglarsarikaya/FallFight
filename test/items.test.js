import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getItem, registerItem } from '../shared/items/ItemRegistry.js';
import { Item } from '../shared/items/Item.js';
import { MeleeWeapon, Weapon } from '../shared/items/Weapon.js';
import { Gun } from '../shared/items/Gun.js';
import { Knife } from '../shared/items/Knife.js';
import { Consumable } from '../shared/items/Consumable.js';
import { Inventory } from '../shared/inventory/Inventory.js';
import { GUN_IDS, KNIFE, WEAPONS } from '../shared/config/weapons.js';
import { PLAYER, POTION } from '../shared/constants.js';
import { createRoom, drawKnife, place } from './helpers.js';

test('item hierarchy: every gun in the table is registered', () => {
    for (const id of GUN_IDS) assert.ok(getItem(id) instanceof Gun, id);
    assert.ok(getItem('knife') instanceof Knife && getItem('knife') instanceof MeleeWeapon);
    assert.ok(getItem('ak47') instanceof Weapon && getItem('ak47') instanceof Item);
    assert.ok(getItem('health_potion') instanceof Consumable);
    assert.throws(() => registerItem(getItem('knife')), /already registered/);
    assert.equal(GUN_IDS.length, 11);
});

test('inventory: CS slots, guns replace guns of the same slot, ammo per gun', () => {
    const inv = new Inventory({ weapons: ['ak47', 'usp'] });
    assert.deepEqual(inv.hotbar, ['ak47', 'usp', 'knife', 'health_potion', null]);
    assert.equal(inv.selectedId, 'ak47');
    assert.deepEqual(inv.ammo.ak47, { mag: 30, reserve: 90 });

    inv.give('awp');
    assert.equal(inv.hotbar[0], 'awp');
    assert.equal(inv.ammo.ak47, undefined, 'the AK is gone with its ammo');
    inv.give('deagle');
    assert.equal(inv.hotbar[1], 'deagle');

    assert.ok(inv.select(2));
    assert.equal(inv.selectedItem.id, 'knife');
    assert.ok(!inv.select(7));

    const empty = new Inventory();
    assert.deepEqual(empty.hotbar, [null, null, 'knife', 'health_potion', null]);
    assert.equal(empty.selectedId, 'knife');
    assert.ok(!empty.select(0), 'no primary to select');
});

test('ammo pickups add a magazine to every gun, capped at the reserve maximum', () => {
    const inv = new Inventory({ weapons: ['m4a1', 'glock'] });
    assert.ok(!inv.needsAmmo());
    assert.ok(!inv.addMagazines(1), 'already full');
    inv.ammo.m4a1.reserve = 0;
    inv.ammo.glock.reserve = 110;
    assert.ok(inv.addMagazines(1));
    assert.equal(inv.ammo.m4a1.reserve, WEAPONS.m4a1.mag);
    assert.equal(inv.ammo.glock.reserve, WEAPONS.glock.reserve);
});

test('knife: slash, heavier stab, backstab kills, chops blocks out of reach of players', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    place(room, a, 22, 22);
    place(room, b, 22, 21); // 1 block towards -Z, facing a (yaw 0 looks at -Z, so b faces away)
    b.yaw = Math.PI;        // b faces a

    assert.ok(!room.fire(a, { slot: 2, dir: { x: 0, y: -0.2, z: -1 } }), 'knife still being drawn');
    drawKnife(room, a);
    assert.ok(room.fire(a, { slot: 2, dir: { x: 0, y: -0.2, z: -1 } }));
    assert.equal(b.health, PLAYER.maxHealth - KNIFE.slash.damage);
    assert.ok(!room.fire(a, { slot: 2, dir: { x: 0, y: -0.2, z: -1 } }), 'slash interval');

    room.tick(KNIFE.slash.interval);
    room.fire(a, { slot: 2, dir: { x: 0, y: -0.2, z: -1 }, alt: true });
    assert.equal(b.health, PLAYER.maxHealth - KNIFE.slash.damage - KNIFE.stab.damage, 'stab to the face');

    // From behind
    const c = room.addPlayer({ id: 'c', name: 'C' });
    place(room, c, 22, 21);
    c.yaw = 0; // looking at -Z, away from a
    b.alive = false;
    room.tick(KNIFE.stab.interval);
    room.fire(a, { slot: 2, dir: { x: 0, y: -0.2, z: -1 }, alt: true });
    assert.equal(c.alive, false, 'backstab');

    // Nobody in reach: the knife chops the aimed block
    room.tick(KNIFE.stab.interval);
    room.fire(a, { slot: 2, dir: { x: 0, y: -1.6, z: -2 } });
    const crack = room.eventsOf('blockCracking').at(-1);
    assert.deepEqual([crack.ix, crack.iy, crack.iz], [22, 0, 20]);
});

test('knife breaks the aimed floor block; it regrows later', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    place(room, a, 22, 22);
    drawKnife(room, a);
    assert.ok(room.fire(a, { slot: 2, dir: { x: 0, y: -1.6, z: -2 } }));
    assert.ok(room.arena.isSolid(22, 0, 20), 'still holds while cracking');
    for (let i = 0; i < 15; i++) room.tick(1 / 30);
    assert.ok(!room.arena.isSolid(22, 0, 20), 'gone after the break delay');
    for (let i = 0; i < 30 * 21; i++) room.tick(1 / 30);
    assert.ok(room.arena.isSolid(22, 0, 20), 'regrown');
});

test('health potion heals 20, capped at max, and is consumed', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    a.inventory.add('health_potion', 2);

    assert.ok(!room.useItem(a, 3, { x: 0, y: 0, z: -1 }), 'not wasted at full health');
    assert.equal(a.inventory.count('health_potion'), 2);

    a.health = 50;
    assert.ok(room.useItem(a, 3, { x: 0, y: 0, z: -1 }));
    assert.equal(a.health, 50 + POTION.heal);
    assert.equal(a.inventory.count('health_potion'), 1);

    a.health = 95;
    room.tick(POTION.cooldown + 0.01);
    assert.ok(room.useItem(a, 3, { x: 0, y: 0, z: -1 }));
    assert.equal(a.health, PLAYER.maxHealth);
    assert.equal(a.inventory.count('health_potion'), 0);
});

test('guns cannot be fired through useItem, potions cannot be fired', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    assert.ok(!room.useItem(a, 0, { x: 0, y: 0, z: -1 }));
    a.inventory.add('health_potion', 1);
    a.health = 50;
    assert.ok(!room.fire(a, { slot: 3, dir: { x: 0, y: 0, z: -1 } }));
});
