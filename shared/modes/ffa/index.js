import { FreeForAll } from './FreeForAll.js';

// Deathmatch. A mode descriptor: what the menus show, which maps it plays on, its tuning
// (ruleset overrides, see shared/ruleset.js) and the class with its rules.
export default {
    id: 'ffa', name: 'Deathmatch', short: 'DM',
    description: 'Everyone for themselves. A random rifle and pistol every life, or press B to pick any gun for free.',
    maps: ['fallfight_classic', 'fy_iceworld', 'de_dust_mini', 'fy_pool_day'],
    ruleset: {},
    features: ['rpg'],
    Rules: FreeForAll
};
