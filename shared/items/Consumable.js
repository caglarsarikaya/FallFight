import { Item } from './Item.js';

// An item used up from an inventory stack (countKey is the stack's key)
export class Consumable extends Item {
    constructor({ id, ...rest }) {
        super({ id, countKey: id, ...rest });
    }

    get action() {
        return 'drink';
    }

    canConsume(_player) {
        return true;
    }

    use(ctx) {
        const { player } = ctx;
        if (!this.canConsume(player) || !player.inventory.consume(this.id)) return false;
        this.applyEffect(ctx);
        ctx.room.notifyInventory(player);
        return true;
    }

    applyEffect(_ctx) {
        throw new Error(`${this.constructor.name} must implement applyEffect()`);
    }
}
