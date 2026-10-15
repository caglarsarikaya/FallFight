import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getItem } from '../shared/items/ItemRegistry.js';
import { RocketLauncher } from '../shared/items/RocketLauncher.js';
import { BUYABLE_GUN_IDS, WEAPONS, WEAPON_SLOT } from '../shared/config/weapons.js';
import { RPG } from '../shared/constants.js';
import { S2C } from '../shared/protocol.js';
import { BLOCK_STATE } from '../shared/world/Arena.js';
import { buyItem } from '../shared/game/Shop.js';
import { getMap } from '../shared/world/maps/index.js';
import { Arena } from '../shared/world/Arena.js';
import { createRoom, place, run } from './helpers.js';

const rpgPickups = room => [...room.pickups.pickups.values()].filter(p => p.type === 'rpg');

test('rpg: a one-shot launcher in its own slot that money cannot buy', () => {
    assert.ok(getItem('rpg') instanceof RocketLauncher);
    assert.equal(WEAPONS.rpg.slot, WEAPON_SLOT.SPECIAL);
    assert.ok(!BUYABLE_GUN_IDS.includes('rpg'));
    const room = createRoom();
    const p = room.addPlayer({ id: 'a', name: 'A' });
    p.money = 16000;
    assert.equal(buyItem(room, p, 'rpg', { free: true }).ok, false);
    assert.ok(!p.inventory.has('rpg'));
});

test('rpg spots: every Lava Arena tower top is a reachable place to stand', () => {
    const map = getMap('fallfight_classic');
    const arena = new Arena(map);
    assert.equal(map.rpgSpots.length, 4);
    for (const s of map.rpgSpots) {
        assert.ok(arena.isStandable(s.ix, s.y, s.iz), s.name);
        assert.ok(arena.isReachable(s.ix, s.iz, s.y), s.name);
    }
});

test('rpg: appears on a tower top, only one at a time, picked up into slot 5', () => {
    const room = createRoom();
    assert.equal(room.map.id, 'fallfight_classic');
    const p = room.addPlayer({ id: 'a', name: 'A' });
    run(room, RPG.firstDelay - 1);
    assert.equal(rpgPickups(room).length, 0);
    run(room, 2);
    const [rpg] = rpgPickups(room);
    assert.ok(rpg);
    assert.ok(room.map.rpgSpots.some(s => s.ix === rpg.ix && s.iz === rpg.iz && s.y === rpg.baseY));
    assert.ok(room.eventsOf(S2C.PICKUP_SPAWNED).some(e => e.type === 'rpg' && e.spot));

    place(room, p, rpg.ix, rpg.iz);
    room.tick(1 / 30);
    assert.ok(p.inventory.has('rpg'));
    assert.equal(p.inventory.selected, WEAPON_SLOT.SPECIAL);
    run(room, RPG.cooldown + 5);
    assert.equal(rpgPickups(room).length, 0, 'no second RPG while one is carried');
});

test('rpg: fired once it is gone, the rocket blows up players and blocks', () => {
    const room = createRoom();
    const shooter = room.addPlayer({ id: 'a', name: 'A' });
    const victim = room.addPlayer({ id: 'b', name: 'B' });
    place(room, shooter, 22, 14);
    place(room, victim, 22, 22);
    shooter.inventory.give('rpg');
    room.select(shooter, WEAPON_SLOT.SPECIAL);
    shooter.gun.readyAt = room.time;
    const healthBefore = shooter.health;

    // Aim at the victim's feet along the clear lane
    const eye = shooter.eye;
    const to = { x: victim.x - eye.x, y: victim.y + 0.3 - eye.y, z: victim.z - eye.z };
    const len = Math.hypot(to.x, to.y, to.z);
    assert.ok(room.fire(shooter, { slot: WEAPON_SLOT.SPECIAL, dir: { x: to.x / len, y: to.y / len, z: to.z / len } }));
    assert.ok(!shooter.inventory.has('rpg'), 'single use');
    assert.notEqual(shooter.inventory.selected, WEAPON_SLOT.SPECIAL);
    assert.equal(room.projectiles.size, 1);

    run(room, 1);
    assert.equal(room.projectiles.size, 0);
    const end = room.eventsOf(S2C.PROJECTILE_END).at(-1);
    assert.ok(end.explode > 0);
    assert.ok(victim.health < 100 || !victim.alive, 'the victim got hurt');
    assert.equal(shooter.health, healthBefore, 'never hurt by your own rocket');
    const cracked = room.eventsOf(S2C.BLOCK_CRACKING).filter(e => e.by === 'a');
    assert.ok(cracked.length >= 5, `blocks broken: ${cracked.length}`);
    const { ix, iy, iz } = cracked[0];
    assert.notEqual(room.arena.stateAt(ix, iy, iz), BLOCK_STATE.SOLID);
});

test('rpg: own rocket at your feet only pushes you', () => {
    const room = createRoom();
    const p = room.addPlayer({ id: 'a', name: 'A' });
    place(room, p, 22, 22);
    room.explode({ x: p.x + 0.5, y: p.y, z: p.z }, getItem('rpg'), p);
    assert.equal(p.health, 100);
    const kb = room.eventsOf(S2C.KNOCKBACK).at(-1);
    assert.ok(kb && kb.id === 'a' && kb.knockback.y > 0);
});
