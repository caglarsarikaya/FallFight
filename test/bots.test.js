import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, place, run } from './helpers.js';

test('bots-only match: bots shoot, reload, land headshots and score kills', () => {
    const room = createRoom(42);
    room.setBotCount(4);
    run(room, 180);

    const deaths = room.eventsOf('death');
    const shots = room.eventsOf('shot');
    assert.ok(deaths.length >= 6, `expected kills, got ${deaths.length} deaths`);
    assert.ok(deaths.some(d => d.killerId), 'some deaths are credited kills');
    assert.ok(shots.length > 100, `shots fired: ${shots.length}`);
    assert.ok(new Set(shots.map(s => s.w)).size >= 3, 'several different guns');
    assert.ok(room.eventsOf('action').some(a => a.action === 'reload'), 'bots reload');
    assert.ok(room.eventsOf('damage').some(d => d.zone === 'head'), 'some headshots');
    assert.ok(room.eventsOf('pickupTaken').some(p => p.by), 'bots collect pickups');

    const players = [...room.players.values()];
    assert.ok(players.reduce((n, p) => n + p.kills, 0) > 0);
    for (const p of players) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
});

test('setBotCount adds and removes bots', () => {
    const room = createRoom();
    room.setBotCount(3);
    assert.equal(room.bots.size, 3);
    room.setBotCount(1);
    assert.equal(room.bots.size, 1);
    assert.equal(room.players.size, 1);
    assert.equal(room.humanCount, 0);
});

test('bots go for ammo when they run low and potions when hurt', () => {
    for (const type of ['ammo', 'health_potion']) {
        const room = createRoom(11);
        const bot = room.addBot();
        if (type === 'ammo') {
            for (const ammo of Object.values(bot.inventory.ammo)) ammo.reserve = 0;
        } else {
            bot.health = 40;
        }
        const pickup = room.pickups.spawn(type, room.arena, room.time);
        // Start the bot a short walk away on the floor
        const ix = pickup.ix + (pickup.ix < 30 ? 9 : -9);
        place(room, bot, ix, pickup.iz);
        let takenAt = null;
        for (let t = 0; t < 30 && takenAt === null; t += 1 / 30) {
            room.tick(1 / 30);
            if (!room.pickups.pickups.has(pickup.id)) takenAt = t;
        }
        assert.ok(takenAt !== null, `${type} collected`);
        assert.equal(room.eventsOf('pickupTaken').at(-1).by, bot.id);
    }
});

test('bots with long guns climb sniper towers and shoot from the top', () => {
    const room = createRoom(5);
    room.setBotCount(4);
    let topShots = 0;
    room.emit = ((emit) => (target, type, data) => {
        if (type === 'shot') {
            const shooter = room.players.get(data.id);
            if (shooter && shooter.y >= 8) topShots++;
        }
        emit(target, type, data);
    })(room.emit);
    run(room, 300);
    assert.ok(topShots > 0, 'some shots were fired from a sniper top');
});
