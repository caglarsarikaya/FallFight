import { CHARACTERS } from '../../shared/characters/definitions.js';
import { MODES, getModeInfo } from '../../shared/config/modes.js';
import { isPlayableMode } from '../../shared/game/modes/index.js';
import { getMap } from '../../shared/world/maps/index.js';
import { S2C } from '../../shared/protocol.js';
import { drawDirt, textureDataUrl } from '../world/textures.js';
import { CharacterPreview } from './CharacterPreview.js';
import { RoomBrowser } from './RoomBrowser.js';
import { el } from './dom.js';

const CONTROLS = [
    ['WASD', 'Move'], ['Shift', 'Walk (silent, accurate)'], ['C', 'Crouch'], ['Space', 'Jump'],
    ['Left click', 'Fire / slash'], ['Right click', 'Scope / knife stab'], ['R', 'Reload'],
    ['1 / 2 / 3 / 4', 'Rifle / Pistol / Knife / Potion'], ['Q, wheel', 'Switch weapon'], ['B', 'Buy menu (Team Buy)'],
    ['V', 'First / third person'],
    ['Tab', 'Scoreboard'], ['Esc', 'Menu: change character or name']
];

const TABS = [['player', 'Player'], ['game', 'Game'], ['options', 'Options']];

// A row of buttons where exactly one is on: [[value, label]]
function choice(options, onPick) {
    const buttons = options.map(([value, label]) => {
        const button = el('button.btn.menu-choice', { type: 'button', text: label, onclick: () => onPick(value) });
        button.dataset.value = value;
        return button;
    });
    return {
        node: el('div.menu-choices', {}, buttons),
        set: value => buttons.forEach(b => b.classList.toggle('selected', b.dataset.value === value))
    };
}

// The start screen, in the style of a CS 1.6 dialog: Player (name, character), Game (mode, map,
// online/offline, rooms) and Options tabs, with Play always at the bottom.
// 'start' mode at launch; 'edit' mode from the pause menu shows only the Player tab with Save / Back.
export class MainMenu {
    constructor(root, { profile, sound, online = null, onPlay = () => {}, onJoinRoom, onCreateRoom, onSave = () => {}, onBack = () => {} }) {
        this.profile = profile;
        this.sound = sound;
        this.online = online;
        this.callbacks = { onPlay, onSave, onBack };
        this.rooms = new RoomBrowser({
            profile,
            sound,
            onJoin: (roomId, password) => {
                this.applyToProfile();
                return onJoinRoom(roomId, password);
            },
            onCreate: options => {
                this.applyToProfile();
                return onCreateRoom(options);
            }
        });
        this.mode = 'start';
        this.selected = profile.characterId;

        this.panels = { player: this.buildPlayerTab(), game: this.buildGameTab(), options: this.buildOptionsTab() };
        this.tabButtons = TABS.map(([id, label]) => {
            const button = el('button.btn.menu-tab', { type: 'button', text: label, onclick: () => this.showTab(id) });
            button.dataset.id = id;
            return button;
        });
        this.tabStrip = el('div.menu-tabs', {}, this.tabButtons);

        this.status = el('div.server-status');
        this.playButton = el('button.btn.primary.play', { type: 'button', text: 'Play', onclick: () => this.play() });
        this.saveButton = el('button.btn.primary.play', { type: 'button', text: 'Save', onclick: () => this.save() });
        this.backButton = el('button.btn', { type: 'button', text: 'Back', onclick: () => this.callbacks.onBack() });
        this.startButtons = el('div.menu-actions', {}, this.playButton);
        this.editButtons = el('div.menu-actions.hidden', {}, [this.backButton, this.saveButton]);

        this.root = el('div.overlay.menu', {}, el('div.menu-window', {}, [
            el('div.menu-titlebar', {}, [
                el('h1.logo', {}, ['FALL', el('span', { text: 'FIGHT' })]),
                el('div.tagline', { text: 'Chop the floor. Shoot your friends. Don\'t fall.' })
            ]),
            this.tabStrip,
            el('div.menu-body', {}, Object.values(this.panels)),
            el('div.menu-footer', {}, [this.status, this.startButtons, this.editButtons])
        ]));
        this.root.style.setProperty('--dirt', `url(${textureDataUrl(drawDirt)})`); // the game's own dirt block
        root.append(this.root);

        this.preview = new CharacterPreview(this.previewBox);
        this.select(this.selected, false);
        this.selectMode(isPlayableMode(profile.mode) ? profile.mode : MODES[0].id, false);
        this.setWhere(profile.playWhere, false);
        this.showTab(TABS.some(([id]) => id === profile.menuTab) ? profile.menuTab : 'player', false);
        this.watchServer();
        this.show('start');
    }

    buildPlayerTab() {
        this.nameInput = el('input', { type: 'text', maxlength: 16, placeholder: 'Your nickname', value: this.profile.name });
        this.nameInput.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Enter') this.submitDefault();
        });
        this.cards = CHARACTERS.map(c => {
            const card = el('button.menu-row', { type: 'button', onclick: () => this.select(c.id) }, [
                el('span.name', { text: c.name }),
                el('span.desc', { text: c.tagline })
            ]);
            card.dataset.id = c.id;
            return card;
        });
        this.previewName = el('div.preview-name');
        this.previewBox = el('div.menu-inset.preview', {}, this.previewName);
        return el('div.menu-panel.player-tab', {}, [
            this.previewBox,
            el('div.menu-column', {}, [
                el('label.menu-label', { text: 'Nickname' }),
                this.nameInput,
                el('div.menu-label', { text: 'Character' }),
                el('div.menu-inset.menu-list', {}, this.cards)
            ])
        ]);
    }

    buildGameTab() {
        this.modeButtons = MODES.map(mode => {
            const playable = isPlayableMode(mode.id);
            const button = el('button.menu-row', { type: 'button', disabled: !playable, onclick: () => this.selectMode(mode.id) }, [
                el('span.name', { text: mode.name }), playable ? null : el('span.desc', { text: 'coming soon' })
            ]);
            button.dataset.id = mode.id;
            return button;
        });
        this.modeDescription = el('div.mode-description');
        this.mapSelect = el('select.menu-select');
        this.mapSelect.addEventListener('change', () => {
            this.profile.roomMap = this.mapSelect.value;
            this.profile.save();
            this.rooms.setMode(this.profile.mode);
        });
        this.mapNote = el('div.menu-note');
        this.where = choice([['online', 'Quick Play (online)'], ['offline', 'Offline vs bots']], value => this.setWhere(value));
        return el('div.menu-panel.game-tab', {}, [
            el('div.menu-column', {}, [
                el('div.menu-label', { text: 'Game mode' }),
                el('div.menu-inset.menu-list', {}, this.modeButtons),
                this.modeDescription,
                el('div.menu-label', { text: 'Play' }),
                this.where.node,
                el('div.menu-label', { text: 'Map' }),
                this.mapSelect,
                this.mapNote
            ]),
            el('div.menu-column', {}, [
                el('div.menu-label', { text: 'Servers' }),
                this.rooms.root
            ])
        ]);
    }

    buildOptionsTab() {
        const slider = (min, max, step, key, apply = () => {}) => {
            const input = el('input', { type: 'range', min, max, step, value: this.profile[key] });
            input.addEventListener('input', () => {
                this.profile[key] = Number(input.value);
                apply(this.profile[key]);
                this.profile.save();
            });
            return input;
        };
        const setting = (key, options) => choice(options, value => {
            this.profile[key] = value === 'on' ? true : value === 'off' ? false : value;
            this.profile.save();
            this.refreshOptions();
            this.sound.play('click');
        });
        this.volumeInput = slider(0, 1, 0.05, 'volume', v => this.sound.setVolume(v));
        this.sensitivityInput = slider(0.3, 2.5, 0.1, 'sensitivity');
        this.graphicsChoice = setting('graphics', [['high', 'High'], ['low', 'Low (fast)']]);
        this.cameraChoice = setting('cameraMode', [['first', 'First person'], ['third', 'Third person']]);
        this.statsChoice = setting('showStats', [['on', 'On'], ['off', 'Off']]);
        this.refreshOptions();

        const row = (label, control) => el('div.menu-setting', {}, [el('span.menu-label', { text: label }), control]);
        return el('div.menu-panel.options-tab', {}, [
            el('div.menu-column', {}, [
                row('Sound volume', this.volumeInput),
                row('Mouse sensitivity', this.sensitivityInput),
                row('Graphics', this.graphicsChoice.node),
                row('Camera', this.cameraChoice.node),
                row('FPS & ping', this.statsChoice.node)
            ]),
            el('div.menu-column', {}, [
                el('div.menu-label', { text: 'Controls' }),
                el('div.menu-inset.controls-help', {}, CONTROLS.flatMap(([k, v]) => [el('b', { text: k }), el('span', { text: v })]))
            ])
        ]);
    }

    // Settings can also change in the pause menu, so redraw from the profile
    refreshOptions() {
        this.volumeInput.value = this.profile.volume;
        this.sensitivityInput.value = this.profile.sensitivity;
        this.graphicsChoice.set(this.profile.graphics);
        this.cameraChoice.set(this.profile.cameraMode);
        this.statsChoice.set(this.profile.showStats ? 'on' : 'off');
    }

    showTab(id, withSound = true) {
        this.tab = id;
        this.tabButtons.forEach(b => b.classList.toggle('active', b.dataset.id === id));
        for (const [key, panel] of Object.entries(this.panels)) panel.classList.toggle('hidden', key !== id);
        this.updatePreview();
        if (withSound) {
            this.sound.unlock();
            this.sound.play('click');
        }
        if (this.mode === 'edit') return;
        this.profile.menuTab = id;
        this.profile.save();
    }

    watchServer() {
        if (!this.online) {
            this.status.textContent = 'No game server configured: you\'ll play against bots.';
            this.rooms.setEnabled(false);
            this.setWhere('offline', false);
            this.where.node.classList.add('hidden');
            return;
        }
        this.serverStats = null;
        const render = () => {
            const ready = this.online.status === 'online';
            this.status.classList.toggle('online', ready);
            this.status.textContent = ready
                ? MainMenu.describeServer(this.serverStats)
                : 'Waking up the game server... (free servers can take up to a minute)';
            this.rooms.setEnabled(ready, 'Rooms need the online server (waking up...)');
            if (ready && this.serverStats) this.rooms.render(this.serverStats.rooms);
        };
        this.online.onStatus(render);
        this.online.on(S2C.SERVER_STATS, stats => {
            this.serverStats = stats;
            render();
        });
    }

    // e.g. "● Online · 3 playing now · Quick Play joins 2 players (+ bots)"
    static describeServer(stats) {
        if (!stats) return '● Server online';
        const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
        // Quick Play joins the fullest quick room that still has a free seat
        const open = stats.rooms
            .filter(r => r.kind === 'quick' && r.players < r.maxPlayers)
            .sort((a, b) => b.players - a.players)[0];
        const serverFull = stats.rooms.length >= (stats.limits?.maxRooms ?? Infinity);
        const quick = open ? `Quick Play joins ${plural(open.players, 'player')} (+ bots)`
            : serverFull ? 'server is full, join a room'
                : 'Quick Play starts a new room with bots';
        const playing = stats.players === 0 ? 'nobody is playing right now' : `${stats.players} playing now`;
        return `● Online · ${playing} · ${quick}`;
    }

    // While Play waits for the server to wake up
    setWaiting(waiting) {
        this.playButton.disabled = waiting;
        this.playButton.textContent = waiting ? 'Connecting...' : 'Play';
    }

    select(characterId, withSound = true) {
        this.selected = characterId;
        this.cards.forEach(card => card.classList.toggle('selected', card.dataset.id === characterId));
        this.previewName.textContent = CHARACTERS.find(c => c.id === characterId)?.name || '';
        this.preview.setCharacter(characterId);
        if (withSound) {
            this.sound.unlock();
            this.sound.play('click');
        }
    }

    selectMode(modeId, withSound = true) {
        this.profile.mode = modeId;
        this.profile.save();
        this.modeButtons.forEach(b => b.classList.toggle('selected', b.dataset.id === modeId));
        this.modeDescription.textContent = getModeInfo(modeId)?.description || '';
        const maps = (getModeInfo(modeId)?.maps || []).map(getMap).filter(Boolean);
        this.mapSelect.replaceChildren(...maps.map(map => el('option', { value: map.id, text: map.name })));
        if (maps.some(m => m.id === this.profile.roomMap)) this.mapSelect.value = this.profile.roomMap;
        this.rooms.setMode(modeId);
        if (withSound) {
            this.sound.unlock();
            this.sound.play('click');
        }
    }

    // 'online' (Quick Play) or 'offline' (bots in the browser)
    setWhere(where, withSound = true) {
        this.playWhere = where === 'offline' || !this.online ? 'offline' : 'online';
        this.where.set(this.playWhere);
        this.mapNote.textContent = this.playWhere === 'online'
            ? 'Quick Play: the server picks the map. The map is used for offline games and new rooms.'
            : '';
        if (!withSound) return;
        this.profile.playWhere = this.playWhere;
        this.profile.save();
        this.sound.unlock();
        this.sound.play('click');
    }

    applyToProfile() {
        const typed = this.nameInput.value.trim();
        this.profile.setName(typed || this.profile.name || `Player${100 + Math.floor(Math.random() * 900)}`);
        this.nameInput.value = this.profile.name;
        this.profile.characterId = this.selected;
        this.profile.roomMap = this.mapSelect.value || this.profile.roomMap;
        this.profile.save();
    }

    play() {
        if (this.playButton.disabled) return;
        this.sound.unlock();
        this.sound.play('click');
        this.applyToProfile();
        this.callbacks.onPlay({ offline: this.playWhere === 'offline' });
    }

    save() {
        this.sound.play('click');
        this.applyToProfile();
        this.callbacks.onSave();
    }

    submitDefault() {
        if (this.mode === 'edit') this.save();
        else this.play();
    }

    show(mode) {
        this.mode = mode;
        const editing = mode === 'edit';
        this.nameInput.value = this.profile.name;
        this.select(this.profile.characterId, false);
        this.refreshOptions();
        this.root.classList.toggle('in-game', editing);
        this.tabStrip.classList.toggle('hidden', editing);
        this.status.classList.toggle('hidden', editing);
        this.startButtons.classList.toggle('hidden', editing);
        this.editButtons.classList.toggle('hidden', !editing);
        if (editing) this.showTab('player', false);
        this.root.parentElement.append(this.root); // above any in-game UI
        this.root.classList.remove('hidden');
        this.updatePreview();
        if (mode === 'start' && !this.profile.hasName) setTimeout(() => this.nameInput.focus(), 50);
    }

    // The 3D preview only renders while it can be seen
    updatePreview() {
        if (this.tab === 'player' && !this.root.classList.contains('hidden')) this.preview.start();
        else this.preview.stop();
    }

    hide() {
        this.root.classList.add('hidden');
        this.preview.stop();
    }
}
