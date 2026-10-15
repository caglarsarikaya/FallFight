import { PLAYER, POTION } from '../constants.js';
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

    // Don't waste a potion at full health
    canConsume(player) {
        return player.health < PLAYER.maxHealth;
    }

    applyEffect({ room, player }) {
        room.heal(player, this.heal);
    }
}
