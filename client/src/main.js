import { CONNECT_TIMEOUT_MS, OFFLINE_BOTS, resolveServerUrl } from './config.js';
import { Profile } from './storage/Profile.js';
import { SoundManager } from './audio/SoundManager.js';
import { LocalConnection } from './net/LocalConnection.js';
import { OnlineConnection } from './net/OnlineConnection.js';
import { MainMenu } from './ui/MainMenu.js';
import { Game } from './Game.js';
import { C2S } from '../shared/protocol.js';
import { getModeInfo } from '../shared/modes/registry.js';

const container = document.getElementById('game');
const ui = document.getElementById('ui');
const profile = Profile.load();
const sound = new SoundManager(profile.volume);
const serverUrl = resolveServerUrl();
const online = serverUrl ? new OnlineConnection(serverUrl) : null;

let game = null;

// request: {} for quick play, or { roomId, password } for a specific room
function startGame(connection, request = {}, notice = null) {
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
    game.start(request);
    if (notice) game.hud.toast(notice);
}

function playOffline(notice = online ? 'Server unavailable: playing offline with bots' : null) {
    online?.close();
    // The menu's map, if it is one of this mode's maps
    const map = getModeInfo(profile.mode)?.maps.includes(profile.roomMap) ? profile.roomMap : undefined;
    startGame(new LocalConnection({ botCount: OFFLINE_BOTS, mode: profile.mode, map }), {}, notice);
}

// Quick Play: join the fullest public room of the chosen mode (bots fill the empty seats). If the
// server can't be reached, or it's full, play the same game against bots in the browser.
async function quickPlay() {
    const mode = profile.mode;
    const check = await online.request(C2S.CHECK_ROOM, { mode });
    if (game) return;
    if (check.error === 'server-full') playOffline('Server is full: playing offline with bots');
    else startGame(online, { mode });
}

function play({ offline = false } = {}) {
    if (!online || offline) return playOffline(null);
    if (online.status === 'online') return quickPlay();
    menu.setWaiting(true);
    const timeout = setTimeout(() => !game && playOffline(), CONNECT_TIMEOUT_MS);
    online.onStatus(status => {
        if (status === 'online' && !game) {
            clearTimeout(timeout);
            quickPlay();
        }
    });
}

// Join a room from the list; resolves to { error } so the menu can show what went wrong
async function joinRoom(roomId, password) {
    if (game) return {};
    const check = await online.request(C2S.CHECK_ROOM, { roomId, password });
    if (check.error) return check;
    startGame(online, { roomId, password });
    return {};
}

async function createRoom(options) {
    if (game) return {};
    const created = await online.request(C2S.CREATE_ROOM, options);
    if (created.error) return created;
    startGame(online, { roomId: created.roomId, password: options.password });
    return {};
}

const menu = new MainMenu(ui, {
    profile,
    sound,
    online,
    onPlay: play,
    onJoinRoom: joinRoom,
    onCreateRoom: createRoom,
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
