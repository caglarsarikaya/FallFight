import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { ROOMS, validateRoomLimits } from '../shared/constants.js';
import { C2S, S2C } from '../shared/protocol.js';
import { RoomManager } from './RoomManager.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*';
const PLAY_URL = process.env.PLAY_URL || 'https://caglarsarikaya.github.io/FallFight/';
// The game page is hosted on GitHub Pages; serving it from here is only for local development
const SERVE_CLIENT = process.env.SERVE_CLIENT === '1' || process.argv.includes('--serve-client');

validateRoomLimits(ROOMS); // refuse to start with a broken shared/config/rooms.json

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });

// Live room list and player counts, shown on everyone's start menu
const serverStats = () => {
    const rooms = roomManager.stats;
    return { players: rooms.reduce((n, r) => n + r.players, 0), limits: ROOMS, rooms };
};
let statsQueued = false;
const broadcastStats = () => {
    if (statsQueued) return;
    statsQueued = true;
    queueMicrotask(() => {
        statsQueued = false;
        io.emit(S2C.SERVER_STATS, serverStats());
    });
};
const roomManager = new RoomManager(io, { onChange: broadcastStats });

app.get('/healthz', (_req, res) => res.json({ ok: true, ...serverStats() }));

if (SERVE_CLIENT) {
    app.use('/shared', express.static(path.join(root, 'shared')));
    app.use(express.static(path.join(root, 'client')));
} else {
    app.get('/', (_req, res) => res.json({ name: 'FallFight game server', play: PLAY_URL, ...serverStats() }));
}

const ROOM_MESSAGES = new Set([C2S.STATE, C2S.SELECT, C2S.DRAW, C2S.USE, C2S.PROFILE]);
const reply = ack => (typeof ack === 'function' ? ack : () => {});

io.on('connection', socket => {
    let roomId = null;
    socket.emit(S2C.SERVER_STATS, serverStats());

    // Validate a room + password before the client builds the game
    socket.on(C2S.CHECK_ROOM, (data = {}, ack) => {
        const result = roomManager.check({ roomId: data.roomId, password: data.password });
        reply(ack)(result.error ? { error: result.error } : { ok: true });
    });

    socket.on(C2S.CREATE_ROOM, (data = {}, ack) => {
        reply(ack)(roomManager.create({
            roomName: data.roomName,
            password: data.password,
            bots: data.bots !== false,
            maxPlayers: data.maxPlayers
        }));
    });

    socket.on(C2S.JOIN, (data = {}) => {
        if (roomId) return;
        const result = roomManager.join(socket, data);
        if (result.error) {
            socket.emit(S2C.JOIN_ERROR, { error: result.error });
            return;
        }
        roomId = result.roomId;
        console.log(`${socket.id} joined ${roomId}`);
    });

    socket.onAny((type, data) => {
        if (roomId && ROOM_MESSAGES.has(type)) roomManager.message(socket.id, roomId, type, data);
    });

    socket.on('disconnect', () => {
        if (roomId) roomManager.leave(socket.id, roomId);
    });
});

server.listen(PORT, () => {
    console.log(`FallFight server on port ${PORT} (up to ${ROOMS.maxRooms} rooms of ${ROOMS.maxPlayersPerRoom})`);
    if (SERVE_CLIENT) console.log(`Game page: http://localhost:${PORT}/`);
});
