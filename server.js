const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const Redis = require('redis');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
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

// Room Management Functions
async function findAvailableRoom() {
    const rooms = await redisClient.hGetAll('rooms');
    
    for (const [roomId, roomData] of Object.entries(rooms)) {
        const room = JSON.parse(roomData);
        if (room.players.length < 6 && room.status === 'waiting') {
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
    
    await redisClient.hSet('rooms', newRoomId, JSON.stringify(newRoom));
    return newRoomId;
}

async function joinRoom(roomId, player) {
    const roomData = await redisClient.hGet('rooms', roomId);
    if (!roomData) return null;
    
    const room = JSON.parse(roomData);
    room.players.push(player);
    
    // Check if room is full
    if (room.players.length === 6) {
        room.status = 'starting';
        room.started_at = Date.now();
    }
    
    await redisClient.hSet('rooms', roomId, JSON.stringify(room));
    return room;
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
io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.id}`);
    let currentRoom = null;

    // Handle player join
    socket.on('joinGame', async (username) => {
        try {
            const roomId = await findAvailableRoom();
            const player = {
                id: socket.id,
                username: username,
                joined_at: Date.now()
            };
            
            const room = await joinRoom(roomId, player);
            if (room) {
                currentRoom = roomId;
                socket.join(roomId);
                
                // Notify all players in the room
                io.to(roomId).emit('roomUpdate', {
                    roomId: roomId,
                    players: room.players,
                    status: room.status,
                    playersNeeded: 6 - room.players.length
                });
                
                // If room is full, start the game
                if (room.status === 'starting') {
                    setTimeout(() => {
                        io.to(roomId).emit('gameStart', {
                            players: room.players,
                            startTime: room.started_at
                        });
                    }, 3000); // Give players 3 seconds to prepare
                }
                
                logger.info(`Player ${username} joined room ${roomId}`);
            }
        } catch (error) {
            logger.error('Error in joinGame:', error);
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
                        io.to(currentRoom).emit('roomUpdate', {
                            roomId: currentRoom,
                            players: room.players,
                            status: room.status,
                            playersNeeded: 6 - room.players.length
                        });
                    }
                }
            } catch (error) {
                logger.error('Error handling disconnect:', error);
            }
        }
        logger.info(`User disconnected: ${socket.id}`);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
}); 