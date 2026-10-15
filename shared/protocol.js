// Message names exchanged between a client and a GameRoom (local or over socket.io).

// Client -> server
export const C2S = {
    JOIN: 'join',          // { name, characterId, roomId?, password?, mode? } (no roomId = quick play in that mode)
    CHECK_ROOM: 'checkRoom',   // ack: { roomId, password } -> { ok } | { error }
    CREATE_ROOM: 'createRoom', // ack: { roomName, password, bots, maxPlayers, mode, map } -> { roomId } | { error }
    PROFILE: 'profile',    // { name, characterId }
    STATE: 'state',        // { x, y, z, vx, vy, vz, yaw, pitch, onGround, crouching, walking }
    SELECT: 'select',      // { slot }
    USE: 'use',            // { slot, dir: {x,y,z} } consumables (health potion)
    FIRE: 'fire',          // { slot, seq, dir: {x,y,z}, t, alt } gun shot / knife attack; t = server time
                           // the shooter was seeing other players at (lag compensation)
    RELOAD: 'reload',      // {}
    SCOPE: 'scope',        // { level } 0 = unscoped
    BUY: 'buy',            // { item } Team Buy: a gun id, 'kevlar', 'kevlar_helmet', 'health_potion', 'ammo'
    PREFS: 'prefs',        // { randomGuns } Deathmatch: random guns every life, or keep the ones you picked
    PING: 'latencyCheck',  // ack: {} -> {} round-trip timing ('ping' is reserved by socket.io)
};

// Server -> client
export const S2C = {
    WELCOME: 'welcome',                // { selfId, room, time, players, arena, pickups, projectiles }
    JOIN_ERROR: 'joinError',           // { error } joining a room failed
    SNAPSHOT: 'snapshot',              // { time, players }
    PLAYER_JOINED: 'playerJoined',     // player
    PLAYER_LEFT: 'playerLeft',         // { id }
    PLAYER_UPDATED: 'playerUpdated',   // { id, name, characterId }
    INVENTORY: 'inventory',            // inventory json (owner only)
    ACTION: 'action',                  // { id, action: 'swing' | 'stab' | 'drink' | 'reload', item }
    SHOT: 'shot',                      // { id, w: weaponId, o: [x,y,z], p: [dx,dy,dz,dist,kind]* } kind 0 air, 1 block, 2 player
    BLOCK_CRACKING: 'blockCracking',   // { ix, iz, by }
    BLOCK_BROKEN: 'blockBroken',       // { ix, iz }
    BLOCK_RESTORED: 'blockRestored',   // { ix, iz }
    PROJECTILE: 'projectile',          // { id, ownerId, x, y, z, vx, vy, vz }
    PROJECTILE_END: 'projectileEnd',   // { id, x, y, z, hitId, zone, stuck, explode } explode = blast radius (rockets)
    KNOCKBACK: 'knockback',            // { id, knockback: {x,y,z} } a push with no damage (your own rocket)
    DAMAGE: 'damage',                  // { victimId, attackerId, amount, health, armor, weapon, zone, headshot, armorHit, from, knockback }
    HEAL: 'heal',                      // { id, amount, health }
    DEATH: 'death',                    // { victimId, killerId, cause: weaponId | 'fall', headshot }
    RESPAWN: 'respawn',                // { id, x, y, z, health }
    PICKUP_SPAWNED: 'pickupSpawned',   // { id, type, x, y, z, spot? } spot: the tower name of an RPG
    PICKUP_TAKEN: 'pickupTaken',       // { id, by }
    MODE_STATE: 'modeState',           // mode-specific: scores, round, timers, wave... (see GameMode.stateJSON)
    MATCH_END: 'matchEnd',             // { winnerId, winnerTeam, title, standings, restartIn }
    MATCH_START: 'matchStart',         // {} a new match began (scores reset)
    LEVEL_UP: 'levelUp',               // { id, level, weapon } Gun Game
    ROUND_START: 'roundStart',         // { round, freezeTime } Team Buy
    ROUND_END: 'roundEnd',             // { winner: 't' | 'ct' | null, reason, score, round }
    BUY_RESULT: 'buyResult',           // { ok, item, error? } to the buyer
    WAVE_START: 'waveStart',           // { wave, count } Zombies
    WAVE_END: 'waveEnd',               // { wave, next, breakTime }
    SERVER_STATS: 'serverStats',       // { players, rooms: [{ id, name, kind, players, maxPlayers, bots, botCount, locked }] }
};
