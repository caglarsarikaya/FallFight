// In-browser stand-in for the Socket.io server, used for offline play vs bots.
// Implements the same on/emit/id surface that game.js uses.
class LocalSocket {
    constructor() {
        this.id = 'local-player';
        this.handlers = {};
        this.bots = [];
        this.brokenBlocks = new Set();
        this.playerPosition = null;
        this.timers = [];
    }

    on(event, handler) {
        (this.handlers[event] = this.handlers[event] || []).push(handler);
    }

    // Deliver an event to game.js listeners asynchronously, like a real socket
    dispatch(event, data) {
        setTimeout(() => (this.handlers[event] || []).forEach(h => h(data)), 0);
    }

    emit(event, data) {
        switch (event) {
            case 'joinGame':
                this.startRoom(data);
                break;
            case 'breakBlock':
                this.breakBlock(this.id, data);
                break;
            case 'playerMove':
                this.playerPosition = { x: data.position.x, z: data.position.z };
                break;
            case 'playerForceFall': {
                const bot = this.bots.find(b => b.id === data.playerId);
                if (bot) bot.falling = true;
                break;
            }
            case 'playerEliminated':
                this.timers.forEach(clearInterval);
                break;
        }
    }

    startRoom(nickname) {
        const players = [{ id: this.id, nickname, username: nickname }];
        for (let i = 1; i <= 3; i++) {
            players.push({ id: `bot-${i}`, nickname: `Bot ${i}`, username: `Bot ${i}`, isBot: true });
        }

        // Same spawn layout as FallFight.positionPlayers
        players.forEach((player, index) => {
            if (!player.isBot) return;
            const angle = (index / players.length) * Math.PI * 2;
            this.bots.push({
                id: player.id,
                x: Math.cos(angle) * 10,
                y: 2,
                z: Math.sin(angle) * 10,
                vy: 0,
                heading: angle + Math.PI,
                falling: false,
                dead: false
            });
        });

        const room = { id: 'local', players, status: 'starting' };
        this.dispatch('roomUpdate', room);
        this.dispatch('gameStart', room);

        this.timers.push(setInterval(() => this.updateBots(), 50));
        this.timers.push(setInterval(() => this.botAttack(), 1500));
    }

    breakBlock(playerId, data) {
        this.dispatch('blockBroken', { playerId, ...data });
        // game.js removes the block after 250ms
        setTimeout(() => this.brokenBlocks.add(`${Math.round(data.x)},${Math.round(data.z)}`), 250);
    }

    isSolid(x, z) {
        const bx = Math.round(x), bz = Math.round(z);
        return bx >= -15 && bx < 15 && bz >= -15 && bz < 15 && !this.brokenBlocks.has(`${bx},${bz}`);
    }

    updateBots() {
        this.bots.forEach(bot => {
            if (bot.dead) return;

            if (!bot.falling) {
                // Wander, turning away from holes and edges
                bot.heading += (Math.random() - 0.5) * 0.3;
                const nx = bot.x - Math.sin(bot.heading) * 0.06;
                const nz = bot.z - Math.cos(bot.heading) * 0.06;
                if (this.isSolid(nx, nz)) {
                    bot.x = nx;
                    bot.z = nz;
                } else {
                    bot.heading += Math.PI / 2;
                }
                if (!this.isSolid(bot.x, bot.z)) bot.falling = true;
            }

            if (bot.falling) {
                bot.vy -= 0.02;
                bot.y += bot.vy;
                if (bot.y < -20) bot.dead = true;
            }

            this.dispatch('playerMoved', {
                playerId: bot.id,
                position: { x: bot.x, y: bot.y, z: bot.z },
                rotation: new THREE.Euler(0, bot.heading, 0)
            });
        });
    }

    // A random living bot breaks a block next to the player
    botAttack() {
        if (!this.playerPosition) return;
        const alive = this.bots.filter(b => !b.dead && !b.falling);
        if (alive.length === 0) return;
        const bot = alive[Math.floor(Math.random() * alive.length)];
        const x = Math.round(this.playerPosition.x + (Math.random() * 2 - 1) * 1.5);
        const z = Math.round(this.playerPosition.z + (Math.random() * 2 - 1) * 1.5);
        if (this.isSolid(x, z)) this.breakBlock(bot.id, { x, y: 0, z });
    }
}
