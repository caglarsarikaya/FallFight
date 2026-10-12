import { BOW } from '../constants.js';
import { RangedWeapon } from './Weapon.js';

// Hold to draw, release to fire. Longer draws fly faster; damage is always the same.
export class Bow extends RangedWeapon {
    constructor() {
        super({
            id: 'bow',
            name: 'Bow',
            ammo: 'arrow',
            damage: BOW.damage,
            cooldown: BOW.cooldown,
            knockback: BOW.knockback,
            description: `${BOW.damage} damage, uses arrows`
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
}
