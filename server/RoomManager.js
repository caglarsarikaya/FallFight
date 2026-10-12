import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NET, ROOMS } from '../shared/constants.js';
import { sanitizeRoomName } from '../shared/characters/definitions.js';
import { GameRoom } from '../shared/game/GameRoom.js';

const UNJOINED_ROOM_TTL = 30_000; // a created room nobody entered closes after this (ms)
const MAX_PASSWORD = 32;

export const ROOM_ERRORS = Object.freeze({
    NOT_FOUND: 'not-found',
    FULL: 'full',
    WRONG_PASSWORD: 'wrong-password',
    SERVER_FULL: 'server-full',
    BAD_NAME: 'bad-name',
    NAME_TAKEN: 'name-taken',
    BAD_SIZE: 'bad-size'
});

function hashPassword(password, salt) {
    return createHash('sha256').update(salt).update(password).digest();
}

// Hosts GameRooms on the server.
// - Quick rooms: automatic matchmaking, always topped up with bots.
// - Custom rooms: created by players with a name, optional password, size and a bots on/off choice.
// Limits (open rooms, players per room) come from shared/config/rooms.json via ROOMS.
export class RoomManager {
    constructor(io, { maxRooms = ROOMS.maxRooms, maxPlayers = ROOMS.maxPlayersPerRoom, autoTick = true, onChange = () => {} } = {}) {
        this.io = io;
        this.maxRooms = maxRooms;
        this.maxPlayers = maxPlayers;
        this.autoTick = autoTick;
        this.onChange = onChange;        // called whenever the room list changes
        this.rooms = new Map();          // roomId -> entry
        this.nextRoomId = 1;
    }

    // ---- creating and finding rooms ------------------------------------------------------

    create({ roomName, password = '', bots = true, maxPlayers = this.maxPlayers } = {}) {
        if (this.rooms.size >= this.maxRooms) return { error: ROOM_ERRORS.SERVER_FULL };
        const name = sanitizeRoomName(roomName);
        if (!name) return { error: ROOM_ERRORS.BAD_NAME };
        if ([...this.rooms.values()].some(e => e.name.toLowerCase() === name.toLowerCase())) return { error: ROOM_ERRORS.NAME_TAKEN };
        const size = Number(maxPlayers);
        if (!Number.isInteger(size) || size < 2 || size > this.maxPlayers) return { error: ROOM_ERRORS.BAD_SIZE };

        const secret = String(password || '').slice(0, MAX_PASSWORD);
        const entry = this.createRoom({ name, kind: 'custom', bots: !!bots, maxPlayers: size });
        if (secret) {
            entry.salt = randomBytes(16);
            entry.passwordHash = hashPassword(secret, entry.salt);
        }
        // Close it if the creator never arrives
        entry.expireTimer = setTimeout(() => {
            if (entry.room.humanCount === 0) this.destroyRoom(entry);
        }, UNJOINED_ROOM_TTL);
        entry.expireTimer.unref?.();
        return { roomId: entry.id };
    }

    // Can this request join? { entry } or { error }. No roomId means quick play.
    check({ roomId, password = '' } = {}) {
        if (!roomId) {
            const entry = this.findQuickRoom();
            if (entry) return { entry };
            if (this.rooms.size >= this.maxRooms) return { error: ROOM_ERRORS.SERVER_FULL };
            return { entry: null };
        }
        const entry = this.rooms.get(roomId);
        if (!entry) return { error: ROOM_ERRORS.NOT_FOUND };
        if (entry.room.humanCount >= entry.maxPlayers) return { error: ROOM_ERRORS.FULL };
        if (entry.passwordHash && !this.passwordMatches(entry, password)) return { error: ROOM_ERRORS.WRONG_PASSWORD };
        return { entry };
    }

    passwordMatches(entry, password) {
        const given = hashPassword(String(password || '').slice(0, MAX_PASSWORD), entry.salt);
        return timingSafeEqual(given, entry.passwordHash);
    }

    // The fullest quick room that still has space, so people play together
    findQuickRoom() {
        let best = null;
        for (const entry of this.rooms.values()) {
            if (entry.kind !== 'quick') continue;
            const humans = entry.room.humanCount;
            if (humans < entry.maxPlayers && (!best || humans > best.room.humanCount)) best = entry;
        }
        return best;
    }

    // ---- membership ---------------------------------------------------------------------

    // Returns { roomId } or { error }
    join(socket, { name, characterId, roomId, password } = {}) {
        const result = this.check({ roomId, password });
        if (result.error) return result;
        const entry = result.entry || this.createRoom({ name: `Quick Play ${this.nextRoomId}`, kind: 'quick', bots: true, maxPlayers: this.maxPlayers });

        clearTimeout(entry.expireTimer);
        socket.join(entry.id);
        // Make room for the new player before they appear, so the room never goes over size
        if (entry.bots) entry.room.setBotCount(Math.max(0, entry.maxPlayers - entry.room.humanCount - 1));
        entry.room.addPlayer({ id: socket.id, name, characterId, roomInfo: this.publicInfo(entry) });
        this.balanceBots(entry);
        this.onChange();
        return { roomId: entry.id };
    }

    leave(socketId, roomId) {
        const entry = this.rooms.get(roomId);
        if (!entry) return;
        entry.room.removePlayer(socketId);
        if (entry.room.humanCount === 0) this.destroyRoom(entry);
        else this.balanceBots(entry);
        this.onChange();
    }

    message(socketId, roomId, type, data) {
        this.rooms.get(roomId)?.room.handleMessage(socketId, type, data);
    }

    // ---- lifecycle ----------------------------------------------------------------------

    createRoom({ name, kind, bots, maxPlayers }) {
        const id = `room-${this.nextRoomId++}`;
        const room = new GameRoom({
            emit: (target, type, data) => this.io.to(target ?? id).emit(type, data)
        });
        const dt = 1 / NET.tickRate;
        const timer = this.autoTick ? setInterval(() => room.tick(dt), dt * 1000) : null;
        const entry = { id, name, kind, bots, maxPlayers, room, timer, passwordHash: null, salt: null, createdAt: Date.now() };
        this.rooms.set(id, entry);
        this.onChange();
        return entry;
    }

    destroyRoom(entry) {
        clearInterval(entry.timer);
        clearTimeout(entry.expireTimer);
        if (this.rooms.delete(entry.id)) this.onChange();
    }

    balanceBots(entry) {
        entry.room.setBotCount(entry.bots ? Math.max(0, entry.maxPlayers - entry.room.humanCount) : 0);
    }

    // ---- what clients may see -------------------------------------------------------------

    publicInfo(entry) {
        return {
            id: entry.id,
            name: entry.name,
            kind: entry.kind,
            bots: entry.bots,
            maxPlayers: entry.maxPlayers,
            locked: !!entry.passwordHash
        };
    }

    get stats() {
        return [...this.rooms.values()].map(entry => ({
            ...this.publicInfo(entry),
            players: entry.room.humanCount,
            botCount: entry.room.bots.size
        }));
    }
}
