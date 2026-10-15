import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS, validateRoomLimits } from '../shared/constants.js';
import { ROOM_MESSAGES, RoomManager, ROOM_ERRORS } from '../server/RoomManager.js';
import { C2S } from '../shared/protocol.js';

// Minimal stand-ins for socket.io
const fakeIo = { to: () => ({ emit: () => {} }) };
const socket = id => ({ id, join: () => {} });
const manager = (options = {}) => new RoomManager(fakeIo, { autoTick: false, ...options });
const summary = m => m.stats.map(r => `${r.name.split(' · ')[0]}:${r.players}+${r.botCount}`);

test('limits come from shared/config/rooms.json', () => {
    assert.deepEqual(ROOMS, { maxRooms: 5, maxPlayersPerRoom: 4 });
    assert.doesNotThrow(() => validateRoomLimits(ROOMS));
    assert.throws(() => validateRoomLimits({ maxRooms: 0, maxPlayersPerRoom: 4 }));
    assert.throws(() => validateRoomLimits({ maxRooms: 5, maxPlayersPerRoom: 1 }));
});

test('quick play: rooms stay full with bots, which make way for people', () => {
    const m = manager({ maxPlayers: 4 });
    const room1 = m.join(socket('a'), { name: 'A' }).roomId;
    assert.deepEqual(summary(m), ['Quick Play 1:1+3']);
    m.join(socket('b'), { name: 'B' });
    assert.deepEqual(summary(m), ['Quick Play 1:2+2']);
    m.join(socket('c'), { name: 'C' });
    m.join(socket('d'), { name: 'D' });
    const room2 = m.join(socket('e'), { name: 'E' }).roomId;
    assert.notEqual(room2, room1, 'a full room sends the 5th player to a new one');
    assert.deepEqual(summary(m), ['Quick Play 1:4+0', 'Quick Play 2:1+3']);
    m.leave('b', room1);
    assert.deepEqual(summary(m), ['Quick Play 1:3+1', 'Quick Play 2:1+3'], 'a bot takes the free seat');
    m.join(socket('f'), { name: 'F' });
    assert.deepEqual(summary(m), ['Quick Play 1:4+0', 'Quick Play 2:1+3'], 'joins the fullest room with space');
    m.leave('e', room2);
    assert.equal(m.rooms.size, 1, 'empty rooms close');
});

test('custom room without bots: friends only', () => {
    const m = manager();
    const { roomId } = m.create({ roomName: 'Friends', bots: false });
    assert.ok(roomId);
    m.join(socket('a'), { name: 'A', roomId });
    assert.deepEqual(summary(m), ['Friends:1+0'], 'alone, still no bots');
    m.join(socket('b'), { name: 'B', roomId });
    assert.deepEqual(summary(m), ['Friends:2+0']);
});

test('custom room with bots fills to its chosen size', () => {
    const m = manager();
    const { roomId } = m.create({ roomName: 'Duel', bots: true, maxPlayers: 2 });
    m.join(socket('a'), { name: 'A', roomId });
    assert.deepEqual(summary(m), ['Duel:1+1']);
    m.join(socket('b'), { name: 'B', roomId });
    assert.deepEqual(summary(m), ['Duel:2+0'], 'the bot made way');
    assert.deepEqual(m.join(socket('c'), { name: 'C', roomId }), { error: ROOM_ERRORS.FULL });
});

test('passwords: wrong is refused, right joins, the secret never leaks', () => {
    const m = manager();
    const { roomId } = m.create({ roomName: 'Secret', password: 'hunter2', bots: false });
    assert.deepEqual(m.join(socket('a'), { name: 'A', roomId, password: 'nope' }), { error: ROOM_ERRORS.WRONG_PASSWORD });
    assert.deepEqual(m.check({ roomId, password: '' }), { error: ROOM_ERRORS.WRONG_PASSWORD });
    assert.deepEqual(m.join(socket('a'), { name: 'A', roomId, password: 'hunter2' }), { roomId });
    const listed = m.stats[0];
    assert.equal(listed.locked, true);
    assert.ok(!JSON.stringify(m.stats).includes('hunter2'));
    assert.ok(!('passwordHash' in listed) && !('salt' in listed));
});

test('quick play never joins custom rooms', () => {
    const m = manager();
    const { roomId } = m.create({ roomName: 'Private', bots: true });
    m.join(socket('a'), { name: 'A', roomId });
    const quick = m.join(socket('b'), { name: 'B' });
    assert.notEqual(quick.roomId, roomId);
});

test('room options are validated against the limits', () => {
    const m = manager({ maxPlayers: 4 });
    assert.deepEqual(m.create({ roomName: 'Big', maxPlayers: 5 }), { error: ROOM_ERRORS.BAD_SIZE });
    assert.deepEqual(m.create({ roomName: 'Tiny', maxPlayers: 1 }), { error: ROOM_ERRORS.BAD_SIZE });
    assert.deepEqual(m.create({ roomName: '   <>  ' }), { error: ROOM_ERRORS.BAD_NAME });
    assert.ok(m.create({ roomName: 'Arena' }).roomId);
    assert.deepEqual(m.create({ roomName: 'arena' }), { error: ROOM_ERRORS.NAME_TAKEN });
    assert.deepEqual(m.join(socket('x'), { name: 'X', roomId: 'room-999' }), { error: ROOM_ERRORS.NOT_FOUND });
});

test('the server holds at most maxRooms rooms', () => {
    const m = manager({ maxRooms: 5, maxPlayers: 2 });
    for (let i = 0; i < 4; i++) {
        const { roomId } = m.create({ roomName: `Room ${i}`, bots: false });
        m.join(socket(`p${i}`), { name: 'P', roomId });
    }
    // 5th room: a quick one
    m.join(socket('q1'), { name: 'Q' });
    assert.equal(m.rooms.size, 5);
    assert.deepEqual(m.create({ roomName: 'Sixth' }), { error: ROOM_ERRORS.SERVER_FULL });
    m.join(socket('q2'), { name: 'Q' });
    assert.deepEqual(m.join(socket('q3'), { name: 'Q' }), { error: ROOM_ERRORS.SERVER_FULL }, 'quick room full and no space for a new one');
});

test('a created room nobody enters closes after a while', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const m = manager();
    m.create({ roomName: 'Ghost' });
    assert.equal(m.rooms.size, 1);
    t.mock.timers.tick(31_000);
    assert.equal(m.rooms.size, 0);
});

test('the welcome tells the player which room they are in', () => {
    const sent = [];
    const io = { to: target => ({ emit: (type, data) => sent.push({ target, type, data }) }) };
    const m = new RoomManager(io, { autoTick: false });
    const { roomId } = m.create({ roomName: 'Lobby', bots: false, password: 'x' });
    m.join(socket('a'), { name: 'A', roomId, password: 'x' });
    const welcome = sent.find(e => e.type === 'welcome');
    assert.deepEqual(welcome.data.room, { id: roomId, name: 'Lobby', kind: 'custom', bots: false, maxPlayers: 4, mode: 'ffa', map: 'fallfight_classic', locked: true });
});

test('every gameplay message reaches the room: firing, reloading, scoping, buying, reviving', () => {
    for (const type of [C2S.STATE, C2S.SELECT, C2S.USE, C2S.FIRE, C2S.RELOAD, C2S.SCOPE, C2S.BUY, C2S.REVIVE, C2S.PROFILE]) {
        assert.ok(ROOM_MESSAGES.has(type), type);
    }
    assert.ok(!ROOM_MESSAGES.has(C2S.JOIN) && !ROOM_MESSAGES.has(C2S.CREATE_ROOM));
});

test('quick play matches players by game mode', () => {
    const m = manager({ maxPlayers: 4 });
    const dm = m.join(socket('a'), { name: 'A' }).roomId;
    const gg = m.join(socket('b'), { name: 'B', mode: 'gungame' }).roomId;
    assert.notEqual(dm, gg);
    assert.equal(m.join(socket('c'), { name: 'C', mode: 'gungame' }).roomId, gg);
    assert.equal(m.join(socket('d'), { name: 'D', mode: 'nonsense' }).roomId, dm, 'unknown modes fall back to deathmatch');
    const listed = m.stats.find(r => r.id === gg);
    assert.equal(listed.mode, 'gungame');
    assert.ok(listed.map);
    assert.equal(m.rooms.get(gg).room.mode.id, 'gungame');
});

test('custom rooms pick a mode and map; bad ones are refused', () => {
    const m = manager();
    assert.deepEqual(m.create({ roomName: 'X', mode: 'tag' }), { error: ROOM_ERRORS.BAD_MODE });
    assert.deepEqual(m.create({ roomName: 'X', map: 'de_nowhere' }), { error: ROOM_ERRORS.BAD_MAP });
    const { roomId } = m.create({ roomName: 'Arms race', mode: 'gungame', map: 'fallfight_classic' });
    const entry = m.rooms.get(roomId);
    assert.equal(entry.room.mode.id, 'gungame');
    assert.equal(entry.room.map.id, 'fallfight_classic');
    assert.equal(m.stats[0].mode, 'gungame');
});
