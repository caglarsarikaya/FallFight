import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../shared/game/GameRoom.js';
import { TEAM_BUY } from '../shared/config/modes.js';
import { WEAPONS } from '../shared/config/weapons.js';
import { createRng } from '../shared/math.js';
import { run } from './helpers.js';

function teamRoom(seed = 5, map = 'fy_pool_day') {
    const events = [];
    const room = new GameRoom({ mode: 'teambuy', map, rng: createRng(seed), emit: (target, type, data) => events.push({ target, type, data }) });
    room.eventsOf = type => events.filter(e => e.type === type).map(e => e.data);
    return room;
}

// Two humans on opposite teams, round 1 started
function duel() {
    const room = teamRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    room.tick(1 / 30);
    return { room, a, b };
}

const liveRound = room => run(room, TEAM_BUY.freezeTime + 0.1);

test('players are split into two teams who spawn in their own bases', () => {
    const { room, a, b } = duel();
    assert.notEqual(a.team, b.team);
    assert.deepEqual(new Set([a.team, b.team]), new Set(['t', 'ct']));
    for (const p of [a, b]) {
        const { ix, iz } = room.arena.tileAt(p.x, p.z);
        const zone = room.map.spawns[p.team][0];
        assert.ok(ix >= zone.x0 && ix <= zone.x1 && iz >= zone.z0 && iz <= zone.z1, `${p.team} spawned at ${ix},${iz}`);
    }
    assert.equal(room.eventsOf('roundStart')[0].round, 1);
    assert.equal(a.money, TEAM_BUY.startMoney);
    assert.equal(a.inventory.hotbar[1], TEAM_BUY.defaultPistol[a.team]);
    assert.equal(a.armor, 0);
});

test('freeze time: no moving, no shooting; then the round is live', () => {
    const { room, a, b } = duel();
    assert.equal(room.mode.phase, 'freeze');
    const x = a.x;
    room.handleMessage('a', 'state', { x: x + 3, y: a.y, z: a.z, vx: 0, vy: 0, vz: 0, yaw: 1, pitch: 0 });
    assert.equal(a.x, x, 'held in place');
    assert.equal(a.yaw, 1, 'but can look around');
    assert.equal(room.fire(a, { slot: 1, dir: { x: 1, y: 0, z: 0 } }), false);
    liveRound(room);
    assert.equal(room.mode.phase, 'live');
    a.gun.readyAt = 0;
    assert.equal(room.fire(a, { slot: 1, seq: 1, dir: { x: 0, y: -1, z: 0 } }), true);
    assert.ok(b.alive);
});

test('no friendly fire, and teammates are not enemies', () => {
    const room = teamRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    room.addPlayer({ id: 'b', name: 'B' });
    const c = room.addPlayer({ id: 'c', name: 'C' });
    assert.equal(a.team, c.team);
    room.tick(1 / 30);
    liveRound(room);
    assert.equal(room.mode.isEnemy(a, c), false);
    assert.equal(room.damage(c, 50, a, 'ak47'), false);
    assert.equal(c.health, 100);
});

test('wiping out the other team wins the round: money for both sides, the dead wait', () => {
    const { room, a, b } = duel();
    liveRound(room);
    room.kill(b, a, 'ak47');
    assert.equal(b.alive, false);
    assert.equal(b.respawnAt, Infinity, 'no respawn mid-round');
    room.tick(1 / 30);
    const end = room.eventsOf('roundEnd').at(-1);
    assert.deepEqual([end.winner, end.reason], [a.team, 'elimination']);
    assert.equal(room.mode.score[a.team], 1);
    assert.equal(a.money, TEAM_BUY.startMoney + WEAPONS.ak47.killReward + TEAM_BUY.winReward);
    assert.equal(b.money, TEAM_BUY.startMoney + TEAM_BUY.lossReward);

    // Next round: everyone back, the winner keeps their gear
    a.inventory.give('ak47');
    a.inventory.ammo.ak47.mag = 3;
    a.inventory.ammo.ak47.reserve = 0;
    run(room, TEAM_BUY.roundEndDelay + 0.1);
    assert.equal(room.mode.round, 2);
    assert.ok(a.alive && b.alive);
    assert.equal(a.inventory.hotbar[0], 'ak47', 'survivor keeps the rifle');
    assert.deepEqual(a.inventory.ammo.ak47, { mag: WEAPONS.ak47.mag, reserve: WEAPONS.ak47.reserve }, 'with full ammo');
    assert.equal(b.inventory.hotbar[0], null, 'the dead start over with a pistol');
});

test('a losing streak pays more each round', () => {
    const { room, a, b } = duel();
    for (let round = 0; round < 3; round++) {
        liveRound(room);
        const before = b.money;
        b.alive = true;
        room.kill(b, a, 'ak47');
        room.tick(1 / 30);
        assert.equal(b.money - before, TEAM_BUY.lossReward + round * TEAM_BUY.lossBonus);
        run(room, TEAM_BUY.roundEndDelay + 0.1);
    }
});

test('buying: only in buy time, in your base, with the money, and not twice', () => {
    const { room, a } = duel();
    a.money = 3000;
    assert.deepEqual(room.buy(a, 'ak47'), { ok: true, price: WEAPONS.ak47.price });
    assert.equal(a.money, 500);
    assert.equal(a.inventory.selectedId, 'ak47');
    assert.equal(room.buy(a, 'ak47').error, 'owned');
    assert.equal(room.buy(a, 'kevlar_helmet').error, 'money');
    assert.equal(room.buy(a, 'health_potion').ok, true);
    assert.equal(a.inventory.count('health_potion'), 1);
    assert.equal(room.buy(a, 'nonsense').error, 'unknown');
    assert.deepEqual(room.eventsOf('buyResult').at(-1), { item: 'nonsense', ok: false, error: 'unknown' });

    // Vest, then the helmet for the difference
    a.money = 1000;
    assert.ok(room.buy(a, 'kevlar').ok);
    assert.ok(room.buy(a, 'kevlar_helmet').ok);
    assert.equal(a.money, 1000 - TEAM_BUY.kevlarHelmet);
    assert.ok(a.armor === 100 && a.helmet);

    // Away from the base
    a.money = 5000;
    a.x += 25;
    assert.equal(room.buy(a, 'm4a1').error, 'not-now');
    a.x -= 25;
    // After the buy time
    run(room, TEAM_BUY.freezeTime + TEAM_BUY.buyTime);
    assert.equal(room.buy(a, 'm4a1').error, 'not-now');
});

test('ammo refills every gun carried, for a price', () => {
    const { room, a } = duel();
    a.money = 1000;
    assert.equal(room.buy(a, 'ammo').error, 'owned', 'nothing to refill');
    const pistol = a.inventory.hotbar[1];
    a.inventory.ammo[pistol].reserve = 0;
    const result = room.buy(a, 'ammo');
    assert.ok(result.ok && result.price > 0);
    assert.equal(a.inventory.ammo[pistol].reserve, WEAPONS[pistol].reserve);
});

test('primary and secondary ammo refill only their own guns', () => {
    const { room, a } = duel();
    a.money = 5000;
    assert.ok(room.buy(a, 'ak47').ok);
    const pistol = a.inventory.hotbar[1];
    a.inventory.ammo.ak47.reserve = 0;
    a.inventory.ammo[pistol].reserve = 0;
    assert.ok(room.buy(a, 'ammo_primary').ok);
    assert.equal(a.inventory.ammo.ak47.reserve, WEAPONS.ak47.reserve);
    assert.equal(a.inventory.ammo[pistol].reserve, 0, 'pistol untouched');
    assert.ok(room.buy(a, 'ammo_secondary').ok);
    assert.equal(a.inventory.ammo[pistol].reserve, WEAPONS[pistol].reserve);
});

test('first team to the target wins the match, then everything resets', () => {
    const { room, a, b } = duel();
    for (let round = 0; round < TEAM_BUY.roundsToWin; round++) {
        liveRound(room);
        b.alive = true;
        room.kill(b, a, 'usp');
        room.tick(1 / 30);
        run(room, TEAM_BUY.roundEndDelay + 0.1);
    }
    const end = room.eventsOf('matchEnd').at(-1);
    assert.equal(end.winnerTeam, a.team);
    assert.match(end.title, /win the match 8-0/);
    run(room, 10.2);
    assert.equal(room.matchOver, null);
    assert.deepEqual(room.mode.score, { t: 0, ct: 0 });
    assert.equal(a.money, TEAM_BUY.startMoney);
});

test('late joiners wait for the next round', () => {
    const { room } = duel();
    liveRound(room);
    const c = room.addPlayer({ id: 'c', name: 'C' });
    assert.equal(c.alive, false);
    room.tick(1 / 30);
    assert.equal(c.alive, false);
});

test('a bots-only team match plays rounds: bots buy, fight and score', () => {
    const room = teamRoom(9, 'de_dust_mini');
    room.setBotCount(4);
    run(room, 200);
    const ends = room.eventsOf('roundEnd');
    assert.ok(ends.length >= 3, `rounds finished: ${ends.length}`);
    assert.ok(ends.some(e => e.winner), 'someone wins a round');
    const bots = [...room.players.values()];
    const counts = { t: bots.filter(b => b.team === 't').length, ct: bots.filter(b => b.team === 'ct').length };
    assert.deepEqual(counts, { t: 2, ct: 2 });
    assert.ok(room.eventsOf('shot').some(s => ['ak47', 'm4a1', 'mp5', 'p90', 'awp', 'scout', 'm3', 'deagle'].includes(s.w)), 'bots bought guns');
    // Bots never shoot teammates
    for (const d of room.eventsOf('damage')) {
        const victim = room.players.get(d.victimId);
        const attacker = room.players.get(d.attackerId);
        if (victim && attacker) assert.notEqual(victim.team, attacker.team);
    }
});
