import { CONNECT_TIMEOUT_MS, OFFLINE_BOTS, resolveServerUrl } from './config.js';
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

function startGame(connection) {
    menu.setWaiting(false);
    menu.hide();
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
    if (!connection.isOnline && online) game.hud.toast('Server unavailable: playing offline with bots');
}

function playOffline() {
    online?.close();
    startGame(new LocalConnection({ botCount: OFFLINE_BOTS }));
}

// One Play button: join an online room (filled with bots to 4) when the server is reachable,
// otherwise fall back to the same game against bots in the browser
function play() {
    if (!online) return playOffline();
    if (online.status === 'online') return startGame(online);
    menu.setWaiting(true);
    const timeout = setTimeout(playOffline, CONNECT_TIMEOUT_MS);
    online.onStatus(status => {
        if (status === 'online' && !game) {
            clearTimeout(timeout);
            startGame(online);
        }
    });
}

const menu = new MainMenu(ui, {
    profile,
    sound,
    online,
    onPlay: play,
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
