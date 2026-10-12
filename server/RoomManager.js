import { NET } from '../shared/constants.js';
import { GameRoom } from '../shared/game/GameRoom.js';

// Hosts GameRooms on the server: matchmaking, ticking, and bot top-up so rooms never feel empty.
export class RoomManager {
    constructor(io, { botsFill = 4, maxPlayers = NET.maxPlayersPerRoom } = {}) {
        this.io = io;
        this.botsFill = botsFill;        // bots keep each room at least this many players
        this.maxPlayers = maxPlayers;
        this.rooms = new Map();          // roomId -> { room, timer }
        this.nextRoomId = 1;
    }

    join(socket, { name, characterId }) {
        const entry = this.findRoom() || this.createRoom();
        socket.join(entry.id);
        entry.room.addPlayer({ id: socket.id, name, characterId });
        this.balanceBots(entry);
        return entry.id;
    }

    leave(socketId, roomId) {
        const entry = this.rooms.get(roomId);
        if (!entry) return;
        entry.room.removePlayer(socketId);
        if (entry.room.humanCount === 0) this.destroyRoom(entry);
        else this.balanceBots(entry);
    }

    message(socketId, roomId, type, data) {
        this.rooms.get(roomId)?.room.handleMessage(socketId, type, data);
    }

    findRoom() {
        return [...this.rooms.values()].find(e => e.room.humanCount < this.maxPlayers) || null;
    }

    createRoom() {
        const id = `room-${this.nextRoomId++}`;
        const room = new GameRoom({
            emit: (target, type, data) => this.io.to(target ?? id).emit(type, data)
        });
        const dt = 1 / NET.tickRate;
        const timer = setInterval(() => room.tick(dt), dt * 1000);
        const entry = { id, room, timer };
        this.rooms.set(id, entry);
        return entry;
    }

    destroyRoom(entry) {
        clearInterval(entry.timer);
        this.rooms.delete(entry.id);
    }

    balanceBots(entry) {
        entry.room.setBotCount(Math.max(0, this.botsFill - entry.room.humanCount));
    }

    get stats() {
        return [...this.rooms.values()].map(e => ({ id: e.id, humans: e.room.humanCount, bots: e.room.bots.size }));
    }
}
