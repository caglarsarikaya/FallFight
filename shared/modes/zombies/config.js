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
        damageScale: 0.5, range: 30, reactionTime: [0.6, 1.0], aimError: 0.06, shotJitter: 0.01, headChance: 0,
        burst: [2, 5], burstPause: [0.8, 1.6], tapDelay: [0.4, 0.8],
        keep: [8, 15]           // the distance they try to fight from, backing off when you close in
    },
    // How zombies think (shared/modes/zombies/ZombieBrain.js on top of shared/ai/Brain.js)
    brain: {
        // Hopping off a block that starts cracking under them: better at it as the waves go on, so
        // floor traps work early and get harder later
        dodgeChance: 0.2, dodgeChancePerWave: 0.04, dodgeChanceMax: 0.6, dodgeReaction: [0.02, 0.1],
        // Under fire (hit in the last `memory` s, or a crosshair within aimMiss blocks of the chest):
        // weave left and right, flipping every `flip` s, while still mostly coming at you
        juke: { flip: [0.3, 0.8], memory: 1.0, aimMiss: 0.8, forward: 0.8 },
        separation: { radius: 1.3, weight: 1.2 },   // steer away from other zombies this close
        // Bodies push apart: never closer than their radii (scaled for giants)
        bodyRadius: 0.32,
        // Picking among equally short roads: a busy tile, a side this zombie prefers, a spot where
        // one fell to its death in the last dangerTime s
        crowdCost: 0.7, sideCost: 0.35, dangerCost: 3, dangerTime: 6,
        // Some go round the side or behind you rather than straight in
        flankers: 0.3, flank: { distance: [4, 7], replan: [1, 1.5], maxNodes: 1500, from: 9, closeIn: 3.5 },
        // Close in from their own angle around you, not single file
        surround: { range: 5, spread: 1.1 },
        // Normal zombies and runners leap at you from a few blocks away
        lunge: { range: [2.2, 3.6], speed: 1.9, up: 5, cooldown: [2.5, 4.5] },
        // Out in front of the pack and facing an automatic gun: slow down for the others
        packWait: { lead: 6, slow: 0.75, friends: 2 }
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
