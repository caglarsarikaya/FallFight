import { LOADOUT } from '../constants.js';
import { DEFAULT_HOTBAR, getItem } from '../items/ItemRegistry.js';

// Hotbar of items (one selected at a time) plus counters for ammo and consumable stacks.
export class Inventory {
    constructor(hotbar = DEFAULT_HOTBAR, counts = LOADOUT) {
        this.hotbar = [...hotbar];
        this.counts = { ...counts };
        this.selected = 0;
    }

    reset(hotbar = DEFAULT_HOTBAR, counts = LOADOUT) {
        this.hotbar = [...hotbar];
        this.counts = { ...counts };
        this.selected = Math.min(this.selected, this.hotbar.length - 1);
    }

    select(slot) {
        if (Number.isInteger(slot) && slot >= 0 && slot < this.hotbar.length) {
            this.selected = slot;
            return true;
        }
        return false;
    }

    itemAt(slot) {
        const id = this.hotbar[slot];
        return id ? getItem(id) : null;
    }

    get selectedItem() {
        return this.itemAt(this.selected);
    }

    count(key) {
        return this.counts[key] || 0;
    }

    add(key, amount = 1) {
        this.counts[key] = this.count(key) + amount;
    }

    consume(key, amount = 1) {
        if (this.count(key) < amount) return false;
        this.counts[key] -= amount;
        return true;
    }

    // Adds an item to the first free hotbar slot (for future weapon pickups)
    addToHotbar(itemId) {
        if (this.hotbar.includes(itemId)) return false;
        this.hotbar.push(itemId);
        return true;
    }

    toJSON() {
        return { hotbar: [...this.hotbar], counts: { ...this.counts }, selected: this.selected };
    }
}
