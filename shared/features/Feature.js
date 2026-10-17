// A reusable piece of gameplay a mode opts into by listing its id in its descriptor's `features`
// (jetpack, long jump, angel, revive, the map's RPG). GameRoom makes one instance per room and calls
// every hook on every feature of the room; all of them are optional. A feature keeps its
// per-player state on the player (resetPlayer sets it up, onDeath clears it).
//
// static movement: optional hooks for shared/physics.js stepMovement, used by bots on the server
// and by client prediction alike (so it must not touch the room):
//   prepare(input, perks)     client: add this feature's input from the keys and what the player
//                             carries (perks: the player's own snapshot fields)
//   step(body, input, arena, dt, rules) -> true if it moved the body itself this tick (flight)
//   jump(body, input, rules)  -> true if it made its own jump (sets body.jumpKind)
export class Feature {
    constructor(room) {
        this.room = room;
    }

    get id() {
        return this.constructor.id;
    }

    // A new match
    reset() {}

    resetPlayer(_player) {}

    // The player just died (before the mode hears of it)
    onDeath(_player) {}

    tick(_dt) {}

    // Nothing can hurt this player right now
    shielded(_player) {
        return false;
    }

    // A hit is about to kill this player: true if the feature saved them (the hit is cancelled)
    saveFromDeath(_player) {
        return false;
    }

    fallImmune(_player) {
        return false;
    }

    // May this player's client report them as flying?
    canFly(_player) {
        return false;
    }

    // Fields added to this player's snapshot (people only, not NPCs)
    playerJSON(_player) {
        return null;
    }

    // Pickup types this feature owns: { type: { canTake?(player, pickup), apply(player, pickup) } }
    get pickups() {
        return {};
    }

    // Client requests this feature handles (C2S.ACTION): { name: (player, data) => void }
    get actions() {
        return {};
    }
}
