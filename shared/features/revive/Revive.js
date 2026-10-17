import { S2C } from '../../protocol.js';
import { Feature } from '../Feature.js';
import { REVIVE, REVIVE_ACTION, REVIVE_EVENTS } from './config.js';

// Revive: hold E over a fallen teammate for REVIVE.time seconds to bring them back where they
// fell, with what they carried. One helper per body. Teammates are people the mode doesn't call
// enemies; the mode may forbid reviving right now (GameMode.allowsRevive, e.g. between waves).
export class Revive extends Feature {
    static id = 'revive';

    reset() {
        this.stopAll();
        this.revives = new Map();    // reviver id -> { targetId, until }
    }

    get actions() {
        return { [REVIVE_ACTION]: (player, data) => this.request(player, data) };
    }

    // { id } starts, { id: null } stops
    request(player, { id } = {}) {
        if (id == null) return this.stop(player.id);
        const target = this.room.players.get(id);
        if (!this.canRevive(player, target) || this.revives.get(player.id)?.targetId === id) return;
        this.stop(player.id);
        for (const r of this.revives.values()) if (r.targetId === id) return;
        const until = this.room.time + REVIVE.time;
        this.revives.set(player.id, { targetId: id, until });
        this.room.emitEvent(null, REVIVE_EVENTS.REVIVE, { reviverId: player.id, targetId: id, until });
    }

    canRevive(player, target) {
        const room = this.room;
        if (!player?.alive || player.isNpc || !target || target.alive || target.isNpc || target === player) return false;
        if (room.mode.isEnemy(player, target) || !room.mode.allowsRevive()) return false;
        return Math.hypot(player.x - target.x, player.z - target.z) <= REVIVE.reach && Math.abs(player.y - target.y) <= REVIVE.reach;
    }

    stop(reviverId) {
        const r = this.revives?.get(reviverId);
        if (!r) return;
        this.revives.delete(reviverId);
        this.room.emitEvent(null, REVIVE_EVENTS.REVIVE, { reviverId, targetId: r.targetId, until: null });
    }

    stopAll() {
        for (const id of [...(this.revives?.keys() ?? [])]) this.stop(id);
    }

    // Helpers who walked off, died or lost the body stop; those who held on long enough revive
    tick() {
        const now = this.room.time;
        for (const [reviverId, r] of this.revives) {
            const player = this.room.players.get(reviverId);
            const target = this.room.players.get(r.targetId);
            if (!this.canRevive(player, target)) {
                this.stop(reviverId);
            } else if (now >= r.until) {
                this.stop(reviverId);
                this.reviveInPlace(target, REVIVE.health);
                this.room.emitEvent(null, REVIVE_EVENTS.REVIVED, { reviverId, targetId: target.id });
                this.room.mode.dirty = true;
            }
        }
    }

    // Back on their feet where they fell, with what they carried
    reviveInPlace(player, health) {
        const room = this.room;
        player.alive = true;
        player.health = Math.min(player.maxHealth, health);
        player.vx = player.vy = player.vz = 0;
        player.fallSpeed = 0;
        player.protectedUntil = room.time + room.ruleset.spawnProtection;
        player.lastDamage = null;
        room.lagComp.reset(player.id);
        room.emit(null, S2C.RESPAWN, { id: player.id, x: player.x, y: player.y, z: player.z, yaw: player.yaw, health: player.health, armor: player.armor });
        room.notifyInventory(player);
    }
}
