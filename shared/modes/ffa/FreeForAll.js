import { LOADOUT } from '../../constants.js';
import { WEAPON_SLOT, isGun } from '../../config/weapons.js';
import { buyItem } from '../../features/shop/Shop.js';
import { GameMode } from '../GameMode.js';
import { FFA_ACTIONS } from './config.js';

// Deathmatch: endless, everyone for themselves, a health potion for every kill. Score = kills.
// Every life gives a random rifle and pistol, unless the player turned Random Guns off: then they
// keep the guns they picked. B opens the buy menu any time, and everything in it is free.
export class FreeForAll extends GameMode {
    onJoin(player) {
        player.randomGuns ??= true;
        player.dmLoadout ??= null;     // [primary, pistol] for lives with Random Guns off
        player.dmSights ??= {};        // and the sights on them (gun id -> sight id)
        super.onJoin(player);
    }

    equip(player) {
        if (player.randomGuns !== false || !player.dmLoadout?.length) return super.equip(player);
        player.inventory.reset({ weapons: player.dmLoadout, counts: { health_potion: LOADOUT.health_potion }, sights: player.dmSights });
        player.armor = LOADOUT.armor;
        player.helmet = LOADOUT.helmet;
    }

    onKill(victim, killer, cause, headshot) {
        if (killer) killer.score = killer.kills;
        super.onKill(victim, killer, cause, headshot);
    }

    // ---- free buying ----------------------------------------------------------------------

    canBuy(player) {
        return player.alive && !this.room.matchOver;
    }

    // Returns { ok, error?, price }. Buying a gun means "I want this one": Random Guns turns off.
    buy(player, item) {
        if (!this.canBuy(player)) return { ok: false, error: 'not-now' };
        const result = buyItem(this.room, player, item, { free: true });
        if (result.ok && isGun(item)) {
            player.randomGuns = false;
            this.saveLoadout(player);
        } else if (result.ok && item.startsWith('sight_') && player.randomGuns === false) {
            this.saveLoadout(player);
        }
        return result;
    }

    onAction(player, name, data) {
        if (name === FFA_ACTIONS.RANDOM_GUNS) this.setRandomGuns(player, data.on !== false);
    }

    setRandomGuns(player, on) {
        player.randomGuns = on;
        if (!on && !player.dmLoadout?.length) this.saveLoadout(player);
    }

    // The guns carried now (and their sights) become the loadout for the next lives
    saveLoadout(player) {
        const { hotbar, sights } = player.inventory;
        player.dmLoadout = [hotbar[WEAPON_SLOT.PRIMARY], hotbar[WEAPON_SLOT.SECONDARY]].filter(isGun);
        player.dmSights = Object.fromEntries(player.dmLoadout.filter(id => sights[id]).map(id => [id, sights[id]]));
    }
}
