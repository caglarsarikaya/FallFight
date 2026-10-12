import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getItem, registerItem } from '../shared/items/ItemRegistry.js';
import { Item } from '../shared/items/Item.js';
import { MeleeWeapon, RangedWeapon, Weapon } from '../shared/items/Weapon.js';
import { Consumable } from '../shared/items/Consumable.js';
import { Inventory } from '../shared/inventory/Inventory.js';
import { AXE, BOW, LOADOUT, PLAYER, POTION } from '../shared/constants.js';
import { createRoom, place } from './helpers.js';

test('item hierarchy', () => {
    assert.ok(getItem('axe') instanceof MeleeWeapon);
    assert.ok(getItem('bow') instanceof RangedWeapon);
    assert.ok(getItem('axe') instanceof Weapon && getItem('axe') instanceof Item);
    assert.ok(getItem('health_potion') instanceof Consumable);
    assert.equal(getItem('axe').damage, 10);
    assert.equal(getItem('bow').damage, 20);
    assert.throws(() => registerItem(getItem('axe')), /already registered/);
});

test('default inventory: bow, axe, potion; 5 arrows', () => {
    const inv = new Inventory();
    assert.deepEqual(inv.hotbar, ['bow', 'axe', 'health_potion']);
    assert.equal(inv.count('arrow'), 5);
    assert.equal(inv.count('health_potion'), 0);
    assert.equal(inv.selectedItem.id, 'bow');
    assert.ok(inv.select(1));
    assert.equal(inv.selectedItem.id, 'axe');
    assert.ok(!inv.select(9));
    assert.ok(!inv.consume('health_potion'));
});

test('axe hits a player in front for 10 damage with knockback', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    place(room, a, 10, 10);
    place(room, b, 10, 8); // 2 blocks towards -Z (yaw 0 looks at -Z)

    assert.ok(room.useItem(a, 1, { x: 0, y: -0.1, z: -1 }));
    assert.equal(b.health, PLAYER.maxHealth - AXE.damage);
    const dmg = room.eventsOf('damage').at(-1);
    assert.equal(dmg.weapon, 'axe');
    assert.ok(dmg.knockback.z < 0, 'pushed away from the attacker');

    // Cooldown blocks an immediate second swing
    assert.ok(!room.useItem(a, 1, { x: 0, y: -0.1, z: -1 }));
    assert.equal(b.health, PLAYER.maxHealth - AXE.damage);
});

test('axe breaks the aimed floor block when no player is hit; it regrows later', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    place(room, a, 10, 10);
    // Look down at the tile 2 ahead
    const dir = { x: 0, y: -1.6, z: -2 };
    assert.ok(room.useItem(a, 1, dir));
    const crack = room.eventsOf('blockCracking').at(-1);
    assert.deepEqual([crack.ix, crack.iz], [10, 8]);
    assert.ok(room.arena.isSolidTile(10, 8), 'still holds while cracking');

    for (let i = 0; i < 15; i++) room.tick(1 / 30);
    assert.ok(!room.arena.isSolidTile(10, 8), 'gone after the break delay');
    for (let i = 0; i < 30 * 21; i++) room.tick(1 / 30);
    assert.ok(room.arena.isSolidTile(10, 8), 'regrown');
});

test('bow needs a draw, consumes arrows and deals 20 damage', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    place(room, a, 15, 20);
    place(room, b, 15, 12);

    assert.ok(!room.useItem(a, 0, { x: 0, y: 0, z: -1 }, 0.05), 'too short a draw');
    assert.equal(a.inventory.count('arrow'), 5);

    assert.ok(room.useItem(a, 0, { x: 0, y: 0.03, z: -1 }, BOW.fullDraw));
    assert.equal(a.inventory.count('arrow'), 4);
    for (let i = 0; i < 30 && b.health === PLAYER.maxHealth; i++) room.tick(1 / 30);
    assert.equal(b.health, PLAYER.maxHealth - BOW.damage);
    assert.equal(room.eventsOf('projectileEnd').at(-1).hitId, 'b');
});

test('bow cannot fire without arrows', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    place(room, a, 15, 15);
    a.inventory.counts.arrow = 0;
    assert.ok(!room.useItem(a, 0, { x: 0, y: 0, z: -1 }, 1));
    assert.equal(room.projectiles.size, 0);
});

test('health potion heals 20, capped at max, and is consumed', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    a.inventory.add('health_potion', 2);

    assert.ok(!room.useItem(a, 2, { x: 0, y: 0, z: -1 }), 'not wasted at full health');
    assert.equal(a.inventory.count('health_potion'), 2);

    a.health = 50;
    assert.ok(room.useItem(a, 2, { x: 0, y: 0, z: -1 }));
    assert.equal(a.health, 50 + POTION.heal);
    assert.equal(a.inventory.count('health_potion'), 1);

    a.health = 95;
    room.tick(POTION.cooldown + 0.01);
    assert.ok(room.useItem(a, 2, { x: 0, y: 0, z: -1 }));
    assert.equal(a.health, PLAYER.maxHealth);
    assert.equal(a.inventory.count('health_potion'), 0);
});

test('starting loadout matches LOADOUT', () => {
    assert.equal(LOADOUT.arrow, 5);
});
