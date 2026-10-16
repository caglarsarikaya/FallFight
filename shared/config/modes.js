// Game modes: what the menus show and the tuning each mode's rules use.
// The rules themselves live in shared/game/modes/.

export const GUN_GAME = Object.freeze({
    // One gun per level, weakest to strongest; the knife is always carried
    ladder: ['glock', 'usp', 'deagle', 'mp5', 'p90', 'm3', 'scout', 'm4a1', 'ak47', 'awp'],
    killsPerLevel: 5     // 10 levels x 5 kills: the first to 50 wins
});

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
    // Equipment that isn't a gun
    kevlar: 650,
    kevlarHelmet: 1000,
    potion: 200,
    defaultPistol: { t: 'glock', ct: 'usp' }
});

export const ZOMBIES = Object.freeze({
    firstWaveDelay: 8,
    waveBreak: 12,          // seconds between waves (dead players come back)
    baseCount: 6,           // zombies in wave n: baseCount + perWave * n
    perWave: 4,
    maxAlive: 24,
    health: 100,            // wave 1; grows each wave
    healthPerWave: 15,
    speed: 3.2,             // blocks per second; grows each wave
    speedPerWave: 0.12,
    maxSpeed: 4.6,
    runnerEvery: 5,         // every 5th wave adds fast, weak runners
    giantEvery: 5,          // wave 5: 1 giant on top of the usual zombies, wave 10: 2, wave 15: 3...
    // A giant, relative to that wave's normal zombie: bigger (hitbox too), tougher, slower, harder hitting
    giant: { scale: 1.6, health: 10, speed: 0.7, damage: 2.2, reach: 2.2, killMoney: 1000 },
    // A few zombies carry a gun, so nobody is safe on a tower with the stairs shot away. From
    // fromWave on, `chance` of the normal zombies are gunners; better guns come in as the waves go
    // on (wave n picks from the first n + 1 guns). They hit softer (damageScale), only shoot within
    // range, aim badly and never run out of ammo. Their gun is dropped when they die.
    gunner: {
        chance: 0.05, fromWave: 2, guns: ['glock', 'usp', 'mp5', 'ak47', 'm4a1'],
        damageScale: 0.5, range: 30, reaction: [0.6, 1.0], aimError: 0.06, burst: [2, 5], burstPause: [0.8, 1.6]
    },
    knockback: 0.3,         // how much a bullet's shove moves a zombie (giants: none)
    damage: 20,
    attackInterval: 0.9,
    reach: 1.4,
    // Loot dropped by killed zombies: chance per kill
    drops: { ammo: 0.35, health_potion: 0.12, armor: 0.1, weapon: 0.06, godmode: 0.02 },
    dropLife: 25,
    // A teammate holding E next to a fallen player for `time` seconds brings them back there
    revive: { time: 5, reach: 2, health: 50 },
    loadout: ['usp'],       // humans start with a pistol and the knife
    // The shop (B, any time): same items and prices as Team Buy
    startMoney: 800,        // also what everyone has again on a new run
    killMoney: 150,         // to the player who kills a zombie
    waveBonus: 500,         // to every human when a wave is cleared
    maxMoney: 16000
});

export const MODES = Object.freeze([
    {
        id: 'ffa', name: 'Deathmatch', short: 'DM',
        description: 'Everyone for themselves. A random rifle and pistol every life, or press B to pick any gun for free.',
        maps: ['fallfight_classic', 'fy_iceworld', 'de_dust_mini', 'fy_pool_day']
    },
    {
        id: 'gungame', name: 'Gun Game', short: 'GG',
        description: `Every ${GUN_GAME.killsPerLevel} kills: a better gun. First to finish the ${GUN_GAME.ladder.length}-gun ladder wins. Knife kills steal a kill.`,
        maps: ['fy_iceworld', 'fallfight_classic', 'de_dust_mini', 'fy_pool_day']
    },
    {
        id: 'teambuy', name: 'Team Buy', short: 'TEAMS',
        description: 'Red Brick vs Blue Brick in rounds. Kills earn money: buy guns, armor and potions.',
        maps: ['fy_pool_day', 'de_dust_mini', 'fy_iceworld', 'fallfight_classic']
    },
    {
        id: 'zombies', name: 'Zombies', short: 'ZOMBIES',
        description: 'Survive endless waves together. Zombie kills earn money: press B any time to buy guns, armor and ammo.',
        maps: ['de_dust_mini', 'fallfight_classic', 'fy_pool_day', 'fy_iceworld']
    }
]);

export const DEFAULT_MODE = 'ffa';

export function getModeInfo(id) {
    return MODES.find(m => m.id === id) || null;
}

export function isValidMode(id) {
    return MODES.some(m => m.id === id);
}
