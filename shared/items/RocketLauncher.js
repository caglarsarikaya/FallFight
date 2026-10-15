import { WEAPON_SLOT } from '../config/weapons.js';
import { Gun } from './Gun.js';

// A one-shot launcher (the map's RPG): fires a rocket projectile instead of a bullet, which the
// room blows up where it lands (GameRoom.explode). The launcher is gone once fired.
export class RocketLauncher extends Gun {
    // Blast tuning the room reads when the rocket ends: { radius, damage, blockRadius, knockback }
    get blast() {
        return this.spec.rocket;
    }

    fire({ room, player, origin, dir, now }) {
        if (!this.canFire(player, now)) return false;
        const rocket = this.spec.rocket;
        player.inventory.ammo[this.id].mag--;
        player.gun.reload = null;
        player.gun.nextFireAt = now + this.spec.interval;
        room.spawnProjectile(player, this, origin, {
            x: dir.x * rocket.speed,
            y: dir.y * rocket.speed,
            z: dir.z * rocket.speed
        }, { life: rocket.life });

        // Single use: drop the empty tube and go back to the best weapon
        player.inventory.removeSlot(WEAPON_SLOT.SPECIAL);
        player.gun.readyAt = now + 0.5;
        room.notifyInventory(player);
        return true;
    }
}
