import { CHARACTERS } from '../../shared/characters/definitions.js';
import { S2C } from '../../shared/protocol.js';
import { CharacterPreview } from './CharacterPreview.js';
import { RoomBrowser } from './RoomBrowser.js';
import { el } from './dom.js';

const CONTROLS = [
    ['WASD', 'Move'], ['Shift', 'Walk (silent, accurate)'], ['C', 'Crouch'], ['Space', 'Jump'],
    ['Left click', 'Fire / slash'], ['Right click', 'Scope / knife stab'], ['R', 'Reload'],
    ['1 / 2 / 3 / 4', 'Rifle / Pistol / Knife / Potion'], ['Q, wheel', 'Switch weapon'], ['V', 'First / third person'],
    ['Tab', 'Scoreboard'], ['Esc', 'Menu: change character or name']
];

// Nickname + character select. Used at start ('start' mode) and from the pause menu ('edit' mode).
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

        this.nameInput = el('input', { type: 'text', maxlength: 16, placeholder: 'Your nickname', value: profile.name });
        this.nameInput.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Enter') this.submitDefault();
        });
        this.cards = CHARACTERS.map(c => {
            const card = el('button.character-card', { type: 'button', onclick: () => this.select(c.id) }, [
                el('span.name', { text: c.name }),
                el('span.desc', { text: c.tagline })
            ]);
            card.dataset.id = c.id;
            return card;
        });

        this.previewName = el('div.preview-name');
        const previewBox = el('div.panel.preview', {}, this.previewName);

        this.playButton = el('button.btn.primary', { type: 'button', text: 'Quick Play', onclick: () => this.play() });
        this.status = el('div.server-status');
        this.saveButton = el('button.btn.primary', { type: 'button', text: 'Save', onclick: () => this.save() });
        this.backButton = el('button.btn', { type: 'button', text: 'Back', onclick: () => this.callbacks.onBack() });
        this.startButtons = el('div.play-buttons', {}, [el('div.row', {}, [this.playButton]), this.status, this.rooms.root]);
        this.editButtons = el('div.play-buttons.hidden', {}, el('div.row', {}, [this.saveButton, this.backButton]));

        this.title = el('h1.logo', {}, ['FALL', el('span', { text: 'FIGHT' })]);
        this.subtitle = el('div.tagline', { text: 'Chop the floor. Shoot your friends. Don\'t fall.' });
        this.help = el('div.controls-help', {}, CONTROLS.flatMap(([k, v]) => [el('b', { text: k }), el('span', { text: v })]));

        this.root = el('div.overlay.menu', {}, el('div.menu-inner', {}, [
            this.title,
            this.subtitle,
            el('div.menu-body', {}, [
                previewBox,
                el('div.panel.form', {}, [
                    el('label.label', { text: 'NICKNAME' }),
                    this.nameInput,
                    el('div.label', { text: 'CHOOSE YOUR FIGHTER' }),
                    el('div.characters', {}, this.cards),
                    this.startButtons,
                    this.editButtons
                ])
            ]),
            el('div.panel', {}, this.help)
        ]));
        root.append(this.root);

        this.preview = new CharacterPreview(previewBox);
        this.select(this.selected, false);
        this.watchServer();
        this.show('start');
    }

    watchServer() {
        if (!this.online) {
            this.status.textContent = 'No game server configured: you\'ll play against bots.';
            this.rooms.setEnabled(false);
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
            : serverFull ? 'server is full, join a room below'
                : 'Quick Play starts a new room with bots';
        const playing = stats.players === 0 ? 'nobody is playing right now' : `${stats.players} playing now`;
        return `● Online · ${playing} · ${quick}`;
    }

    // While Play waits for the server to wake up
    setWaiting(waiting) {
        this.playButton.disabled = waiting;
        this.playButton.textContent = waiting ? 'Connecting...' : 'Quick Play';
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

    applyToProfile() {
        const typed = this.nameInput.value.trim();
        this.profile.setName(typed || this.profile.name || `Player${100 + Math.floor(Math.random() * 900)}`);
        this.nameInput.value = this.profile.name;
        this.profile.characterId = this.selected;
        this.profile.save();
    }

    play() {
        if (this.playButton.disabled) return;
        this.sound.unlock();
        this.sound.play('click');
        this.applyToProfile();
        this.callbacks.onPlay();
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
        this.nameInput.value = this.profile.name;
        this.select(this.profile.characterId, false);
        this.root.classList.toggle('in-game', mode === 'edit');
        this.startButtons.classList.toggle('hidden', mode === 'edit');
        this.editButtons.classList.toggle('hidden', mode !== 'edit');
        this.help.parentElement.classList.toggle('hidden', mode === 'edit');
        this.root.parentElement.append(this.root); // above any in-game UI
        this.root.classList.remove('hidden');
        this.preview.start();
        if (mode === 'start' && !this.profile.hasName) setTimeout(() => this.nameInput.focus(), 50);
    }

    hide() {
        this.root.classList.add('hidden');
        this.preview.stop();
    }
}
