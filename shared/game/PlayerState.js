import { PLAYER } from '../constants.js';
import { Inventory } from '../inventory/Inventory.js';
import { bodyHeight } from './Hitbox.js';

// Per-player weapon timers (server time): deploy, rate of fire, spray heat, reload, scope
export function freshGunState() {
    return { readyAt: 0, nextFireAt: 0, heat: 0, lastShotAt: -Infinity, reload: null, scoped: 0 };
}

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
        this.crouching = false;
        this.walking = false;
        this.lastGroundBlock = null; // { ix, iy, iz } last block stood on, for fall kill credit

        this.maxHealth = PLAYER.maxHealth;
        this.health = PLAYER.maxHealth;
        this.isZombie = false;
        this.armor = 0;
        this.helmet = false;
        this.alive = true;
        this.respawnAt = 0;
        this.protectedUntil = 0;
        this.taggedUntil = 0;
        this.inventory = new Inventory();
        this.cooldowns = {};
        this.gun = freshGunState();
        this.drawing = false;

        this.kills = 0;
        this.deaths = 0;
        this.score = 0;         // what the mode ranks by (kills, gun game progress...)
        this.lastDamage = null; // { by, weapon, time }
    }

    get height() {
        return bodyHeight(this.crouching);
    }

    get eye() {
        return { x: this.x, y: this.y + (this.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight), z: this.z };
    }

    // Collision box for projectiles and block checks
    get bounds() {
        const r = PLAYER.radius + 0.1;
        return {
            min: { x: this.x - r, y: this.y, z: this.z - r },
            max: { x: this.x + r, y: this.y + this.height, z: this.z + r }
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
            crouching: this.crouching,
            health: this.health,
            armor: this.armor,
            alive: this.alive,
            item: this.inventory.selectedId,
            kills: this.kills,
            deaths: this.deaths,
            score: this.score
        };
    }
}

const round = v => Math.round(v * 1000) / 1000;
