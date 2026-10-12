// Game rules and tuning shared by the client, the server and the in-browser offline server.
// Units: distances in blocks, times in seconds, speeds in blocks per second.

export const ARENA = {
    size: 60,          // 60 x 60 floor tiles
    height: 10,        // block layers: the floor, 8-high sniper towers, their parapet and headroom
    voidY: -8          // falling below this kills
};

export const PLAYER = {
    maxHealth: 100,
    radius: 0.3,
    height: 1.8,
    eyeHeight: 1.6,
    walkSpeed: 4.6,
    jumpSpeed: 7.6,    // ~1.2 block jump with the gravity below
    gravity: 24,
    groundAccel: 14,
    airAccel: 3,
    respawnDelay: 3,
    spawnProtection: 2,
    // Hit zones by height above the feet
    zones: { headFrom: 1.4, bodyFrom: 0.75 }
};

export const BLOCK = {
    breakDelay: 0.4,   // cracking time before a block disappears
    regrowDelay: 20
};

export const AXE = {
    damage: 10,
    reach: 3.5,
    cooldown: 0.45,
    knockback: 5
};

export const BOW = {
    // [weakest, strongest] damage by zone; scales with draw power (0.15..1)
    damage: { legs: [8, 24], body: [12, 35], head: [50, 80] },
    headshotPower: 0.95, // a head hit at (almost) full draw kills outright
    minDraw: 0.15,
    fullDraw: 1.0,
    minSpeed: 15,
    maxSpeed: 42,
    cooldown: 0.3,
    knockback: 6
};

export const POTION = {
    heal: 20,
    cooldown: 0.5
};

export const PROJECTILE = {
    gravity: 0,        // arrows fly straight, no drop
    maxLife: 3,        // seconds; without gravity, stray arrows simply expire
    radius: 0.1
};

export const LOADOUT = {
    arrow: 20,
    health_potion: 0
};

export const PICKUPS = {
    arrow: { interval: 15, amount: 3, max: 5 },
    health_potion: { interval: 60, amount: 1, max: 2 },
    radius: 0.9
};

// Who gets credit when someone falls: whoever hurt them or broke their floor this recently
export const KILL_CREDIT_WINDOW = 10;

export const NET = {
    tickRate: 30,
    snapshotRate: 20,
    clientSendRate: 20,
    maxPlayersPerRoom: 4  // fighters per room; empty seats are filled with bots
};
