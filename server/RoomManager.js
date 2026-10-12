import { NET } from '../shared/constants.js';
import { GameRoom } from '../shared/game/GameRoom.js';

// Hosts GameRooms on the server: matchmaking, ticking, and keeping every room at a fixed size by
// filling empty seats with bots (a bot leaves when a person joins, and comes back when they leave).
export class RoomManager {
    constructor(io, { botsFill = NET.maxPlayersPerRoom, maxPlayers = NET.maxPlayersPerRoom, autoTick = true } = {}) {
        this.io = io;
        this.botsFill = botsFill;        // fighters per room, bots included
        this.maxPlayers = maxPlayers;    // people per room
        this.autoTick = autoTick;
        this.rooms = new Map();          // roomId -> { id, room, timer }
        this.nextRoomId = 1;
    }

    join(socket, { name, characterId }) {
        const entry = this.findRoom() || this.createRoom();
        socket.join(entry.id);
        // Make room for the new player before they appear, so the room never goes over size
        entry.room.setBotCount(Math.max(0, this.botsFill - entry.room.humanCount - 1));
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

    // The fullest room that still has space, so people play together
    findRoom() {
        let best = null;
        for (const entry of this.rooms.values()) {
            const humans = entry.room.humanCount;
            if (humans < this.maxPlayers && (!best || humans > best.room.humanCount)) best = entry;
        }
        return best;
    }

    createRoom() {
        const id = `room-${this.nextRoomId++}`;
        const room = new GameRoom({
            emit: (target, type, data) => this.io.to(target ?? id).emit(type, data)
        });
        const dt = 1 / NET.tickRate;
        const timer = this.autoTick ? setInterval(() => room.tick(dt), dt * 1000) : null;
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
        return [...this.rooms.values()].map(e => ({ id: e.id, players: e.room.humanCount, bots: e.room.bots.size }));
    }
}
