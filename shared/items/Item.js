// Base class for everything a player can hold in the hotbar.
// Subclasses implement use(ctx). ctx = { room, player, origin, dir, charge, now }, where room is the
// GameRoom (authoritative) and origin/dir describe where the player is aiming.
export class Item {
    constructor({ id, name, cooldown = 0, countKey = null, description = '' }) {
        this.id = id;
        this.name = name;
        this.cooldown = cooldown;
        // Inventory counter shown on the hotbar slot (ammo or stack size), if any
        this.countKey = countKey;
        this.description = description;
    }

    // Animation name broadcast to other players when used
    get action() {
        return 'use';
    }

    isReady(player, now) {
        return now >= (player.cooldowns[this.id] || 0);
    }

    // Template method: checks cooldown, runs use(), starts the cooldown on success
    tryUse(ctx) {
        if (!this.isReady(ctx.player, ctx.now)) return false;
        const used = this.use(ctx);
        if (used) ctx.player.cooldowns[this.id] = ctx.now + this.cooldown;
        return used;
    }

    // Returns true when the item was actually used
    use(_ctx) {
        throw new Error(`${this.constructor.name} must implement use()`);
    }
}
