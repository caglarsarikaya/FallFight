import { WEAPON_SLOT } from '../../config/weapons.js';
import { Consumable } from '../../items/Consumable.js';
import { GOD_MODE } from './config.js';

// The angel item. Kept in its own slot (8) until you need it; using it gives GOD_MODE.duration
// seconds of wings, a golden shine and no damage at all (Angel.shielded). Unused, it comes out by
// itself when a hit would kill you (Angel.saveFromDeath).
export class GodMode extends Consumable {
    constructor() {
        super({
            id: 'godmode',
            name: 'Angel',
            cooldown: 0.5,
            description: `${GOD_MODE.duration} s untouchable, saves you from a deadly hit`
        });
        this.short = 'ANGEL';
        this.slotWhenCarried = WEAPON_SLOT.EXTRA;
    }

    get usableWhenFrozen() {
        return true;
    }

    get action() {
        return 'angel';
    }

    // One at a time: no stacking a second on top of a running one
    canConsume(player, now) {
        return !(player.godUntil > now);
    }

    applyEffect({ player, now }) {
        player.godUntil = now + GOD_MODE.duration;
    }
}
