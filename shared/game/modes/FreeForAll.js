import { GameMode } from './GameMode.js';

// Deathmatch: endless, everyone for themselves, a random rifle and pistol every life,
// a health potion for every kill. Score = kills.
export class FreeForAll extends GameMode {
    get id() {
        return 'ffa';
    }

    onKill(victim, killer, cause, headshot) {
        if (killer) killer.score = killer.kills;
        super.onKill(victim, killer, cause, headshot);
    }
}
