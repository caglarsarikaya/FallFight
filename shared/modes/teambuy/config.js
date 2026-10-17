// Team Buy tuning (rules in ./TeamBuy.js)
export const TEAM_BUY = Object.freeze({
    teams: ['t', 'ct'],
    teamNames: { t: 'Red Brick', ct: 'Blue Brick' },
    teamTags: { t: 'RED', ct: 'BLU' },
    startMoney: 800,
    maxMoney: 16000,
    freezeTime: 6,          // seconds at the start of a round to buy, before anyone can move
    buyTime: 20,            // seconds from the round start during which the buy menu works
    roundTime: 120,
    roundEndDelay: 5,       // pause after a round is decided
    roundsToWin: 8,
    winReward: 3250,
    lossReward: 1400,
    lossBonus: 500,         // extra per lost round in a row (capped)
    maxLossBonus: 2000,
    defaultPistol: { t: 'glock', ct: 'usp' }
});

// Message names (S2C.EVENT, see shared/protocol.js)
export const TEAM_BUY_EVENTS = Object.freeze({
    ROUND_START: 'roundStart',  // { round, freezeTime }
    ROUND_END: 'roundEnd'       // { winner: 't' | 'ct' | null, reason, score, round }
});
