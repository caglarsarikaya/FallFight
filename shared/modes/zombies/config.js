// Zombies tuning (rules in ./Zombies.js)
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
    drops: { ammo: 0.35, health_potion: 0.12, armor: 0.1, weapon: 0.06, godmode: 0.02, jetpack: 0.02 },
    dropLife: 25,
    // Guns zombies drop get better as the waves go on: wave n picks from the first n + 3
    dropLadder: ['glock', 'usp', 'deagle', 'mp5', 'p90', 'm3', 'scout', 'm4a1', 'ak47', 'awp'],
    loadout: ['usp'],       // humans start with a pistol and the knife
    // The shop (B, any time): the shared buy menu (shared/features/shop)
    startMoney: 800,        // also what everyone has again on a new run
    killMoney: 150,         // to the player who kills a zombie
    waveBonus: 500,         // to every human when a wave is cleared
    maxMoney: 16000
});

// Message names (S2C.EVENT, see shared/protocol.js)
export const ZOMBIES_EVENTS = Object.freeze({
    WAVE_START: 'waveStart',    // { wave, count, giants }
    WAVE_END: 'waveEnd'         // { wave, next, breakTime }
});
