import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../shared/game/GameRoom.js';
import { GUN_GAME, MODES } from '../shared/config/modes.js';
import { MATCH } from '../shared/constants.js';
import { getMap } from '../shared/world/maps/index.js';
import { createRng } from '../shared/math.js';
import { run } from './helpers.js';

function modeRoom(mode, seed = 7) {
    const events = [];
    const room = new GameRoom({ mode, rng: createRng(seed), emit: (target, type, data) => events.push({ target, type, data }) });
    room.eventsOf = type => events.filter(e => e.type === type).map(e => e.data);
    return room;
}

test('every mode lists at least one map that exists', () => {
    for (const mode of MODES) assert.ok(mode.maps.some(id => getMap(id)), mode.id);
});

test('deathmatch: a kill is worth a point and a health potion', () => {
    const room = modeRoom('ffa');
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    room.kill(b, a, 'ak47');
    assert.equal(a.score, 1);
    assert.equal(a.inventory.count('health_potion'), 1);
});

test('deathmatch: the buy menu is free and a bought gun comes back every life', () => {
    const room = modeRoom('ffa');
    const a = room.addPlayer({ id: 'a', name: 'A' });
    a.inventory.give('m4a1');
    assert.equal(room.handleMessage('a', 'buy', { item: 'ak47' }).ok, true);
    assert.equal(a.inventory.selectedId, 'ak47');
    assert.equal(a.money ?? 0, 0, 'no money needed');
    assert.equal(a.randomGuns, false, 'buying a gun turns random guns off');
    a.inventory.ammo.ak47.reserve = 0;
    assert.equal(room.buy(a, 'ak47').ok, true, 'buying it again refills it');
    assert.equal(a.inventory.ammo.ak47.reserve > 0, true);
    for (let i = 0; i < 5; i++) {
        room.kill(a, null, 'fall');
        run(room, 3.5);
        assert.equal(a.inventory.hotbar[0], 'ak47');
    }
    // Random guns back on: spawns roll again
    room.handleMessage('a', 'prefs', { randomGuns: true });
    const seen = new Set();
    for (let i = 0; i < 12; i++) {
        room.kill(a, null, 'fall');
        run(room, 3.5);
        seen.add(a.inventory.hotbar[0]);
    }
    assert.ok(seen.size > 1);
});

test('deathmatch: random guns off before buying keeps the current guns', () => {
    const room = modeRoom('ffa');
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const guns = a.inventory.hotbar.slice(0, 2);
    room.handleMessage('a', 'prefs', { randomGuns: false });
    room.kill(a, null, 'fall');
    run(room, 3.5);
    assert.deepEqual(a.inventory.hotbar.slice(0, 2), guns);
});

test('gun game: start with the first gun, a new gun every few kills, no potions', () => {
    const room = modeRoom('gungame');
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    assert.deepEqual(a.inventory.hotbar, [null, GUN_GAME.ladder[0], 'knife', 'health_potion', null]);
    assert.equal(a.inventory.selectedId, GUN_GAME.ladder[0]);

    for (let i = 0; i < GUN_GAME.killsPerLevel; i++) {
        room.kill(b, a, 'glock');
        run(room, 3.5); // b respawns
    }
    assert.equal(a.level, 1);
    assert.equal(a.levelKills, 0);
    assert.equal(a.inventory.selectedId, GUN_GAME.ladder[1], 'upgraded on the spot');
    assert.equal(a.inventory.count('health_potion'), 0);
    assert.deepEqual(room.eventsOf('levelUp').at(-1), { id: 'a', level: 1, weapon: GUN_GAME.ladder[1] });
    assert.equal(a.score, GUN_GAME.killsPerLevel);
    // Respawning keeps your level
    room.kill(a, null, 'fall');
    run(room, 3.5);
    assert.equal(a.inventory.selectedId, GUN_GAME.ladder[1]);
});

test('gun game: a knife kill takes a kill (or a level) from the victim', () => {
    const room = modeRoom('gungame');
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    Object.assign(b, { level: 3, levelKills: 2 });
    room.kill(b, a, 'knife');
    assert.deepEqual([b.level, b.levelKills], [3, 1]);
    run(room, 3.5);
    Object.assign(b, { level: 3, levelKills: 0 });
    room.kill(b, a, 'knife');
    assert.deepEqual([b.level, b.levelKills], [2, GUN_GAME.killsPerLevel - 1]);
    run(room, 3.5);
    Object.assign(b, { level: 0, levelKills: 0 });
    room.kill(b, a, 'knife');
    assert.deepEqual([b.level, b.levelKills], [0, 0], 'never below the first gun');
});

test('gun game: the first to finish the ladder (50 kills) wins; the match restarts', () => {
    const room = modeRoom('gungame');
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    const target = GUN_GAME.ladder.length * GUN_GAME.killsPerLevel;
    assert.equal(target, 50);
    for (let i = 0; i < target; i++) {
        b.alive = true;
        b.health = 100;
        room.kill(b, a, 'ak47');
    }
    const end = room.eventsOf('matchEnd').at(-1);
    assert.equal(end.winnerId, 'a');
    assert.equal(end.standings[0].id, 'a');
    assert.equal(end.standings[0].score, 50);
    assert.ok(room.matchOver);

    // Nobody can be hurt between matches
    b.alive = true;
    assert.equal(room.damage(b, 50, a, 'ak47'), false);

    run(room, MATCH.restartDelay + 0.1);
    assert.equal(room.matchOver, null);
    assert.equal(room.eventsOf('matchStart').length, 1);
    assert.deepEqual([a.level, a.levelKills, a.kills, a.score], [0, 0, 0, 0]);
    assert.equal(a.inventory.selectedId, GUN_GAME.ladder[0]);
    assert.ok(a.alive && b.alive);
});

test('gun game with bots: they climb the ladder', () => {
    const room = modeRoom('gungame', 3);
    room.setBotCount(4);
    run(room, 150);
    const levels = [...room.players.values()].map(p => p.level);
    assert.ok(Math.max(...levels) >= 2, `levels ${levels}`);
    assert.ok(room.eventsOf('levelUp').length >= 3);
    const state = room.eventsOf('modeState').at(-1);
    assert.equal(state.mode, 'gungame');
    assert.ok(state.leader);
});

test('snapshots carry the mode fields', () => {
    const room = modeRoom('gungame');
    room.addPlayer({ id: 'a', name: 'A' });
    run(room, 0.2);
    const snap = room.eventsOf('snapshot').at(-1).players[0];
    assert.equal(snap.level, 0);
    assert.equal(snap.levelKills, 0);
    assert.equal(room.eventsOf('welcome')[0].mode, 'gungame');
});
