import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../shared/game/GameRoom.js';
import { buyItem, sightItem } from '../shared/features/shop/Shop.js';
import { SIGHTS, canMount } from '../shared/config/sights.js';
import { WEAPONS, WEAPON_SLOT } from '../shared/config/weapons.js';
import { inaccuracy } from '../shared/spread.js';
import { C2S } from '../shared/protocol.js';
import { createRng } from '../shared/math.js';
import { recorder } from './helpers.js';

function setup(gun = 'ak47', money = 5000) {
    const room = new GameRoom({ mode: 'teambuy', map: 'fy_pool_day', rng: createRng(3), emit: recorder([]) });
    const p = room.addPlayer({ id: 'a', name: 'A' });
    room.tick(1 / 30);
    p.money = money;
    if (gun) p.inventory.select(p.inventory.give(gun));
    return { room, p };
}

test('guns opt in to sights through their spec', () => {
    assert.ok(canMount(WEAPONS.ak47, 'holo'));
    assert.ok(canMount(WEAPONS.glock, 'reddot'));
    assert.ok(!canMount(WEAPONS.glock, 'holo'));
    assert.ok(canMount(WEAPONS.m3, 'iron'));
    assert.ok(!canMount(WEAPONS.m3, 'reddot'));
    assert.ok(!canMount(WEAPONS.awp, 'iron'));
});

test('buying a sight mounts it on the gun in the chosen slot', () => {
    const { room, p } = setup();
    const result = buyItem(room, p, sightItem('holo', WEAPON_SLOT.PRIMARY));
    assert.equal(result.ok, true);
    assert.equal(p.money, 5000 - SIGHTS.holo.price);
    assert.equal(p.inventory.sights.ak47, 'holo');
    assert.equal(p.inventory.toJSON().sights.ak47, 'holo');
    // The pistol slot is separate
    const pistol = p.inventory.hotbar[WEAPON_SLOT.SECONDARY];
    assert.ok(buyItem(room, p, sightItem('reddot', WEAPON_SLOT.SECONDARY)).ok);
    assert.equal(p.inventory.sights[pistol], 'reddot');
    // Swapping optics is allowed, the same one again is not
    assert.equal(buyItem(room, p, sightItem('holo', 0)).error, 'owned');
    assert.ok(buyItem(room, p, sightItem('reflex', 0)).ok);
    assert.equal(p.inventory.sights.ak47, 'reflex');
});

test('a sight needs a gun that takes it, and the money', () => {
    const { room, p } = setup(null);
    assert.equal(buyItem(room, p, sightItem('reddot', 0)).error, 'nogun');
    p.inventory.give('awp');
    assert.equal(buyItem(room, p, sightItem('reddot', 0)).error, 'unfit');
    p.inventory.give('ak47');
    p.money = 100;
    assert.equal(buyItem(room, p, sightItem('reddot', 0)).error, 'money');
    assert.equal(buyItem(room, p, 'sight_iron_0').error, 'unknown');
    assert.equal(buyItem(room, p, sightItem('reddot', 4)).error, 'unknown');
});

test('free in Deathmatch', () => {
    const { room, p } = setup();
    assert.deepEqual(buyItem(room, p, sightItem('holo', 0), { free: true }), { ok: true, price: 0 });
    assert.equal(p.money, 5000);
});

test('the sight goes with the gun: replaced or a new life', () => {
    const { room, p } = setup();
    buyItem(room, p, sightItem('holo', 0));
    p.inventory.give('m4a1');
    assert.equal(p.inventory.sights.ak47, undefined);
    assert.equal(p.inventory.sights.m4a1, undefined);
    buyItem(room, p, sightItem('holo', 0));
    p.inventory.reset();
    assert.deepEqual(p.inventory.sights, {});
});

test('aiming down sights tightens the spread of sight guns only', () => {
    const state = { speed: 0, onGround: true };
    assert.ok(inaccuracy(WEAPONS.ak47, { ...state, aiming: true }) < inaccuracy(WEAPONS.ak47, state));
    const moving = { speed: 5, onGround: true };
    assert.ok(inaccuracy(WEAPONS.ak47, { ...moving, aiming: true }) < inaccuracy(WEAPONS.ak47, moving));
    assert.equal(inaccuracy(WEAPONS.awp, { ...state, aiming: true }), inaccuracy(WEAPONS.awp, state));
});

test('the server only lets sight guns aim, and drops it on reload and switch', () => {
    const { room, p } = setup();
    room.handleMessage('a', C2S.AIM, { on: true });
    assert.equal(p.gun.aiming, true);
    p.inventory.ammo.ak47.mag = 5;
    room.reload(p);
    assert.equal(p.gun.aiming, false);
    p.gun.reload = null;
    room.handleMessage('a', C2S.AIM, { on: true });
    room.select(p, WEAPON_SLOT.SECONDARY);
    assert.equal(p.gun.aiming, false);
    p.inventory.select(p.inventory.give('awp'));
    room.handleMessage('a', C2S.AIM, { on: true });
    assert.equal(p.gun.aiming, false);
});
