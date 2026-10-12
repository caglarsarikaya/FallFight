import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, run } from './helpers.js';

test('bots-only match: bots fight, dig, use both weapons and score kills', () => {
    const room = createRoom(42);
    room.setBotCount(4);
    run(room, 180);

    const deaths = room.eventsOf('death');
    const actions = room.eventsOf('action');
    assert.ok(deaths.length >= 4, `expected kills, got ${deaths.length} deaths`);
    assert.ok(deaths.some(d => d.killerId), 'some deaths are credited kills');
    assert.ok(actions.some(a => a.item === 'axe'), 'bots swing axes');
    assert.ok(actions.some(a => a.item === 'bow'), 'bots shoot bows');
    assert.ok(room.eventsOf('blockCracking').length > 0, 'bots dig the floor');
    assert.ok(room.eventsOf('pickupTaken').some(p => p.by), 'bots collect pickups');

    const players = [...room.players.values()];
    const kills = players.reduce((n, p) => n + p.kills, 0);
    assert.ok(kills > 0);
    for (const p of players) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
});

test('setBotCount adds and removes bots', () => {
    const room = createRoom();
    room.setBotCount(3);
    assert.equal(room.bots.size, 3);
    room.setBotCount(1);
    assert.equal(room.bots.size, 1);
    assert.equal(room.players.size, 1);
});

test('bots race for pickups and grab them quickly', () => {
    const room = createRoom(11);
    room.setBotCount(4);
    run(room, 240);

    const spawned = room.timedEventsOf('pickupSpawned');
    const taken = new Map(room.timedEventsOf('pickupTaken').map(e => [e.data.id, e]));
    const waits = spawned
        .filter(e => taken.get(e.data.id)?.data.by)
        .map(e => taken.get(e.data.id).time - e.time);
    // The 60x60 arena means longer runs, but bots still go after them
    assert.ok(spawned.length >= 8, `pickups spawned: ${spawned.length}`);
    assert.ok(waits.length >= spawned.length * 0.7, `collected ${waits.length}/${spawned.length}`);
    const average = waits.reduce((a, b) => a + b, 0) / waits.length;
    assert.ok(average < 25, `average wait ${average.toFixed(1)}s`);
});

test('bots climb sniper towers and shoot from the top', () => {
    const room = createRoom(5);
    room.setBotCount(4);
    let topShots = 0;
    room.emit = ((emit) => (target, type, data) => {
        if (type === 'projectile') {
            const shooter = room.players.get(data.ownerId);
            if (shooter && shooter.y >= 8) topShots++;
        }
        emit(target, type, data);
    })(room.emit);
    run(room, 240);
    assert.ok(topShots > 0, 'some arrows were fired from a sniper top');
});
