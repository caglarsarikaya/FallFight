// Gun Game tuning (rules in ./GunGame.js)
export const GUN_GAME = Object.freeze({
    // One gun per level, weakest to strongest; the knife is always carried
    ladder: ['glock', 'usp', 'deagle', 'mp5', 'p90', 'm3', 'scout', 'm4a1', 'ak47', 'awp'],
    killsPerLevel: 5     // 10 levels x 5 kills: the first to 50 wins
});

// Message names (S2C.EVENT, see shared/protocol.js)
export const GUN_GAME_EVENTS = Object.freeze({
    LEVEL_UP: 'levelUp'     // { id, level, weapon }
});
