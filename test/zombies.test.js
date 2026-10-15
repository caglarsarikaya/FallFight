import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../shared/game/GameRoom.js';
import { ZOMBIES } from '../shared/config/modes.js';
import { FlowField, UNREACHED } from '../shared/ai/FlowField.js';
import { Arena } from '../shared/world/Arena.js';
import { MAPS } from '../shared/world/maps/index.js';
import { createRng } from '../shared/math.js';
import { RoomManager } from '../server/RoomManager.js';
import { run } from './helpers.js';

function zombieRoom(map = 'de_dust_mini', seed = 3) {
    const events = [];
    const room = new GameRoom({ mode: 'zombies', map, rng: createRng(seed), emit: (target, type, data) => events.push({ target, type, data }) });
    room.eventsOf = type => events.filter(e => e.type === type).map(e => e.data);
    return room;
}

const zombiesOf = room => [...room.players.values()].filter(p => p.isZombie);

test('waves: zombies arrive after a short delay, more and tougher every wave', () => {
    const room = zombieRoom();
    room.addPlayer({ id: 'a', name: 'A' });
    run(room, ZOMBIES.firstWaveDelay - 0.5);
    assert.equal(zombiesOf(room).length, 0);
    run(room, 1.5);
    assert.equal(room.eventsOf('waveStart')[0].wave, 1);
    assert.ok(zombiesOf(room).length >= 1, 'zombies coming in');
    const one = room.mode.waveStats(1);
    const five = room.mode.waveStats(5);
    assert.equal(one.count, ZOMBIES.baseCount);
    assert.ok(five.count > one.count && five.health > one.health && five.speed > one.speed);
    const z = zombiesOf(room)[0];
    assert.equal(z.health, ZOMBIES.health);
    assert.equal(z.maxHealth, ZOMBIES.health);
    // They come from their spawn zones
    const { ix, iz } = room.arena.tileAt(z.x, z.z);
    assert.ok(room.map.spawns.zombie.some(s => ix >= s.x0 && ix <= s.x1 && iz >= s.z0 && iz <= s.z1));
});

test('zombies hunt down a player who stands still, and the run ends when everyone is down', () => {
    const room = zombieRoom('fy_iceworld');
    const a = room.addPlayer({ id: 'a', name: 'A' });
    for (let t = 0; t < 60 && !room.matchOver; t += 1 / 30) room.tick(1 / 30);
    const hits = room.eventsOf('damage').filter(d => d.victimId === 'a');
    assert.ok(hits.length > 0, 'zombies reached the player');
    assert.equal(hits[0].weapon, 'claws');
    assert.equal(a.alive, false);
    const end = room.eventsOf('matchEnd').at(-1);
    assert.match(end.title, /Overrun on wave 1/);
    assert.equal(end.standings.length, 1, 'zombies are not in the standings');
});

test('zombies are enemies of humans only and never pick up loot', () => {
    const room = zombieRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    run(room, ZOMBIES.firstWaveDelay + 1);
    const [z] = zombiesOf(room);
    assert.equal(room.mode.isEnemy(a, z), true);
    assert.equal(room.mode.isEnemy(a, b), false);
    assert.equal(room.damage(b, 30, a, 'usp'), false, 'no friendly fire');
    assert.equal(room.mode.canPickUp(z), false);
});

test('killing zombies clears the wave; the fallen come back, then the next wave starts', () => {
    const room = zombieRoom('fy_pool_day');
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    room.kill(b, null, 'claws');
    run(room, ZOMBIES.firstWaveDelay + 0.1);
    // Kill everything as it arrives
    for (let i = 0; i < 400 && room.mode.phase === 'wave'; i++) {
        for (const z of zombiesOf(room)) if (z.alive) room.kill(z, a, 'ak47');
        room.tick(1 / 30);
    }
    assert.equal(room.mode.phase, 'break');
    assert.equal(room.eventsOf('waveEnd')[0].wave, 1);
    assert.ok(b.alive, 'b is back for wave 2');
    assert.equal(a.kills, ZOMBIES.baseCount);
    run(room, ZOMBIES.waveBreak + 0.1);
    assert.equal(room.mode.wave, 2);
    // Corpses get cleared away
    run(room, 3);
    assert.ok(zombiesOf(room).every(z => z.alive));
});

test('zombie kills and cleared waves pay money; the shop is open any time, even mid-wave', () => {
    const room = zombieRoom('fy_pool_day');
    const a = room.addPlayer({ id: 'a', name: 'A' });
    assert.equal(a.money, ZOMBIES.startMoney);
    run(room, ZOMBIES.firstWaveDelay + 0.1);
    assert.equal(room.mode.phase, 'wave');
    // Mid-wave purchase
    assert.ok(room.buy(a, 'kevlar').ok);
    const afterKevlar = a.money;
    let kills = 0;
    for (let i = 0; i < 400 && room.mode.phase === 'wave'; i++) {
        for (const z of zombiesOf(room)) {
            if (!z.alive) continue;
            room.kill(z, a, 'usp');
            kills++;
        }
        room.tick(1 / 30);
    }
    assert.equal(a.money, afterKevlar + kills * ZOMBIES.killMoney + ZOMBIES.waveBonus);
    assert.ok(room.buy(a, 'mp5').ok, 'can afford an SMG after the first wave');
    assert.ok(a.inventory.has('mp5'));
    // Zombies can't shop, and the snapshot shows the human's money
    assert.equal(room.mode.playerJSON(a).money, a.money);
});

test('dead zombies drop loot that players can grab', () => {
    const room = zombieRoom('de_dust_mini', 11);
    const a = room.addPlayer({ id: 'a', name: 'A' });
    run(room, ZOMBIES.firstWaveDelay + 0.1);
    let drops = [];
    for (let i = 0; i < 300 && drops.length < 3; i++) {
        for (const z of zombiesOf(room)) if (z.alive) room.kill(z, a, 'usp');
        room.tick(1 / 30);
        drops = room.eventsOf('pickupSpawned');
    }
    assert.ok(drops.length >= 3, `drops: ${drops.length}`);
    // Walk onto an armor or weapon drop
    const pickup = drops[0];
    a.armor = 0;
    Object.assign(a, { x: pickup.x, y: pickup.baseY, z: pickup.z });
    room.tick(1 / 30);
    const taken = room.eventsOf('pickupTaken').find(p => p.id === pickup.id);
    assert.equal(taken?.by, 'a');
    if (pickup.type === 'armor') assert.equal(a.armor, 100);
    if (pickup.type === 'weapon') assert.ok(a.inventory.has(pickup.weapon));
    // Loot left on the floor disappears
    run(room, ZOMBIES.dropLife + 1);
    assert.ok(room.eventsOf('pickupTaken').filter(p => p.by === null).length > 0);
});

test('zombie rooms never fill seats with bots', () => {
    const io = { to: () => ({ emit: () => {} }) };
    const manager = new RoomManager(io, { autoTick: false });
    const { roomId } = manager.join({ id: 's', join: () => {} }, { name: 'S', mode: 'zombies' });
    const room = manager.rooms.get(roomId).room;
    assert.equal(room.bots.size, 0);
    assert.equal(room.mode.id, 'zombies');
});

test('flow field: distance shrinks towards the target, through doors and up stairs', () => {
    const map = MAPS.fy_pool_day;
    const arena = new Arena(map);
    const flow = new FlowField(arena);
    // Target on the west roof; follow the field from the far lawn
    const perch = map.landmarks.sniperPerches[0];
    const c = arena.tileCenter(perch.ix, perch.iz);
    flow.update([{ x: c.x, y: perch.y, z: c.z }]);
    let at = { ix: 30, iz: 5, y: map.floor };
    assert.notEqual(flow.distanceAt(at.ix, at.iz, at.y), UNREACHED);
    for (let i = 0; i < 200; i++) {
        const next = flow.next(at.ix, at.iz, at.y);
        if (!next) break;
        assert.ok(flow.distanceAt(next.ix, next.iz, next.y) < flow.distanceAt(at.ix, at.iz, at.y));
        at = next;
    }
    assert.deepEqual([at.ix, at.iz, at.y], [perch.ix, perch.iz, perch.y], 'arrived on the roof');
});
