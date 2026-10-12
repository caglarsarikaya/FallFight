import { Axe } from './Axe.js';
import { Bow } from './Bow.js';
import { HealthPotion } from './HealthPotion.js';

// Items are stateless singletons; per-player state (ammo, cooldowns) lives on the player.
// To add a weapon: create a class extending MeleeWeapon/RangedWeapon, register it here,
// add it to DEFAULT_HOTBAR if everyone should carry it, and add a client ItemView.
const items = new Map();

export function registerItem(item) {
    if (items.has(item.id)) throw new Error(`Item "${item.id}" is already registered`);
    items.set(item.id, item);
    return item;
}

export function getItem(id) {
    return items.get(id) || null;
}

export function allItems() {
    return [...items.values()];
}

registerItem(new Bow());
registerItem(new Axe());
registerItem(new HealthPotion());

// Hotbar layout every player starts with: key 1, 2, 3
export const DEFAULT_HOTBAR = ['bow', 'axe', 'health_potion'];
