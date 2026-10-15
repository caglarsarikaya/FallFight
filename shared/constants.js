// Game rules and tuning shared by the client, the server and the in-browser offline server.
// Units: distances in blocks, times in seconds, speeds in blocks per second.
import roomLimits from './config/rooms.json' with { type: 'json' };

// Server capacity, kept in shared/config/rooms.json so it's easy to raise later:
// maxRooms = open rooms on the server; maxPlayersPerRoom = fighters per room (bots included)
export const ROOMS = Object.freeze({ ...roomLimits });

export function validateRoomLimits(limits = ROOMS) {
    const ok = Number.isInteger(limits.maxRooms) && limits.maxRooms >= 1 &&
        Number.isInteger(limits.maxPlayersPerRoom) && limits.maxPlayersPerRoom >= 2;
    if (!ok) {
        throw new Error('shared/config/rooms.json: maxRooms must be an integer >= 1 and maxPlayersPerRoom an integer >= 2');
    }
    return limits;
}

// Map sizes come from each map (shared/world/maps/); this is what every map shares
export const ARENA = {
    voidY: -8          // falling below this kills
};

// After a match is won (Gun Game, Team Buy, a zombie wipe), the room restarts after this long
export const MATCH = {
    restartDelay: 10
};

export const PLAYER = {
    maxHealth: 100,
    radius: 0.3,
    height: 1.8,
    eyeHeight: 1.6,
    crouchHeight: 1.3,
    crouchEyeHeight: 1.1,
    walkSpeed: 5.2,    // knife out; guns scale it by their moveSpeed
    crouchSpeed: 0.34, // multipliers while crouching / holding walk (CS: 34% and 52%)
    slowWalkSpeed: 0.52,
    jumpSpeed: 7.6,    // ~1.2 block jump with the gravity below
    gravity: 24,
    groundAccel: 14,
    airAccel: 3,       // air strafing: turning while holding A/D adds a little speed (bunny hop)
    bhopCap: 1.5,      // a jump never starts faster than this times the top speed (CS anti mega-bhop)
    jumpBuffer: 0.1,   // seconds a jump press waits for the ground, so a hop can be timed a bit early
    respawnDelay: 3,
    spawnProtection: 2,
    // Hit zones by height above the feet (projectiles)
    zones: { headFrom: 1.4, bodyFrom: 0.75 },
    // Getting shot slows you down for a moment (CS "tagging")
    tagSpeed: 0.55,
    tagTime: 0.35
};

// Hitboxes for bullets and the knife, relative to the feet; scaled down when crouching.
// Tighter than the movement box, like CS: the head is a small box on top.
export const HITBOX = {
    head: { radius: 0.19, height: 0.36 },
    body: { radius: 0.33, from: 0.82 },
    legs: { radius: 0.27 }
};

export const ARMOR = {
    max: 100,
    absorb: 0.5       // armor points lost per point of damage it stops
};

export const GUN = {
    maxRange: 160,
    falloffHalf: 8,                 // blocks past a gun's range for its damage to halve
    falloffFloor: 0.2,              // share of damage a bullet always keeps, however far
    zoneMultiplier: { head: 4, body: 1, legs: 0.75 },
    penetrationLoss: 0.55,          // damage kept after punching through a block
    fireTolerance: 0.1,             // seconds of bunching allowed between shots arriving over the network
    lagCompensation: 0.25,          // max seconds the server rewinds targets for hit checks
    blockHits: 2                    // bullets that crack any breakable block (floor too)
};

export const BLOCK = {
    breakDelay: 0.2,   // cracking time before a block disappears
    regrowDelay: 20
};

export const POTION = {
    heal: 20,
    cooldown: 0.5
};

export const PROJECTILE = {
    gravity: 0,        // projectiles fly straight, no drop
    maxLife: 1.5,      // seconds; without gravity, strays simply expire
    radius: 0.1
};

// Free-for-all spawn loadout: a random primary and pistol, the knife and an empty potion slot
export const LOADOUT = {
    primary: ['ak47', 'm4a1', 'mp5', 'p90', 'm3', 'scout', 'awp'],
    secondary: ['usp', 'glock', 'deagle'],
    armor: 100,
    helmet: true,
    health_potion: 0
};

export const PICKUPS = {
    ammo: { interval: 15, amount: 1, max: 5 },   // amount = magazines for every gun carried
    health_potion: { interval: 60, amount: 1, max: 2 },
    radius: 0.9
};

// The map's power weapon (Lava Arena's RPG on a tower top): one at a time. The first appears
// firstDelay seconds into a match, the next one cooldown seconds after the last is fired or lost.
export const RPG = {
    firstDelay: 30,
    cooldown: 45
};

// Who gets credit when someone falls: whoever hurt them or broke their floor this recently
export const KILL_CREDIT_WINDOW = 10;

export const NET = {
    tickRate: 30,
    snapshotRate: 20,
    clientSendRate: 20
};
