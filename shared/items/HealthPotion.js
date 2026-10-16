import { POTION } from '../constants.js';
import { Consumable } from './Consumable.js';

export class HealthPotion extends Consumable {
    constructor() {
        super({
            id: 'health_potion',
            name: 'Health Potion',
            cooldown: POTION.cooldown,
            description: `Heals ${POTION.heal} HP`
        });
        this.heal = POTION.heal;
        this.short = 'POTION';
    }

    get usableWhenFrozen() {
        return true;
    }

    // Any missing health at all (99 of 100) is worth a potion; only full health refuses
    canConsume(player) {
        return player.health < player.maxHealth;
    }

    applyEffect({ room, player }) {
        room.heal(player, this.heal);
    }
}
