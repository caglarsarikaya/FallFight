import { GOD_MODE } from '../constants.js';
import { Consumable } from './Consumable.js';

// Zombies: the angel. A rare drop kept in its own slot (8) until you need it; using it gives
// GOD_MODE.duration seconds of wings, a golden shine and no damage from zombies (Zombies.canDamage).
export class GodMode extends Consumable {
    constructor() {
        super({
            id: 'godmode',
            name: 'Angel',
            cooldown: 0.5,
            description: `${GOD_MODE.duration} s safe from zombies`
        });
        this.short = 'ANGEL';
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
