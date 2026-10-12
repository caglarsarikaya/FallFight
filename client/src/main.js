import { OFFLINE_BOTS, resolveServerUrl } from './config.js';
import { Profile } from './storage/Profile.js';
import { SoundManager } from './audio/SoundManager.js';
import { LocalConnection } from './net/LocalConnection.js';
import { OnlineConnection } from './net/OnlineConnection.js';
import { MainMenu } from './ui/MainMenu.js';
import { Game } from './Game.js';

const container = document.getElementById('game');
const ui = document.getElementById('ui');
const profile = Profile.load();
const sound = new SoundManager(profile.volume);
const serverUrl = resolveServerUrl();
const online = serverUrl ? new OnlineConnection(serverUrl) : null;

let game = null;

const menu = new MainMenu(ui, {
    profile,
    sound,
    online,
    onPlay: mode => {
        menu.hide();
        const connection = mode === 'online' ? online : new LocalConnection({ botCount: OFFLINE_BOTS });
        if (mode !== 'online') online?.close();
        game = new Game({
            container,
            ui,
            connection,
            profile,
            sound,
            onEditProfile: () => {
                game.setEditingProfile(true);
                menu.show('edit');
            },
            onLeave: () => location.reload()
        });
        game.start();
    },
    // Esc menu -> "Change Character & Name" -> Save / Back
    onSave: () => {
        menu.hide();
        game.applyProfile();
        game.setEditingProfile(false);
    },
    onBack: () => {
        menu.hide();
        game.setEditingProfile(false);
    }
});

// Handy for debugging in the console
window.fallfight = { get game() { return game; }, profile };
