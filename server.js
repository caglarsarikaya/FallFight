const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const Redis = require('redis');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
require('dotenv').config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Environment variables
const DEV_MODE = process.env.DEV_MODE === 'true';
const REQUIRED_PLAYERS = DEV_MODE ? 1 : (process.env.REQUIRED_PLAYERS || 6);

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Redis client setup
const redisClient = Redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));

// Connect to Redis
(async () => {
    await redisClient.connect();
})();

// Bot players for development
const createBotPlayers = () => {
    return Array.from({ length: 3 }, (_, i) => ({
        id: `bot_${i}`,
        username: `Bot ${i + 1}`,
        isBot: true,
        position: new Array(3).fill(0).map(() => Math.random() * 10 - 5),
        rotation: { y: Math.random() * Math.PI * 2 }
    }));
};

// Room Management Functions
async function findAvailableRoom() {
    const rooms = await redisClient.hGetAll('rooms');
    
    for (const [roomId, roomData] of Object.entries(rooms)) {
        const room = JSON.parse(roomData);
        if (room.players.length < REQUIRED_PLAYERS && room.status === 'waiting') {
            return roomId;
        }
    }
    
    // Create new room if no available room found
    const newRoomId = `room_${Date.now()}`;
    const newRoom = {
        players: [],
        status: 'waiting',
        created_at: Date.now(),
        started_at: null
    };
    
    // In dev mode, add bot players immediately
    if (DEV_MODE) {
        newRoom.players.push(...createBotPlayers());
    }
    
    await redisClient.hSet('rooms', newRoomId, JSON.stringify(newRoom));
    return newRoomId;
}

async function joinRoom(roomId, player) {
    const roomData = await redisClient.hGet('rooms', roomId);
    if (!roomData) return null;
    
    const room = JSON.parse(roomData);
    room.players.push(player);
    
    // Check if room should start
    const shouldStart = DEV_MODE || room.players.length === REQUIRED_PLAYERS;
    if (shouldStart) {
        room.status = 'starting';
        room.started_at = Date.now();
    }
    
    await redisClient.hSet('rooms', roomId, JSON.stringify(room));
    return room;
}

// Bot movement simulation
function updateBotPositions(room) {
    if (!DEV_MODE) return;

    room.players.forEach(player => {
        if (player.isBot) {
            // Random movement
            player.position[0] += (Math.random() - 0.5) * 0.2;
            player.position[2] += (Math.random() - 0.5) * 0.2;
            player.rotation.y += (Math.random() - 0.5) * 0.1;

            // Broadcast bot movement
            io.to(room.id).emit('playerMoved', {
                playerId: player.id,
                position: { x: player.position[0], y: player.position[1], z: player.position[2] },
                rotation: { y: player.rotation.y }
            });
        }
    });
}

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(limiter);

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', async (socket) => {
    console.log('New player connected:', socket.id);
    let currentRoom = null;

    socket.on('joinGame', async (nickname) => {
        try {
            console.log(`Player ${nickname} attempting to join game`);
            const player = {
                id: socket.id,
                nickname: nickname,
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 }
            };

            // Get or create a room for the player
            const roomId = await findAvailableRoom();
            currentRoom = roomId;
            console.log(`Found room ${roomId} for player ${nickname}`);
            
            // Add player to the room
            const room = await joinRoom(roomId, player);
            socket.join(roomId);
            
            // Send room update to all players in the room
            console.log('Sending room update:', room);
            io.to(roomId).emit('roomUpdate', room);

            // In development mode, add bot players and start immediately
            if (DEV_MODE) {
                console.log('Development mode: Adding bot players');
                const botPlayers = [];
                // Add 3 bot players
                for (let i = 1; i <= 3; i++) {
                    const botPlayer = {
                        id: `bot-${i}`,
                        nickname: `Bot ${i}`,
                        position: { x: 0, y: 0, z: 0 },
                        rotation: { x: 0, y: 0, z: 0 },
                        isBot: true
                    };
                    botPlayers.push(botPlayer);
                }

                // Add bots to room
                room.players.push(...botPlayers);
                await redisClient.hSet('rooms', roomId, JSON.stringify(room));

                // Send final update and start game
                console.log('Development mode: Starting game with room data:', room);
                io.to(roomId).emit('roomUpdate', room);
                io.to(roomId).emit('gameStart', room);
            }
        } catch (error) {
            console.error('Error joining game:', error);
            socket.emit('error', { message: 'Failed to join game' });
        }
    });

    // Handle player movement
    socket.on('playerMove', (data) => {
        if (currentRoom) {
            socket.to(currentRoom).emit('playerMoved', {
                playerId: socket.id,
                ...data
            });
        }
    });

    // Handle block breaking
    socket.on('breakBlock', (data) => {
        if (currentRoom) {
            io.to(currentRoom).emit('blockBroken', {
                playerId: socket.id,
                ...data
            });
        }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
        if (currentRoom) {
            try {
                const roomData = await redisClient.hGet('rooms', currentRoom);
                if (roomData) {
                    const room = JSON.parse(roomData);
                    room.players = room.players.filter(p => p.id !== socket.id);
                    
                    if (room.players.length === 0) {
                        // Delete empty room
                        await redisClient.hDel('rooms', currentRoom);
                    } else {
                        // Update room
                        await redisClient.hSet('rooms', currentRoom, JSON.stringify(room));
                        io.to(currentRoom).emit('roomUpdate', room);
                    }
                }
            } catch (error) {
                logger.error('Error handling disconnect:', error);
            }
        }
        logger.info(`User disconnected: ${socket.id}`);
    });

    // Handle player elimination
    socket.on('playerEliminated', async () => {
        if (currentRoom) {
            try {
                const roomData = await redisClient.hGet('rooms', currentRoom);
                if (roomData) {
                    const room = JSON.parse(roomData);
                    room.players = room.players.filter(p => p.id !== socket.id);
                    await redisClient.hSet('rooms', currentRoom, JSON.stringify(room));
                    io.to(currentRoom).emit('roomUpdate', room);
                }
            } catch (error) {
                logger.error('Error handling player elimination:', error);
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    logger.info(`Dev mode: ${DEV_MODE ? 'enabled' : 'disabled'}`);
}); 