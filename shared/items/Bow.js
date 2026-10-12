import { BOW, PLAYER } from '../constants.js';
import { RangedWeapon } from './Weapon.js';

const lerp = ([min, max], t) => min + (max - min) * t;

// Hold to draw, release to fire. A longer draw flies faster and hits harder; where it lands
// matters too: legs < body < head, and a full-draw arrow to the head kills outright.
export class Bow extends RangedWeapon {
    constructor() {
        super({
            id: 'bow',
            name: 'Bow',
            ammo: 'arrow',
            damage: BOW.damage.body[1],
            cooldown: BOW.cooldown,
            knockback: BOW.knockback,
            description: `${BOW.damage.body[0]}-${BOW.damage.body[1]} damage, draw longer to hit harder · full-draw headshots kill`
        });
        this.chargeable = true;
    }

    // 0..1 draw progress for a held time in seconds (also used by the client UI)
    static drawProgress(heldSeconds) {
        return Math.max(0, Math.min(1, heldSeconds / BOW.fullDraw));
    }

    launchSpeed(charge) {
        if (!(charge >= BOW.minDraw)) return null;
        return BOW.minSpeed + (BOW.maxSpeed - BOW.minSpeed) * Bow.drawProgress(charge);
    }

    projectileData(charge) {
        return { power: Bow.drawProgress(charge) };
    }

    damageFor({ zone, power }) {
        if (zone === 'head' && power >= BOW.headshotPower) {
            return { amount: PLAYER.maxHealth, headshot: true };
        }
        const range = BOW.damage[zone] || BOW.damage.body;
        return { amount: Math.round(lerp(range, power)), headshot: false };
    }
}
