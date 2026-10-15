import { GRENADE } from '../constants.js';
import { WEAPONS, WEAPON_KIND, WEAPON_SLOT } from '../config/weapons.js';
import { Gun } from './Gun.js';
import { RocketLauncher } from './RocketLauncher.js';
import { Knife } from './Knife.js';
import { HealthPotion } from './HealthPotion.js';
import { Grenade } from './Grenade.js';

// Items are stateless singletons; per-player state (ammo, timers) lives on the player.
// To add a gun: add its spec to shared/config/weapons.js and a model spec in
// client/src/items/guns/specs.js; it's registered here automatically.
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

for (const spec of Object.values(WEAPONS)) {
    registerItem(spec.kind === WEAPON_KIND.LAUNCHER ? new RocketLauncher(spec) : new Gun(spec));
}
registerItem(new Knife());
registerItem(new HealthPotion());
const { he, smoke } = GRENADE;
registerItem(new Grenade({
    id: 'hegrenade', name: 'HE Grenade', short: 'HE', slot: WEAPON_SLOT.HE,
    blast: { radius: he.radius, damage: he.damage, blockRadius: he.blockRadius, knockback: he.knockback }
}));
registerItem(new Grenade({
    id: 'smokegrenade', name: 'Smoke Grenade', short: 'SMOKE', slot: WEAPON_SLOT.SMOKE,
    smoke: { radius: smoke.radius, duration: smoke.duration }
}));
