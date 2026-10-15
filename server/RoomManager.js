import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NET, ROOMS } from '../shared/constants.js';
import { C2S } from '../shared/protocol.js';
import { sanitizeRoomName } from '../shared/characters/definitions.js';
import { DEFAULT_MODE, getModeInfo } from '../shared/config/modes.js';
import { getMap } from '../shared/world/maps/index.js';
import { GameRoom } from '../shared/game/GameRoom.js';
import { isPlayableMode } from '../shared/game/modes/index.js';

const UNJOINED_ROOM_TTL = 30_000; // a created room nobody entered closes after this (ms)
const MAX_PASSWORD = 32;

export const ROOM_ERRORS = Object.freeze({
    NOT_FOUND: 'not-found',
    FULL: 'full',
    WRONG_PASSWORD: 'wrong-password',
    SERVER_FULL: 'server-full',
    BAD_NAME: 'bad-name',
    NAME_TAKEN: 'name-taken',
    BAD_SIZE: 'bad-size',
    BAD_MODE: 'bad-mode',
    BAD_MAP: 'bad-map'
});

// Messages a client in a room may send to its GameRoom (everything else is ignored)
export const ROOM_MESSAGES = new Set([
    C2S.STATE, C2S.SELECT, C2S.USE, C2S.FIRE, C2S.RELOAD, C2S.SCOPE, C2S.BUY, C2S.PREFS, C2S.PROFILE
]);

const modeOrDefault = mode => (isPlayableMode(mode) ? mode : DEFAULT_MODE);

function hashPassword(password, salt) {
    return createHash('sha256').update(salt).update(password).digest();
}

// Hosts GameRooms on the server.
// - Quick rooms: automatic matchmaking per game mode, always topped up with bots.
// - Custom rooms: created by players with a name, optional password, size, game mode, map and a
//   bots on/off choice.
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

    create({ roomName, password = '', bots = true, maxPlayers = this.maxPlayers, mode = DEFAULT_MODE, map = null } = {}) {
        if (this.rooms.size >= this.maxRooms) return { error: ROOM_ERRORS.SERVER_FULL };
        const name = sanitizeRoomName(roomName);
        if (!name) return { error: ROOM_ERRORS.BAD_NAME };
        if ([...this.rooms.values()].some(e => e.name.toLowerCase() === name.toLowerCase())) return { error: ROOM_ERRORS.NAME_TAKEN };
        const size = Number(maxPlayers);
        if (!Number.isInteger(size) || size < 2 || size > this.maxPlayers) return { error: ROOM_ERRORS.BAD_SIZE };
        if (!isPlayableMode(mode)) return { error: ROOM_ERRORS.BAD_MODE };
        if (map && !getMap(map)) return { error: ROOM_ERRORS.BAD_MAP };

        const secret = String(password || '').slice(0, MAX_PASSWORD);
        const entry = this.createRoom({ name, kind: 'custom', bots: !!bots, maxPlayers: size, mode, map });
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

    // Can this request join? { entry } or { error }. No roomId means quick play in that mode.
    check({ roomId, password = '', mode } = {}) {
        if (!roomId) {
            const entry = this.findQuickRoom(modeOrDefault(mode));
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

    // The fullest quick room of this mode that still has space, so people play together
    findQuickRoom(mode = DEFAULT_MODE) {
        let best = null;
        for (const entry of this.rooms.values()) {
            if (entry.kind !== 'quick' || entry.mode !== mode) continue;
            const humans = entry.room.humanCount;
            if (humans < entry.maxPlayers && (!best || humans > best.room.humanCount)) best = entry;
        }
        return best;
    }

    // ---- membership ---------------------------------------------------------------------

    // Returns { roomId } or { error }
    join(socket, { name, characterId, roomId, password, mode } = {}) {
        const result = this.check({ roomId, password, mode });
        if (result.error) return result;
        const quickMode = modeOrDefault(mode);
        const entry = result.entry || this.createRoom({
            name: `Quick Play ${this.nextRoomId} · ${getModeInfo(quickMode).name}`,
            kind: 'quick', bots: true, maxPlayers: this.maxPlayers, mode: quickMode
        });

        clearTimeout(entry.expireTimer);
        socket.join(entry.id);
        // Make room for the new player before they appear, so the room never goes over size
        if (this.fillsWithBots(entry)) entry.room.setBotCount(Math.max(0, entry.maxPlayers - entry.room.humanCount - 1));
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

    createRoom({ name, kind, bots, maxPlayers, mode = DEFAULT_MODE, map = null }) {
        const id = `room-${this.nextRoomId++}`;
        const room = new GameRoom({
            mode,
            map,
            emit: (target, type, data) => this.io.to(target ?? id).emit(type, data)
        });
        const dt = 1 / NET.tickRate;
        const timer = this.autoTick ? setInterval(() => room.tick(dt), dt * 1000) : null;
        const entry = {
            id, name, kind, bots, maxPlayers, room, timer, mode: room.mode.id, map: room.map.id,
            passwordHash: null, salt: null, createdAt: Date.now()
        };
        this.rooms.set(id, entry);
        this.onChange();
        return entry;
    }

    destroyRoom(entry) {
        clearInterval(entry.timer);
        clearTimeout(entry.expireTimer);
        if (this.rooms.delete(entry.id)) this.onChange();
    }

    // Some modes bring their own opponents (zombies) instead of filling seats with bots
    fillsWithBots(entry) {
        return entry.bots && entry.room.mode.seatBots;
    }

    balanceBots(entry) {
        entry.room.setBotCount(this.fillsWithBots(entry) ? Math.max(0, entry.maxPlayers - entry.room.humanCount) : 0);
    }

    // ---- what clients may see -------------------------------------------------------------

    publicInfo(entry) {
        return {
            id: entry.id,
            name: entry.name,
            kind: entry.kind,
            bots: entry.bots,
            maxPlayers: entry.maxPlayers,
            mode: entry.mode,
            map: entry.map,
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
