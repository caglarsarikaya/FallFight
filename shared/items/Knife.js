import { GUN } from '../constants.js';
import { KNIFE } from '../config/weapons.js';
import { directionFromAngles } from '../math.js';
import { MeleeWeapon } from './Weapon.js';

// Slash (primary) is quick and light; stab (secondary) is slow and heavy, and kills from behind.
// When no player is in reach it chops the aimed block, like the old axe.
export class Knife extends MeleeWeapon {
    constructor() {
        super({
            id: KNIFE.id,
            name: KNIFE.name,
            damage: KNIFE.slash.damage,
            reach: KNIFE.reach,
            cooldown: KNIFE.slash.interval,
            knockback: 2,
            description: `Slash ${KNIFE.slash.damage} · right click stab ${KNIFE.stab.damage} · chops blocks`
        });
        this.isKnife = true;
        this.canBreakBlocks = true;
    }

    get action() {
        return 'swing';
    }

    canAttack(player, now) {
        return now >= player.gun.readyAt && now >= player.gun.nextFireAt - GUN.fireTolerance;
    }

    // ctx: { room, player, origin, dir, alt, rewind, now }
    attack({ room, player, origin, dir, alt = false, rewind, now }) {
        if (!this.canAttack(player, now)) return false;
        const mode = alt ? KNIFE.stab : KNIFE.slash;
        player.gun.nextFireAt = Math.max(now, player.gun.nextFireAt) + mode.interval;

        const hit = room.findPlayerHit(origin, dir, KNIFE.reach, player.id, rewind ?? now);
        if (hit) {
            const amount = alt && Knife.isBehind(player, hit.player) ? KNIFE.stab.backstab : mode.damage;
            room.damage(hit.player, amount, player, this.id,
                { x: dir.x, z: dir.z, strength: this.knockback },
                { zone: hit.zone, dir, ignoreArmor: true });
            return true;
        }
        const block = room.arena.raycast(origin, dir, KNIFE.blockReach);
        if (block) room.breakBlock(block.ix, block.iy, block.iz, player);
        return true;
    }

    // Attacker standing behind the victim, roughly facing the same way
    static isBehind(attacker, victim) {
        const facing = directionFromAngles(victim.yaw, 0);
        const dx = victim.x - attacker.x;
        const dz = victim.z - attacker.z;
        const len = Math.hypot(dx, dz) || 1;
        return (facing.x * dx + facing.z * dz) / len > 0.5;
    }
}
