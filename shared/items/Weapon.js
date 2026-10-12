import { Item } from './Item.js';

export class Weapon extends Item {
    constructor({ damage, knockback = 0, ...rest }) {
        super(rest);
        this.damage = damage;
        this.knockback = knockback;
    }
}

// Hits the first player within reach along the aim ray
export class MeleeWeapon extends Weapon {
    constructor({ reach, ...rest }) {
        super(rest);
        this.reach = reach;
    }

    get action() {
        return 'swing';
    }

    use(ctx) {
        this.strikePlayer(ctx);
        return true; // swinging at the air still counts (and costs the cooldown)
    }

    strikePlayer({ room, player, origin, dir }) {
        const hit = room.findPlayerHit(origin, dir, this.reach, player.id);
        if (!hit) return false;
        room.damage(hit.player, this.damage, player, this.id, { x: dir.x, z: dir.z, strength: this.knockback });
        return true;
    }
}

// Fires projectiles and consumes ammo from the inventory
export class RangedWeapon extends Weapon {
    constructor({ ammo, ...rest }) {
        super({ countKey: ammo, ...rest });
        this.ammo = ammo;
    }

    get action() {
        return 'shoot';
    }

    hasAmmo(player) {
        return player.inventory.count(this.ammo) > 0;
    }

    // Speed of the projectile for this shot, or null if it can't be fired
    launchSpeed(_charge) {
        throw new Error(`${this.constructor.name} must implement launchSpeed()`);
    }

    use({ room, player, origin, dir, charge }) {
        const speed = this.launchSpeed(charge);
        if (speed === null || !player.inventory.consume(this.ammo)) return false;
        room.spawnProjectile(player, this, origin, {
            x: dir.x * speed,
            y: dir.y * speed,
            z: dir.z * speed
        });
        room.notifyInventory(player);
        return true;
    }
}
