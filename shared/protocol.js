// Message names exchanged between a client and a GameRoom (local or over socket.io).

// Client -> server
export const C2S = {
    JOIN: 'join',          // { name, characterId }
    PROFILE: 'profile',    // { name, characterId }
    STATE: 'state',        // { x, y, z, vx, vy, vz, yaw, pitch, onGround }
    SELECT: 'select',      // { slot }
    DRAW: 'draw',          // { drawing } bow draw started/cancelled, for animation
    USE: 'use',            // { slot, dir: {x,y,z}, charge }
};

// Server -> client
export const S2C = {
    WELCOME: 'welcome',                // { selfId, time, players, arena, pickups, projectiles }
    SNAPSHOT: 'snapshot',              // { time, players }
    PLAYER_JOINED: 'playerJoined',     // player
    PLAYER_LEFT: 'playerLeft',         // { id }
    PLAYER_UPDATED: 'playerUpdated',   // { id, name, characterId }
    INVENTORY: 'inventory',            // inventory json (owner only)
    ACTION: 'action',                  // { id, action: 'swing' | 'shoot' | 'drink' }
    BLOCK_CRACKING: 'blockCracking',   // { ix, iz, by }
    BLOCK_BROKEN: 'blockBroken',       // { ix, iz }
    BLOCK_RESTORED: 'blockRestored',   // { ix, iz }
    PROJECTILE: 'projectile',          // { id, ownerId, x, y, z, vx, vy, vz }
    PROJECTILE_END: 'projectileEnd',   // { id, x, y, z, hitId }
    DAMAGE: 'damage',                  // { victimId, attackerId, amount, health, weapon, knockback }
    HEAL: 'heal',                      // { id, amount, health }
    DEATH: 'death',                    // { victimId, killerId, cause }
    RESPAWN: 'respawn',                // { id, x, y, z, health }
    PICKUP_SPAWNED: 'pickupSpawned',   // { id, type, x, y, z }
    PICKUP_TAKEN: 'pickupTaken',       // { id, by }
    SERVER_STATS: 'serverStats',       // { players, rooms: [{ players, bots }] } live counts for the menu
};
