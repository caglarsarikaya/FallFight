import { getModeInfo } from '../../shared/modes/registry.js';
import { ClientFeature } from '../features/ClientFeature.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The client half of a game mode (the rules are in shared/modes/<id>/): its panel, scoreboard,
// buy menu rules, banners and death screen. Gets every ClientFeature hook too. The defaults are a
// plain free-for-all.
export class ClientMode extends ClientFeature {
    get id() {
        return this.constructor.id;
    }

    // ---- buying ----

    get hasShop() {
        return false;
    }

    // May we open the buy menu right now (we're alive)?
    canBuy() {
        return true;
    }

    // { free, randomGuns, defaultItem } for the buy menu
    buyMenuOptions() {
        return { free: false, randomGuns: null, defaultItem: null };
    }

    onBuyResult(_ok, _item) {}

    // Held in place (freeze time)
    get frozen() {
        return false;
    }

    // ---- people ----

    // Is this player on our side (spectating, revives)?
    isTeammate(_info) {
        return false;
    }

    // Counted on the scoreboard and in the room badge (people and bots, not monsters)
    listed(info) {
        return !info.isNpc;
    }

    // ---- screens ----

    get scoreLabel() {
        return 'KILLS';
    }

    // The scoreboard: { columns: [[header, value(player, modeState)]], sort, groups?(players, modeState) }
    scoreboard() {
        return {
            columns: [['K', p => p.kills], ['D', p => p.deaths]],
            sort: (a, b) => b.kills - a.kills || a.deaths - b.deaths
        };
    }

    // The strip at the top of the screen: { title, main, mainNodes?, sub, className? }
    panelView(state, self, players) {
        let leader = null;
        for (const p of players.values()) if (this.listed(p) && (!leader || p.kills > leader.kills)) leader = p;
        return {
            title: getModeInfo(state.mode)?.name.toUpperCase() || 'DEATHMATCH',
            main: plural(self?.kills ?? 0, 'kill'),
            sub: leader && leader !== self ? `Leader: ${leader.name} (${leader.kills})` : leader ? 'You are in the lead' : ''
        };
    }

    // After we die: { waiting: true } to wait for the mode (watching teammates) instead of the
    // respawn timer, text: what the death screen says while waiting
    respawnWait() {
        return { waiting: false, text: null };
    }

    // Added to "You killed X"
    killToastSuffix() {
        return '';
    }
}
