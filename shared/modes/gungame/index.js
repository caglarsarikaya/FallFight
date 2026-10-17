import { GUN_GAME } from './config.js';
import { GunGame } from './GunGame.js';

export default {
    id: 'gungame', name: 'Gun Game', short: 'GG',
    description: `Every ${GUN_GAME.killsPerLevel} kills: a better gun. First to finish the ${GUN_GAME.ladder.length}-gun ladder wins. Knife kills steal a kill.`,
    maps: ['fy_iceworld', 'fallfight_classic', 'de_dust_mini', 'fy_pool_day'],
    ruleset: {},
    features: ['rpg'],
    Rules: GunGame
};
