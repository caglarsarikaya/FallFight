const redisClient = require('./redis');
const { v4: uuidv4 } = require('uuid');

const REQUIRED_PLAYERS = process.env.DEV_MODE === 'true' ? 1 : 6;

async function findAvailableRoom() {
    try {
        // Get all rooms
        const rooms = await redisClient.hGetAll('rooms');
        
        // Check existing rooms
        for (const [roomId, roomData] of Object.entries(rooms)) {
            const room = JSON.parse(roomData);
            if (room.status === 'waiting' && room.players.length < REQUIRED_PLAYERS) {
                return roomId;
            }
        }

        // Create new room if no available room found
        const newRoomId = uuidv4();
        const newRoom = {
            id: newRoomId,
            players: [],
            status: 'waiting',
            created_at: Date.now(),
            started_at: null
        };

        await redisClient.hSet('rooms', newRoomId, JSON.stringify(newRoom));
        return newRoomId;
    } catch (error) {
        console.error('Error finding available room:', error);
        throw error;
    }
}

async function joinRoom(roomId, player) {
    try {
        const roomData = await redisClient.hGet('rooms', roomId);
        if (!roomData) {
            throw new Error('Room not found');
        }

        const room = JSON.parse(roomData);
        
        // Add player to room
        room.players.push(player);

        // Check if room should start
        if (room.players.length >= REQUIRED_PLAYERS) {
            room.status = 'starting';
            room.started_at = Date.now();
        }

        // Update room in Redis
        await redisClient.hSet('rooms', roomId, JSON.stringify(room));
        return room;
    } catch (error) {
        console.error('Error joining room:', error);
        throw error;
    }
}

async function leaveRoom(roomId, playerId) {
    try {
        const roomData = await redisClient.hGet('rooms', roomId);
        if (!roomData) {
            return;
        }

        const room = JSON.parse(roomData);
        room.players = room.players.filter(p => p.id !== playerId);

        if (room.players.length === 0) {
            // Delete empty room
            await redisClient.hDel('rooms', roomId);
        } else {
            // Update room
            await redisClient.hSet('rooms', roomId, JSON.stringify(room));
        }
    } catch (error) {
        console.error('Error leaving room:', error);
        throw error;
    }
}

module.exports = {
    findAvailableRoom,
    joinRoom,
    leaveRoom
}; 