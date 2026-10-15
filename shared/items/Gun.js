import { GUN } from '../constants.js';
import { heatAfter, inaccuracy, pelletDirections, shotSeed } from '../spread.js';
import { Weapon } from './Weapon.js';

const scratchDirs = [];

// A hitscan firearm described by a spec from shared/config/weapons.js. Ammo lives in the
// player's inventory (mag + reserve per gun); fire rate, deploy and reload timers in player.gun.
export class Gun extends Weapon {
    constructor(spec) {
        super({
            id: spec.id,
            name: spec.name,
            damage: spec.damage,
            knockback: spec.knockback,
            cooldown: spec.interval,
            description: `${spec.damage}${spec.pellets > 1 ? `x${spec.pellets}` : ''} dmg · ${spec.mag} rounds${spec.auto ? ' · auto' : ''}`
        });
        this.spec = spec;
        this.isGun = true;
    }

    get action() {
        return 'shoot';
    }

    // Can this player pull the trigger right now? (deploy, reload, rate of fire, ammo)
    canFire(player, now) {
        const g = player.gun;
        const ammo = player.inventory.ammo[this.id];
        if (!ammo || ammo.mag <= 0 || now < g.readyAt) return false;
        if (now < g.nextFireAt - GUN.fireTolerance) return false;
        // A shell-by-shell reload can be interrupted by firing; a magazine reload can't
        if (g.reload && !(this.spec.reloadStyle === 'shell' && ammo.mag > 0)) return false;
        return true;
    }

    // ctx: { room, player, origin, dir, seq, rewind, now }. Returns true when a shot went off.
    fire({ room, player, origin, dir, seq = 0, rewind, now }) {
        if (!this.canFire(player, now)) return false;
        const spec = this.spec;
        const g = player.gun;
        g.reload = null;
        player.inventory.ammo[this.id].mag--;
        g.nextFireAt = Math.max(now, g.nextFireAt) + spec.interval;

        // Accuracy depends on movement, stance, scope and how long we've been spraying
        const heat = Math.max(0, heatAfter(spec, g.heat, now - g.lastShotAt) - 1);
        const cone = inaccuracy(spec, {
            speed: Math.hypot(player.vx, player.vz),
            onGround: player.onGround,
            crouching: player.crouching,
            scoped: g.scoped > 0,
            heat
        });
        g.heat = heat + 1;
        g.lastShotAt = now;
        if (spec.scope) g.scoped = 0; // bolt action: the scope drops after every shot

        const dirs = pelletDirections(dir, cone, spec.pellets, shotSeed(player.id, seq), scratchDirs);
        room.resolveShot(player, this, origin, dirs, rewind ?? now);
        return true;
    }
}
