import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { C2S } from '../shared/protocol.js';
import { RoomManager } from './RoomManager.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const BOTS_FILL = Number(process.env.BOTS_FILL ?? 4);
const CORS_ORIGIN = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*';

const app = express();
// Serve the client too, so `npm start` is a complete local setup (same layout as the Pages build)
app.use('/shared', express.static(path.join(root, 'shared')));
app.use(express.static(path.join(root, 'client')));
app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.stats }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });
const rooms = new RoomManager(io, { botsFill: BOTS_FILL });

const ROOM_MESSAGES = new Set([C2S.STATE, C2S.SELECT, C2S.DRAW, C2S.USE, C2S.PROFILE]);

io.on('connection', socket => {
    let roomId = null;

    socket.on(C2S.JOIN, (data = {}) => {
        if (roomId) return;
        roomId = rooms.join(socket, data);
        console.log(`${socket.id} joined ${roomId}`);
    });

    socket.onAny((type, data) => {
        if (roomId && ROOM_MESSAGES.has(type)) rooms.message(socket.id, roomId, type, data);
    });

    socket.on('disconnect', () => {
        if (roomId) rooms.leave(socket.id, roomId);
    });
});

server.listen(PORT, () => {
    console.log(`FallFight server on http://localhost:${PORT} (bots fill rooms to ${BOTS_FILL})`);
});
