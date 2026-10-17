import { mapOverlay } from './maps.js';
import { Zombies } from './Zombies.js';

export default {
    id: 'zombies', name: 'Zombies', short: 'ZOMBIES',
    description: 'Survive endless waves together. Zombie kills earn money: press B any time to buy guns, armor and ammo.',
    maps: ['de_dust_mini', 'fallfight_classic', 'fy_pool_day', 'fy_iceworld'],
    mapOverlay,
    ruleset: {},
    features: ['rpg', 'revive', 'angel', 'jetpack', 'longjump'],
    Rules: Zombies
};
