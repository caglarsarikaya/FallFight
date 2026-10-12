import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/RoomManager.js';

// Minimal stand-ins for socket.io
const fakeIo = { to: () => ({ emit: () => {} }) };
const socket = id => ({ id, join: () => {} });

const counts = manager => manager.stats.map(r => `${r.players}+${r.bots}`);

test('rooms stay at 4 fighters: bots fill empty seats and make way for people', () => {
    const manager = new RoomManager(fakeIo, { botsFill: 4, maxPlayers: 4, autoTick: false });
    const room1 = manager.join(socket('a'), { name: 'A' });
    assert.deepEqual(counts(manager), ['1+3']);

    manager.join(socket('b'), { name: 'B' });
    assert.deepEqual(counts(manager), ['2+2'], 'a bot left for the second player');

    manager.join(socket('c'), { name: 'C' });
    manager.join(socket('d'), { name: 'D' });
    assert.deepEqual(counts(manager), ['4+0']);

    const room2 = manager.join(socket('e'), { name: 'E' });
    assert.notEqual(room2, room1, 'a full room sends the 5th player to a new one');
    assert.deepEqual(counts(manager), ['4+0', '1+3']);

    manager.leave('b', room1);
    assert.deepEqual(counts(manager), ['3+1', '1+3'], 'a bot takes the free seat');

    manager.join(socket('f'), { name: 'F' });
    assert.deepEqual(counts(manager), ['4+0', '1+3'], 'new players join the fullest room with space');

    manager.leave('e', room2);
    assert.deepEqual(counts(manager), ['4+0'], 'empty rooms are closed');
});

test('a room never goes over 4 while a player joins', () => {
    const sizes = [];
    const manager = new RoomManager(fakeIo, { botsFill: 4, maxPlayers: 4, autoTick: false });
    manager.join(socket('a'), { name: 'A' });
    const room = [...manager.rooms.values()][0].room;
    const addPlayer = room.addPlayer.bind(room);
    room.addPlayer = info => {
        const player = addPlayer(info);
        sizes.push(room.players.size);
        return player;
    };
    manager.join(socket('b'), { name: 'B' });
    assert.ok(sizes.every(n => n <= 4), `sizes ${sizes}`);
});
