import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { C2S, S2C } from '../shared/protocol.js';
import { RoomManager } from './RoomManager.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const BOTS_FILL = Number(process.env.BOTS_FILL ?? 4);
const CORS_ORIGIN = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*';
const PLAY_URL = process.env.PLAY_URL || 'https://caglarsarikaya.github.io/FallFight/';
// The game page is hosted on GitHub Pages; serving it from here is only for local development
const SERVE_CLIENT = process.env.SERVE_CLIENT === '1' || process.argv.includes('--serve-client');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });
const rooms = new RoomManager(io, { botsFill: BOTS_FILL });

app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.stats }));

if (SERVE_CLIENT) {
    app.use('/shared', express.static(path.join(root, 'shared')));
    app.use(express.static(path.join(root, 'client')));
} else {
    app.get('/', (_req, res) => res.json({
        name: 'FallFight game server',
        play: PLAY_URL,
        rooms: rooms.stats
    }));
}

const ROOM_MESSAGES = new Set([C2S.STATE, C2S.SELECT, C2S.DRAW, C2S.USE, C2S.PROFILE]);

// Live player counts, shown on everyone's start menu
const serverStats = () => ({ players: rooms.stats.reduce((n, r) => n + r.players, 0), rooms: rooms.stats });
const broadcastStats = () => io.emit(S2C.SERVER_STATS, serverStats());

io.on('connection', socket => {
    let roomId = null;
    socket.emit(S2C.SERVER_STATS, serverStats());

    socket.on(C2S.JOIN, (data = {}) => {
        if (roomId) return;
        roomId = rooms.join(socket, data);
        console.log(`${socket.id} joined ${roomId}`);
        broadcastStats();
    });

    socket.onAny((type, data) => {
        if (roomId && ROOM_MESSAGES.has(type)) rooms.message(socket.id, roomId, type, data);
    });

    socket.on('disconnect', () => {
        if (!roomId) return;
        rooms.leave(socket.id, roomId);
        broadcastStats();
    });
});

server.listen(PORT, () => {
    console.log(`FallFight server on port ${PORT} (rooms of ${BOTS_FILL}, topped up with bots)`);
    if (SERVE_CLIENT) console.log(`Game page: http://localhost:${PORT}/`);
});
