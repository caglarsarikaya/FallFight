// A teammate holding E next to a fallen player for `time` seconds brings them back there, with
// `health`. `reach`: how close (blocks) the helper must stay.
export const REVIVE = Object.freeze({ time: 5, reach: 2, health: 50 });

// Message names (C2S.ACTION / S2C.EVENT, see shared/protocol.js)
export const REVIVE_ACTION = 'revive';     // { id } start reviving that body, { id: null } stop
export const REVIVE_EVENTS = Object.freeze({
    REVIVE: 'revive',      // { reviverId, targetId, until } until = server time it's done, null = stopped
    REVIVED: 'revived'     // { reviverId, targetId } a fallen player is back on their feet
});
