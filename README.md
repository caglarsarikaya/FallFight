# **FallFight Browser Game - Technical and Game Documentation**

## **1. Game Description**

FallFight is a multiplayer browser-based game where players try to eliminate their opponents by breaking the ground beneath them. The goal is to be the last player standing. The graphics should be visually appealing but optimized enough to run smoothly on all computers.

## **2. Gameplay Mechanics**

### **2.1 General Game Flow**
When the game starts, a preview video of the gameplay is displayed in the background with low opacity. A centralized window appears, prompting the player to enter their nickname and press the play button to start.

1. Players enter their username to join the game. Upon pressing the start button, the system assigns them to a room list.
2. The system automatically assigns players to 6-player rooms. When the room list reaches 6 players, the game starts for those players.
3. There are 6 different character designs, each randomly assigned to a player. Each character holds an axe in their right hand. 
4. Players use a crosshair to aim at blocks they want to break. When a player clicks the left mouse button, their character swings the axe towards the crosshair point, breaking the targeted block.
5. Players move with WASD, jump with Space, look around with the mouse, and break blocks below them using the left mouse button.
6. Blocks are broken with a pickaxe effect, and after 250ms, the player on the broken block starts falling. If the player reacts quickly and jumps to another block, they can avoid falling.
7. If a player touches a certain depth (e.g., 2 meters below the ground) or another player breaks the block under them, they will start falling and be eliminated.
8. The last remaining player wins, and the room resets.
9. If a room remains empty for too long (e.g., 10 minutes), it is automatically deleted from Redis.

### **2.2 Controls**
- **WASD / Arrow Keys**: Move
- **Space**: Jump
- **Left Mouse Click**: Swing axe to break the block at the crosshair point
- **Mouse**: Look around
- **ESC**: Opens the menu (includes exit game and sound settings)

### **2.3 Game Modes**
- **Classic Spleef**: Players only break blocks to make opponents fall.

---

## **3. Technical Infrastructure**

### **3.1 Technologies Used**
- **Frontend:** HTML, CSS, JavaScript (Canvas or Three.js)
- **Backend:** Node.js, Express
- **Real-time Communication:** WebSockets (Socket.io)
- **Room Management:** Redis (Stores game rooms and player states)
- **Server Management:** Docker & Docker Compose

### **3.2 Architecture**
The system will be built using a **microservices approach**, consisting of the following components:

#### **A) Game Server (Node.js & Socket.io)**
- Manages game connections.
- Processes player movements and block-breaking actions.
- Uses Redis for game state management.

#### **B) Redis (Room Management)**
- Stores and manages game rooms.
- If a room is empty, it gets automatically deleted after 10 minutes.

#### **C) Docker & Kubernetes (Server Management)**
- **Docker Compose** will be used to run Redis and Node.js together.
- If the game scales up, **Kubernetes auto-scaling** can be implemented.

---

### **3.3 Game Logic Details**
- **Map Size:** The game map consists of a 30x30 block area. Players start at positions equally distant from each other.
- **Gravity Mechanics:** Players fall at a realistic speed after breaking a block beneath them.
- **Block Breaking Delay:** When a player breaks a block, a breaking effect appears. After 250ms, the block disappears, and the player starts falling if they haven't jumped away in time.
- **Falling Mechanics:** If a player crosses a certain depth threshold (2 meters below ground), they are eliminated.
- **Map Reset:** Each round starts with the same map structure.

### **3.4 Redis Structure**
Rooms will be stored in Redis with the following format:

```json
{
  "rooms": {
    "room_123": {
      "players": ["player1", "player2", "player3"],
      "status": "playing",
      "scores": { "player1": 10, "player2": 5 },
      "created_at": "1710153600",
      "started_at": "1710153620"
    }
  }
}
```

- **rooms**: Stores all active rooms.
- **players**: Tracks players in each room.
- **status**: "waiting", "playing", "finished" etc.
- **scores**: Tracks player scores.
- **created_at**: Timestamp of when the room was created.
- **started_at**: Timestamp of when the game started.

---

### **3.5 Docker Setup**
```yaml
version: '3'
services:
  redis-server:
    image: "redis"
    container_name: redis-server
    ports:
      - "6379:6379"
  
  game-server:
    build: .
    container_name: game-server
    ports:
      - "3000:3000"
    depends_on:
      - redis-server
```

---

### **3.6 Performance Optimizations**
✅ **Room management will be handled in Redis to prevent unnecessary memory usage.**  
✅ **Each pod will host 20-50 rooms, and if the load increases, new pods will be spawned.**  
✅ **To reduce unnecessary data transfer, movement calculations will be handled client-side.**  
✅ **Graphics should be engaging yet optimized to ensure smooth gameplay on all devices.**  

---

### **3.7 Security Considerations**
1. **Rate Limiting:** Prevent spam requests using `express-rate-limit`.
2. **Error Handling & Logging:** Use a logging system like Winston for error tracking.
3. **DDoS Protection:** Implement Cloudflare or similar protection to mitigate attacks.
4. **Movement Validation:** The server should verify player movement to prevent hacking.
5. **Block Breaking Validation:** Ensure blocks can only be broken if the player is directly above them.
6. **Anti-Speed Hacks:** Enforce minimum and maximum movement speeds.

---

## **4. Development Guide**

### **4.1 Prerequisites**
- Node.js (v18 or higher)
- Docker (for Redis)
- npm or yarn

### **4.2 Initial Setup**
1. Clone the repository
```bash
git clone <repository-url>
cd FallFight
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
NODE_ENV=development
PORT=3000
REDIS_URL=redis://localhost:6379
DEV_MODE=true
REQUIRED_PLAYERS=6
```

### **4.3 Running the Application**

#### Development Mode
In development mode, the game:
- Starts with just one player (no need to wait for others)
- Includes 3 bot players for testing
- Automatically starts when you join
- Has bot players that move randomly

1. **Start Redis Only (Required for the game)**
```bash
npm run dev:redis
```

2. **Start the Development Server**
```bash
npm run dev
```

3. **Or Start Both with One Command**
```bash
npm run dev:all
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

#### Production Mode
1. Set `DEV_MODE=false` in `.env`
2. Start the application:
```bash
npm start
```

### **4.4 Stopping the Application**

1. **Stop the Node.js Server**
- Press `Ctrl + C` in the terminal where the server is running

2. **Stop Redis Container**
```bash
npm run dev:redis:stop
```

### **4.5 Development vs Production Mode**

| Feature | Development | Production |
|---------|------------|------------|
| Players Required | 1 | 6 |
| Bot Players | Yes (3) | No |
| Auto-Start | Yes | No |
| Hot Reload | Yes | No |
| Redis | Local Docker | External (Configure in .env) |

### **4.6 Troubleshooting**

1. **Redis Connection Issues**
- Ensure Docker is running
- Check if Redis container is up:
```bash
docker ps | grep redis-server
```
- Restart Redis:
```bash
npm run dev:redis:stop && npm run dev:redis
```

2. **Game Not Starting**
- In dev mode: Check if `DEV_MODE=true` in `.env`
- In production: Need 6 players to start

3. **Port Already in Use**
- Change PORT in `.env`
- Or kill the process using:
```bash
npx kill-port 3000
```

This document outlines the core requirements and technical infrastructure for FallFight. The next step is to start prototyping! 🚀

