import { PLAYER } from '../constants.js';
import { Inventory } from '../inventory/Inventory.js';

// Authoritative per-player state held by a GameRoom
export class PlayerState {
    constructor({ id, name, characterId, isBot = false }) {
        this.id = id;
        this.name = name;
        this.characterId = characterId;
        this.isBot = isBot;

        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.yaw = 0;
        this.pitch = 0;
        this.onGround = true;
        this.lastGroundBlock = null; // { ix, iy, iz } last block stood on, for fall kill credit

        this.health = PLAYER.maxHealth;
        this.alive = true;
        this.respawnAt = 0;
        this.protectedUntil = 0;
        this.inventory = new Inventory();
        this.cooldowns = {};
        this.drawing = false;

        this.kills = 0;
        this.deaths = 0;
        this.lastDamage = null; // { by, weapon, time }
    }

    get eye() {
        return { x: this.x, y: this.y + PLAYER.eyeHeight, z: this.z };
    }

    // Collision box for weapon hits
    get bounds() {
        const r = PLAYER.radius + 0.1;
        return {
            min: { x: this.x - r, y: this.y, z: this.z - r },
            max: { x: this.x + r, y: this.y + PLAYER.height, z: this.z + r }
        };
    }

    isProtected(now) {
        return now < this.protectedUntil;
    }

    // Full description sent when someone joins
    toJSON() {
        return {
            ...this.toSnapshot(),
            name: this.name,
            characterId: this.characterId,
            isBot: this.isBot
        };
    }

    // Compact per-tick state
    toSnapshot() {
        return {
            id: this.id,
            x: round(this.x), y: round(this.y), z: round(this.z),
            yaw: round(this.yaw), pitch: round(this.pitch),
            onGround: this.onGround,
            health: this.health,
            alive: this.alive,
            item: this.inventory.hotbar[this.inventory.selected],
            drawing: this.drawing,
            kills: this.kills,
            deaths: this.deaths
        };
    }
}

const round = v => Math.round(v * 1000) / 1000;
