// In-browser stand-in for the Socket.io server, used for offline play vs bots.
// Implements the same on/emit/id surface that game.js uses, and runs the bot AI.

// Bot tuning (distances in blocks, times in seconds)
const BOT_SETTINGS = {
    walkSpeed: 4.2,              // human walks ~4.8
    reach: 3.8,                  // human axe reach is ~4 from eye height
    preferredDistance: [2, 3],
    attackCooldown: [1.8, 3.0],
    missChance: 0.45,            // aim one tile off
    leadChance: 0.4,             // aim where the target is heading
    cutBetweenChance: 0.2,       // break a tile between bot and target to isolate it
    dodgeChance: 0.8,            // react to a break under its feet
    reactionTime: [0.12, 0.22],
    retargetInterval: 2,
    crowdPenalty: 3              // prefer targets other bots aren't already attacking
};

const WORLD = {
    tick: 0.05,                  // bot simulation step, also playerMoved rate
    breakDelay: 400,             // ms before a broken block disappears (matches game.js)
    groundY: 1.5,                // resting height of a player's origin on a block
    deathY: -1.75,               // same threshold as game.js death zone check
    gravity: 43,                 // matches game.js 0.012 per 60 Hz step
    jumpSpeed: 10.2,             // matches game.js 0.17 per 60 Hz step
    min: -15,
    max: 14
};

const rand = (min, max) => min + Math.random() * (max - min);
const tileKey = (x, z) => `${x},${z}`;

class LocalSocket {
    constructor() {
        this.id = 'local-player';
        this.handlers = {};
        this.entities = new Map();
        this.brokenBlocks = new Set();
        this.pendingBlocks = new Set();
        this.timer = null;
        this.time = 0;
        this.over = false;
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
                this.breakBlock(this.id, Math.round(data.x), Math.round(data.z));
                break;
            case 'playerMove':
                this.trackHuman(data.position);
                break;
            case 'playerEliminated':
                this.eliminate(this.id);
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
            const angle = (index / players.length) * Math.PI * 2;
            this.entities.set(player.id, {
                id: player.id,
                name: player.username,
                isBot: !!player.isBot,
                alive: true,
                x: Math.cos(angle) * 10,
                y: WORLD.groundY,
                z: Math.sin(angle) * 10,
                vx: 0, vy: 0, vz: 0,
                onGround: true,
                heading: angle + Math.PI / 2,
                target: null,
                retargetAt: 0,
                nextAttackAt: rand(3, 5),
                dodge: null,
                dodgedTile: null
            });
        });

        const room = { id: 'local', players, status: 'starting' };
        this.dispatch('roomUpdate', room);
        this.dispatch('gameStart', room);

        this.timer = setInterval(() => this.update(), WORLD.tick * 1000);
    }

    trackHuman(position) {
        const human = this.entities.get(this.id);
        if (!human || !human.alive) return;
        const dt = Math.max(this.time - (human.lastSeen || 0), WORLD.tick);
        // Smoothed velocity estimate, used by bots to lead their aim
        human.vx = human.vx * 0.5 + ((position.x - human.x) / dt) * 0.5;
        human.vz = human.vz * 0.5 + ((position.z - human.z) / dt) * 0.5;
        human.x = position.x;
        human.y = position.y;
        human.z = position.z;
        human.lastSeen = this.time;
    }

    isSolid(x, z) {
        const bx = Math.round(x), bz = Math.round(z);
        return bx >= WORLD.min && bx <= WORLD.max && bz >= WORLD.min && bz <= WORLD.max &&
            !this.brokenBlocks.has(tileKey(bx, bz));
    }

    // Solid and not about to break
    isSafe(x, z) {
        return this.isSolid(x, z) && !this.pendingBlocks.has(tileKey(Math.round(x), Math.round(z)));
    }

    breakBlock(playerId, x, z) {
        const key = tileKey(x, z);
        if (!this.isSolid(x, z) || this.pendingBlocks.has(key)) return;
        this.pendingBlocks.add(key);
        this.dispatch('blockBroken', { playerId, x, y: 0, z });
        setTimeout(() => {
            this.pendingBlocks.delete(key);
            this.brokenBlocks.add(key);
        }, WORLD.breakDelay);
    }

    eliminate(id) {
        const entity = this.entities.get(id);
        if (!entity || !entity.alive) return;
        entity.alive = false;
        this.dispatch('playerFell', { playerId: id });

        const alive = [...this.entities.values()].filter(e => e.alive);
        if (alive.length <= 1 && !this.over) {
            this.over = true;
            const winner = alive[0];
            this.dispatch('gameOver', {
                winnerId: winner ? winner.id : null,
                winnerName: winner ? winner.name : null
            });
            // Let the last fall animate before stopping
            setTimeout(() => clearInterval(this.timer), 1000);
        }
    }

    update() {
        this.time += WORLD.tick;
        this.entities.forEach(bot => {
            if (!bot.isBot) return;
            if (bot.alive) this.updateBot(bot);
            else if (bot.y > -20) this.applyPhysics(bot); // keep falling for the visual

            this.dispatch('playerMoved', {
                playerId: bot.id,
                position: { x: bot.x, y: bot.y, z: bot.z },
                rotation: { _x: 0, _y: bot.heading, _z: 0, x: 0, y: bot.heading, z: 0 }
            });
        });
    }

    applyPhysics(bot) {
        const dt = WORLD.tick;
        if (bot.onGround && !this.isSolid(bot.x, bot.z)) bot.onGround = false;
        if (bot.onGround) return;

        bot.vy -= WORLD.gravity * dt;
        bot.x += bot.vx * dt;
        bot.z += bot.vz * dt;
        bot.y += bot.vy * dt;

        if (bot.vy < 0 && bot.y <= WORLD.groundY && bot.y > WORLD.groundY - 0.5 && this.isSolid(bot.x, bot.z)) {
            bot.y = WORLD.groundY;
            bot.vy = bot.vx = bot.vz = 0;
            bot.onGround = true;
        }
        if (bot.alive && bot.y < WORLD.deathY) this.eliminate(bot.id);
    }

    updateBot(bot) {
        this.applyPhysics(bot);
        if (!bot.alive || !bot.onGround) return;

        if (this.tryDodge(bot)) return;

        const target = this.pickTarget(bot);
        if (!target) return;

        const dx = target.x - bot.x;
        const dz = target.z - bot.z;
        const dist = Math.hypot(dx, dz);
        const [near, far] = BOT_SETTINGS.preferredDistance;

        // Approach, back off, or strafe around the target
        let wantX = 0, wantZ = 0;
        if (dist > far) { wantX = dx / dist; wantZ = dz / dist; }
        else if (dist < near) { wantX = -dx / dist; wantZ = -dz / dist; }
        else {
            if (!bot.strafeDir || Math.random() < 0.03) bot.strafeDir = Math.random() < 0.5 ? 1 : -1;
            wantX = (-dz / dist) * bot.strafeDir;
            wantZ = (dx / dist) * bot.strafeDir;
        }
        if (wantX || wantZ) this.walk(bot, wantX, wantZ);

        // Face the target (game.js forward is (-sin h, -cos h))
        bot.heading = Math.atan2(-dx, -dz);

        if (this.time >= bot.nextAttackAt && dist <= BOT_SETTINGS.reach) {
            this.attack(bot, target, dist);
            bot.nextAttackAt = this.time + rand(...BOT_SETTINGS.attackCooldown);
        }
    }

    // Step in the allowed direction closest to the wanted one, never onto a hole
    walk(bot, wantX, wantZ) {
        const step = BOT_SETTINGS.walkSpeed * WORLD.tick;
        let best = null, bestScore = 0.2;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const dirX = Math.cos(a), dirZ = Math.sin(a);
            const score = dirX * wantX + dirZ * wantZ;
            if (score > bestScore && this.isSafe(bot.x + dirX * (step + 0.35), bot.z + dirZ * (step + 0.35))) {
                best = { dirX, dirZ };
                bestScore = score;
            }
        }
        if (best) {
            bot.x += best.dirX * step;
            bot.z += best.dirZ * step;
        }
    }

    pickTarget(bot) {
        const current = bot.target && this.entities.get(bot.target);
        if (current && current.alive && this.time < bot.retargetAt) return current;

        let best = null, bestScore = Infinity;
        this.entities.forEach(other => {
            if (other === bot || !other.alive) return;
            const crowd = [...this.entities.values()]
                .filter(e => e.isBot && e.alive && e !== bot && e.target === other.id).length;
            const score = Math.hypot(other.x - bot.x, other.z - bot.z) + crowd * BOT_SETTINGS.crowdPenalty;
            if (score < bestScore) { best = other; bestScore = score; }
        });
        bot.target = best ? best.id : null;
        bot.retargetAt = this.time + BOT_SETTINGS.retargetInterval;
        return best;
    }

    attack(bot, target, dist) {
        let aimX = target.x, aimZ = target.z;
        if (Math.random() < BOT_SETTINGS.cutBetweenChance && dist > 2) {
            aimX = (bot.x + target.x) / 2;
            aimZ = (bot.z + target.z) / 2;
        } else if (Math.random() < BOT_SETTINGS.leadChance) {
            aimX += (target.vx || 0) * 0.3;
            aimZ += (target.vz || 0) * 0.3;
        }
        if (Math.random() < BOT_SETTINGS.missChance) {
            aimX += Math.round(rand(-1, 1));
            aimZ += Math.round(rand(-1, 1));
        }

        const tx = Math.round(aimX), tz = Math.round(aimZ);
        if (tx === Math.round(bot.x) && tz === Math.round(bot.z)) return; // never dig under itself
        this.breakBlock(bot.id, tx, tz);
    }

    // React to a break under its own feet by jumping to a safe neighbouring tile
    tryDodge(bot) {
        const bx = Math.round(bot.x), bz = Math.round(bot.z);
        const key = tileKey(bx, bz);

        if (!bot.dodge && this.pendingBlocks.has(key) && bot.dodgedTile !== key) {
            bot.dodgedTile = key; // decide once per threatened tile
            if (Math.random() < BOT_SETTINGS.dodgeChance) {
                bot.dodge = { at: this.time + rand(...BOT_SETTINGS.reactionTime) };
            }
        }
        if (!bot.dodge) return false;
        if (this.time < bot.dodge.at) return true;

        const options = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
            .filter(([ox, oz]) => this.isSafe(bx + ox, bz + oz));
        bot.dodge = null;
        if (options.length === 0) return false;

        const [ox, oz] = options[Math.floor(Math.random() * options.length)];
        const airtime = (2 * WORLD.jumpSpeed) / WORLD.gravity;
        bot.vx = (bx + ox - bot.x) / airtime;
        bot.vz = (bz + oz - bot.z) / airtime;
        bot.vy = WORLD.jumpSpeed;
        bot.onGround = false;
        return true;
    }
}
