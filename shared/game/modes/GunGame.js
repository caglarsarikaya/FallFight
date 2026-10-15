import { GUN_GAME } from '../../config/modes.js';
import { S2C } from '../../protocol.js';
import { weaponSpec } from '../../config/weapons.js';
import { GameMode } from './GameMode.js';

// Gun Game (arms race): everyone starts with the first gun of the ladder; every killsPerLevel kills
// hands you the next one at once. Finish the ladder to win. A knife kill also takes a kill of
// progress away from the victim. No potions: it's all about the guns.
export class GunGame extends GameMode {
    get id() {
        return 'gungame';
    }

    get pickupTypes() {
        return ['ammo'];
    }

    get ladder() {
        return GUN_GAME.ladder;
    }

    get target() {
        return this.ladder.length * GUN_GAME.killsPerLevel;
    }

    resetPlayer(player) {
        super.resetPlayer(player);
        player.level = 0;
        player.levelKills = 0;
    }

    onJoin(player) {
        player.level ??= 0;
        player.levelKills ??= 0;
        super.onJoin(player);
    }

    equip(player) {
        player.inventory.reset({ weapons: [this.ladder[Math.min(player.level ?? 0, this.ladder.length - 1)]] });
        player.armor = 100;
        player.helmet = true;
    }

    progress(player) {
        return (player.level ?? 0) * GUN_GAME.killsPerLevel + (player.levelKills ?? 0);
    }

    onKill(victim, killer, cause, _headshot) {
        this.dirty = true;
        if (cause === 'knife' && killer) this.demote(victim);
        if (!killer || this.room.matchOver) return;
        killer.levelKills++;
        if (killer.levelKills >= GUN_GAME.killsPerLevel) {
            killer.level++;
            killer.levelKills = 0;
            if (killer.level >= this.ladder.length) {
                killer.score = this.target;
                this.room.endMatch({ winnerId: killer.id, title: `${killer.name} wins the Gun Game!` });
                return;
            }
            this.upgrade(killer);
        }
        killer.score = this.progress(killer);
    }

    // Knifed: lose a kill (and drop a level if there was none on this one)
    demote(player) {
        if (player.levelKills > 0) {
            player.levelKills--;
        } else if (player.level > 0) {
            player.level--;
            player.levelKills = GUN_GAME.killsPerLevel - 1;
        }
        player.score = this.progress(player);
    }

    // Swap to the next gun right away, mid-fight
    upgrade(player) {
        if (!player.alive) return;
        const id = this.ladder[player.level];
        player.inventory.reset({ weapons: [id] });
        player.gun.reload = null;
        player.gun.scoped = 0;
        player.gun.readyAt = this.room.time + (weaponSpec(id)?.deploy ?? 0.5);
        this.room.notifyInventory(player);
        this.room.emit(null, S2C.LEVEL_UP, { id: player.id, level: player.level, weapon: id });
    }

    stateJSON() {
        let leader = null;
        for (const p of this.room.players.values()) {
            if (!leader || this.progress(p) > this.progress(leader)) leader = p;
        }
        return {
            mode: this.id,
            ladder: this.ladder,
            killsPerLevel: GUN_GAME.killsPerLevel,
            leader: leader ? { id: leader.id, name: leader.name, level: leader.level, levelKills: leader.levelKills } : null
        };
    }

    playerJSON(player) {
        return { level: player.level ?? 0, levelKills: player.levelKills ?? 0 };
    }
}
