import { TeamBuy } from './TeamBuy.js';

export default {
    id: 'teambuy', name: 'Team Buy', short: 'TEAMS',
    description: 'Red Brick vs Blue Brick in rounds. Kills earn money: buy guns, armor and potions.',
    maps: ['fy_pool_day', 'de_dust_mini', 'fy_iceworld', 'fallfight_classic'],
    ruleset: {},
    features: ['rpg'],
    Rules: TeamBuy
};
