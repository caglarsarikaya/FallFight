// The client half of a mode or a feature: how it looks, sounds and reads on screen. Game makes one
// for the room's mode and one for each of its features (the welcome lists them) and calls these
// hooks on all of them; every hook is optional. Hooks that return true "handled" the thing, so the
// core leaves its default out.
//
//   static id, static menuControls: [[key, what]] for the controls lists (in-game hint, Esc menu
//   help, main menu; see ui/controls.js)
//   events: { name: handler(data) }      the mode's or feature's own S2C.EVENT messages
//   pickups: { type: { name?, spawned?(data), taken?(data) } }   what its pickups say and sound like
//   onPlayerAdded(info), onPlayerLeft(id)
//   onSnapshotPlayer(info, isSelf)       info already has the snapshot's fields
//   onAction(data)                       S2C.ACTION from anyone -> true: no default sound
//   onDeath(victim, data)                -> true: no kill feed / death screen (a monster's death)
//   onMatchStart()
//   update(dt)                           every frame; updateLocal(dt): every frame we play
//   remoteSound(info, dt)                -> true: makes its own noise instead of footsteps
//   useItem(id, now)                     -> true: it used that consumable
//   onUseKey(down)                       the use key (E)
//   itemName(id), jumpSound(jumpKind)    -> a name / sound id, or null
export class ClientFeature {
    constructor(game) {
        this.game = game;
    }

    get events() {
        return {};
    }

    get pickups() {
        return {};
    }
}
