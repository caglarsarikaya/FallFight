import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../shared/game/GameRoom.js';
import { Projectile } from '../shared/game/Projectile.js';
import { getItem } from '../shared/items/ItemRegistry.js';
import { Grenade } from '../shared/items/Grenade.js';
import { buyItem } from '../shared/game/Shop.js';
import { GRENADE } from '../shared/constants.js';
import { TEAM_BUY, ZOMBIES } from '../shared/config/modes.js';
import { WEAPONS, WEAPON_SLOT } from '../shared/config/weapons.js';
import { S2C } from '../shared/protocol.js';
import { createRng } from '../shared/math.js';
import { createRoom, place, run } from './helpers.js';

const DOWN = { x: 0, y: -1, z: 0 };

// A player holding one grenade of this kind, ready to throw
function armed(room, player, id) {
    player.inventory.add(id, 1);
    room.select(player, getItem(id).slot);
    player.cooldowns = {};
}

test('m249: a 100 round machine gun on B 5 1 with cheap spare belts', () => {
    const spec = WEAPONS.m249;
    assert.equal(spec.mag, 100);
    assert.equal(spec.reserve, 200);
    assert.equal(spec.slot, WEAPON_SLOT.PRIMARY);
    assert.ok(spec.auto);
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    a.money = 10000;
    a.inventory.reset({ weapons: [] });
    assert.ok(buyItem(room, a, 'm249').ok);
    assert.deepEqual(a.inventory.ammo.m249, { mag: 100, reserve: 200 });
    a.inventory.ammo.m249.reserve = 0;
    assert.equal(buyItem(room, a, 'ammo_primary').price, spec.ammoPrice);
});

test('grenades: their own slots (6 and 7), one of each, bought in the shop', () => {
    assert.ok(getItem('hegrenade') instanceof Grenade && getItem('smokegrenade') instanceof Grenade);
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    assert.equal(a.inventory.hotbar[WEAPON_SLOT.HE], 'hegrenade');
    assert.equal(a.inventory.hotbar[WEAPON_SLOT.SMOKE], 'smokegrenade');
    a.money = 1000;
    assert.deepEqual(buyItem(room, a, 'hegrenade'), { ok: true, price: GRENADE.he.price });
    assert.equal(buyItem(room, a, 'hegrenade').error, 'owned');
    assert.ok(buyItem(room, a, 'smokegrenade').ok);
    assert.equal(a.money, 1000 - GRENADE.he.price - GRENADE.smoke.price);
    assert.equal(a.inventory.count('hegrenade'), 1);
});

test('grenades bounce off blocks and come to rest on the floor', () => {
    const room = createRoom();
    const c = room.arena.tileCenter(22, 14);
    const floor = room.arena.surfaceHeight(22, 14);
    const g = new Projectile({ id: 1, x: c.x, y: floor + 3, z: c.z, vx: 0, vy: 0, vz: 0, born: 0, gravity: 20, bounce: 0.45, fuse: 10 });
    let lowest = Infinity;
    let rose = false;
    let last = g.y;
    for (let t = 0; t < 3; t += 1 / 30) {
        assert.equal(g.step(1 / 30, room, t), null);
        lowest = Math.min(lowest, g.y);
        if (g.y > last + 1e-6) rose = true;
        last = g.y;
    }
    assert.ok(rose, 'it bounced');
    assert.ok(g.resting, 'it settled');
    assert.ok(lowest >= floor - 0.01 && g.y - floor < 0.1, `rests on the floor (y ${g.y}, floor ${floor})`);
    assert.deepEqual(g.step(1 / 30, room, 10), { type: 'fuse' });
});

test('HE grenade: thrown, goes off after its fuse, hurts enemies close by and breaks blocks', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    place(room, a, 22, 14);
    place(room, b, 22, 16);
    armed(room, a, 'hegrenade');
    assert.ok(room.useItem(a, WEAPON_SLOT.HE, DOWN));
    assert.equal(a.inventory.count('hegrenade'), 0);
    assert.notEqual(a.inventory.selected, WEAPON_SLOT.HE, 'back to a gun');
    assert.equal(room.projectiles.size, 1);
    assert.equal(room.eventsOf(S2C.ACTION).at(-1).action, 'throw');

    run(room, GRENADE.fuse - 0.2);
    assert.equal(room.projectiles.size, 1, 'still ticking');
    run(room, 0.4);
    assert.equal(room.projectiles.size, 0);
    assert.ok(room.eventsOf(S2C.PROJECTILE_END).at(-1).explode > 0);
    const hit = room.eventsOf(S2C.DAMAGE).find(d => d.victimId === 'b');
    assert.ok(hit && hit.weapon === 'hegrenade', 'the enemy got hurt');
    assert.equal(a.health, 100, 'the thrower is only pushed');
    assert.ok(room.eventsOf(S2C.BLOCK_CRACKING).length > 0, 'the floor broke');
    // Nothing left to throw
    assert.equal(room.useItem(a, WEAPON_SLOT.HE, DOWN), false);
});

test('smoke grenade: a cloud that hides the line through it, then clears', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    place(room, a, 22, 14);
    armed(room, a, 'smokegrenade');
    assert.ok(room.useItem(a, WEAPON_SLOT.SMOKE, DOWN));
    run(room, GRENADE.fuse + 0.2);
    const end = room.eventsOf(S2C.PROJECTILE_END).at(-1);
    assert.deepEqual(end.smoke, { radius: GRENADE.smoke.radius, duration: GRENADE.smoke.duration });
    assert.equal(end.explode, 0);
    assert.equal(room.smokes.length, 1);
    const s = room.smokes[0];
    assert.ok(room.smokeBlocks({ x: s.x - 10, y: s.y, z: s.z }, { x: 20, y: 0, z: 0 }), 'through the cloud');
    assert.ok(!room.smokeBlocks({ x: s.x - 10, y: s.y + 10, z: s.z }, { x: 20, y: 0, z: 0 }), 'well above it');
    run(room, GRENADE.smoke.duration);
    assert.equal(room.smokes.length, 0);
});

// ---- F3 rebuy ------------------------------------------------------------------------------

function teamRoom() {
    const events = [];
    const room = new GameRoom({ mode: 'teambuy', map: 'fy_pool_day', rng: createRng(5), emit: (target, type, data) => events.push({ target, type, data }) });
    room.eventsOf = type => events.filter(e => e.type === type).map(e => e.data);
    const a = room.addPlayer({ id: 'a', name: 'A' });
    room.addPlayer({ id: 'b', name: 'B' });
    room.tick(1 / 30);
    // Spent the pistol's spare rounds
    a.inventory.ammo[a.inventory.hotbar[WEAPON_SLOT.SECONDARY]].reserve = 0;
    return { room, a };
}

test('rebuy: with money for everything, fills ammo, armor, two potions and both grenades', () => {
    const { room, a } = teamRoom();
    a.money = 16000;
    const result = room.buy(a, 'rebuy');
    assert.ok(result.ok);
    assert.deepEqual(result.bought, ['ammo', 'kevlar_helmet', 'health_potion', 'health_potion', 'hegrenade', 'smokegrenade']);
    assert.equal(a.armor, 100);
    assert.ok(a.helmet);
    assert.equal(a.inventory.count('health_potion'), 2);
    assert.equal(a.inventory.count('hegrenade'), 1);
    assert.equal(a.inventory.count('smokegrenade'), 1);
    assert.equal(a.money, 16000 - result.price);
    assert.equal(room.eventsOf('buyResult').at(-1).item, 'rebuy');
    // Again: nothing left to buy
    assert.equal(room.buy(a, 'rebuy').error, 'owned');
});

test('rebuy: short of money, ammo comes first, then kevlar, then potions', () => {
    const { room, a } = teamRoom();
    const pistol = WEAPONS[a.inventory.hotbar[WEAPON_SLOT.SECONDARY]];
    const ammo = Math.max(30, Math.round(pistol.price / 25) * 10);
    a.money = ammo + TEAM_BUY.kevlar + 50;
    assert.deepEqual(room.buy(a, 'rebuy').bought, ['ammo', 'kevlar']);
    assert.equal(a.helmet, false);
    assert.equal(a.money, 50);

    a.money = 0;
    assert.equal(room.buy(a, 'rebuy').error, 'money');
});

test('quick buys: N ammo, M kevlar + helmet, H two potions, G both grenades, each on its own', () => {
    const { room, a } = teamRoom();
    a.money = 16000;
    assert.deepEqual(room.buy(a, 'rebuy_armor').bought, ['kevlar_helmet']);
    assert.equal(a.inventory.count('health_potion'), 0, 'armor key buys armor only');
    assert.deepEqual(room.buy(a, 'rebuy_potion').bought, ['health_potion', 'health_potion']);
    assert.deepEqual(room.buy(a, 'rebuy_grenades').bought, ['hegrenade', 'smokegrenade']);
    assert.deepEqual(room.buy(a, 'rebuy_ammo').bought, ['ammo']);
    for (const item of ['rebuy_ammo', 'rebuy_armor', 'rebuy_potion', 'rebuy_grenades']) {
        assert.equal(room.buy(a, item).error, 'owned', item);
    }
    assert.equal(room.buy(a, 'constructor').error, 'unknown');
    assert.ok(!Object.hasOwn(a.inventory.counts, 'constructor'), 'nothing odd added to the inventory');
});

// ---- zombie gunners ------------------------------------------------------------------------

function gunnerRoom() {
    const events = [];
    const room = new GameRoom({ mode: 'zombies', map: 'fallfight_classic', rng: createRng(3), emit: (target, type, data) => events.push({ target, type, data }) });
    room.eventsOf = type => events.filter(e => e.type === type).map(e => e.data);
    const human = room.addPlayer({ id: 'a', name: 'A' });
    // A wave where gunners can come, and a dice roll that makes this one a gunner
    room.mode.wave = ZOMBIES.gunner.fromWave;
    const rng = room.rng;
    room.rng = () => 0.01;
    room.mode.spawnZombie();
    room.rng = rng;
    const zombie = [...room.players.values()].find(p => p.isZombie);
    place(room, human, 22, 26);
    place(room, zombie, 22, 14);
    human.health = human.maxHealth = 10000;   // survive long enough to count the hits
    return { room, human, zombie };
}

test('zombie gunners: a few zombies carry a gun and shoot at people in sight, softly', () => {
    const { room, zombie } = gunnerRoom();
    assert.equal(zombie.name, 'Gunner');
    const gun = zombie.inventory.selectedId;
    assert.ok(ZOMBIES.gunner.guns.includes(gun));
    run(room, 3);
    const shots = room.eventsOf(S2C.SHOT).filter(s => s.id === zombie.id);
    assert.ok(shots.length > 0, 'it shot');
    const hits = room.eventsOf(S2C.DAMAGE).filter(d => d.attackerId === zombie.id && d.weapon === gun);
    assert.ok(hits.length > 0, 'and hit');
    const most = WEAPONS[gun].damage * 4 * ZOMBIES.gunner.damageScale;
    assert.ok(hits.every(h => h.amount <= most), 'hits softer than a person would');
});

test('zombie gunners: no shooting through smoke, and the gun drops when they die', () => {
    const { room, human, zombie } = gunnerRoom();
    const mid = { x: (human.x + zombie.x) / 2, y: zombie.y + 1.4, z: (human.z + zombie.z) / 2 };
    room.smokes.push({ ...mid, radius: 3, until: Infinity });
    run(room, 1);
    assert.equal(room.eventsOf(S2C.SHOT).filter(s => s.id === zombie.id).length, 0);

    const gun = zombie.inventory.selectedId;
    room.damage(zombie, 10000, human, 'usp');
    const drop = room.eventsOf(S2C.PICKUP_SPAWNED).at(-1);
    assert.equal(drop.type, 'weapon');
    assert.equal(drop.weapon, gun);
});
