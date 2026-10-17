import { S2C } from '../../protocol.js';
import { registerItem } from '../../items/ItemRegistry.js';
import { Feature } from '../Feature.js';
import { GOD_MODE } from './config.js';
import { GodMode } from './GodMode.js';

registerItem(new GodMode());

// The angel: a 'godmode' pickup (the mode decides where they come from) that goes into slot 8,
// one carried at a time. Under an angel nothing hurts: claws, guns, falls, your own grenades.
// Carried unused, it saves you by itself from a hit that would kill you.
export class Angel extends Feature {
    static id = 'angel';

    resetPlayer(player) {
        player.godUntil = 0;
    }

    onDeath(player) {
        player.godUntil = 0;
    }

    isBlessed(player) {
        return player.godUntil > this.room.time;
    }

    shielded(player) {
        return this.isBlessed(player);
    }

    // A deadly hit on someone carrying an angel: it comes out on its own and the hit never lands
    saveFromDeath(player) {
        if (!player.alive || !player.inventory.consume('godmode')) return false;
        player.godUntil = this.room.time + GOD_MODE.duration;
        this.room.notifyInventory(player);
        this.room.emit(null, S2C.ACTION, { id: player.id, action: 'angel', item: 'godmode', auto: true });
        this.room.mode.dirty = true;
        return true;
    }

    playerJSON(player) {
        const godLeft = this.isBlessed(player) ? Math.round((player.godUntil - this.room.time) * 10) / 10 : 0;
        return { godLeft };
    }

    get pickups() {
        return {
            godmode: {
                canTake: player => player.inventory.count('godmode') === 0,
                apply: player => player.inventory.add('godmode', 1)
            }
        };
    }
}
