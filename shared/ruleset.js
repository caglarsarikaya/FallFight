import { FALL_DAMAGE, GRENADE, PLAYER } from './constants.js';

// Tuning a mode may change for its own rooms (low gravity, faster respawns...). Each GameRoom builds
// its own frozen copy from the defaults plus its mode's overrides, so one room's rules never leak
// into another room on the same server. The client gets the room's ruleset in the welcome and
// predicts its own movement with it.
export const DEFAULT_RULESET = deepFreeze({
    movement: {
        walkSpeed: PLAYER.walkSpeed,
        crouchSpeed: PLAYER.crouchSpeed,
        slowWalkSpeed: PLAYER.slowWalkSpeed,
        jumpSpeed: PLAYER.jumpSpeed,
        gravity: PLAYER.gravity,
        groundAccel: PLAYER.groundAccel,
        airControl: PLAYER.airControl,
        airAccel: PLAYER.airAccel,
        airWishCap: PLAYER.airWishCap,
        bhopCap: PLAYER.bhopCap,
        jumpBuffer: PLAYER.jumpBuffer
    },
    respawnDelay: PLAYER.respawnDelay,
    spawnProtection: PLAYER.spawnProtection,
    tagSpeed: PLAYER.tagSpeed,
    tagTime: PLAYER.tagTime,
    fallDamage: { ...FALL_DAMAGE },
    grenade: { gravity: GRENADE.gravity }
});

// The defaults with `overrides` merged in (nested objects merge key by key). Unknown keys are an
// error, so a typo in a mode's ruleset fails loudly instead of silently doing nothing.
export function buildRuleset(overrides = {}) {
    return deepFreeze(merge(DEFAULT_RULESET, overrides, 'ruleset'));
}

function merge(base, overrides, path) {
    const out = { ...base };
    for (const [key, value] of Object.entries(overrides || {})) {
        if (!Object.hasOwn(base, key)) throw new Error(`Unknown ${path}.${key}`);
        const isObject = typeof base[key] === 'object' && base[key] !== null;
        out[key] = isObject ? merge(base[key], value, `${path}.${key}`) : value;
    }
    return out;
}

function deepFreeze(obj) {
    for (const value of Object.values(obj)) if (typeof value === 'object' && value !== null) deepFreeze(value);
    return Object.freeze(obj);
}
