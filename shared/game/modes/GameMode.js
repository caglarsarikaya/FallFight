import { LOADOUT, PLAYER } from '../../constants.js';

// Rules of a game mode. GameRoom runs the simulation (movement, shooting, blocks, pickups) and asks
// its mode at every rule decision: what you spawn with and where, who can hurt whom, what a kill
// is worth, when you respawn, and when the match is over. Subclasses override the hooks they need.
export class GameMode {
    constructor(room) {
        this.room = room;
        this.dirty = true;      // state changed: broadcast MODE_STATE on the next tick
    }

    get id() {
        return 'ffa';
    }

    // Fill empty seats of the room with bots (the room's own bots-on/off choice still applies)
    get seatBots() {
        return true;
    }

    // Timed pickups that appear on the map
    get pickupTypes() {
        return ['ammo', 'health_potion'];
    }

    // A new match: called once at the start and after every match end
    reset() {
        this.dirty = true;
    }

    resetPlayer(player) {
        player.kills = 0;
        player.deaths = 0;
        player.score = 0;
    }

    onJoin(_player) {
        this.dirty = true;
    }

    onLeave(_player) {
        this.dirty = true;
    }

    // Spawn loadout: a random rifle/SMG/sniper and pistol, kevlar and helmet
    equip(player) {
        const rng = this.room.rng;
        const pick = list => list[Math.floor(rng() * list.length)];
        player.inventory.reset({
            weapons: [pick(LOADOUT.primary), pick(LOADOUT.secondary)],
            counts: { health_potion: LOADOUT.health_potion }
        });
        player.armor = LOADOUT.armor;
        player.helmet = LOADOUT.helmet;
    }

    // Tile rectangles to spawn in (see the map's spawns), or null for anywhere on the floor
    spawnZones(_player) {
        return null;
    }

    isEnemy(a, b) {
        return a !== b;
    }

    // May this player take pickups? (zombies don't)
    canPickUp(_player) {
        return true;
    }

    canDamage(attacker, victim) {
        return attacker === victim || this.isEnemy(attacker, victim);
    }

    // May this player shoot (and use items) right now?
    canFire(_player) {
        return !this.room.matchOver;
    }

    // Is this player held in place (e.g. freeze time)?
    frozen(_player) {
        return false;
    }

    // killer is null for suicides and unattributed falls
    onKill(victim, killer, _cause, _headshot) {
        if (killer) {
            killer.inventory.add('health_potion', 1); // kill reward
            this.room.notifyInventory(killer);
        }
        this.dirty = true;
    }

    // Seconds until the victim respawns, or null to wait for the mode (e.g. the next round)
    respawnDelay(_player) {
        return PLAYER.respawnDelay;
    }

    tick(_dt) {}

    // Broadcast to clients as MODE_STATE
    stateJSON() {
        return { mode: this.id };
    }

    // Mode-specific per-player fields added to snapshots (team, money, gun game level...)
    playerJSON(_player) {
        return null;
    }

    // Standings at match end: best first
    standings() {
        return [...this.room.players.values()]
            .sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths)
            .map(p => ({ id: p.id, name: p.name, score: p.score, kills: p.kills, deaths: p.deaths }));
    }
}
