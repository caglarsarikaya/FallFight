import { isGun } from '../../../shared/config/weapons.js';
import { C2S } from '../../../shared/protocol.js';
import { FFA_ACTIONS } from '../../../shared/modes/ffa/config.js';
import { ClientMode } from '../ClientMode.js';

// Deathmatch: the buy menu is free, and Random Guns decides between a new loadout every life or
// keeping the guns picked there
export class FfaClient extends ClientMode {
    static id = 'ffa';
    static controls = ['B free guns · N ammo · M kevlar · H potions · G grenades'];

    get hasShop() {
        return true;
    }

    buyMenuOptions() {
        return { free: true };
    }

    onWelcome() {
        this.game.pauseMenu.setRandomGuns(this.game.profile.randomGuns);
        this.sendRandomGuns(this.game.profile.randomGuns);
    }

    // Picking a gun turns random guns off (the server did the same)
    onBuyResult(ok, item) {
        if (ok && isGun(item) && this.game.profile.randomGuns) this.setRandomGuns(false, true);
    }

    toggleRandomGuns() {
        this.setRandomGuns(!this.game.profile.randomGuns, true);
    }

    setRandomGuns(on, announce = false) {
        const game = this.game;
        game.profile.randomGuns = on;
        game.profile.save();
        game.pauseMenu.setRandomGuns(on);
        this.sendRandomGuns(on);
        if (announce) game.hud.toast(on ? 'Random guns ON: new guns every life' : 'Random guns OFF: you keep your guns');
    }

    sendRandomGuns(on) {
        this.game.connection.send(C2S.ACTION, { name: FFA_ACTIONS.RANDOM_GUNS, data: { on } });
    }

    panelView(state, self, players) {
        const view = super.panelView(state, self, players);
        view.sub = [view.sub, 'B: free guns'].filter(Boolean).join(' · ');
        return view;
    }

    killToastSuffix() {
        return ' · +1 Health Potion';
    }
}
