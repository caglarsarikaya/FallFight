import { CHARACTERS } from '../../shared/characters/definitions.js';
import { CharacterPreview } from './CharacterPreview.js';
import { el } from './dom.js';

const CONTROLS = [
    ['WASD', 'Move'], ['Space', 'Jump'], ['Mouse', 'Look'], ['Left click', 'Use item (hold to draw the bow)'],
    ['1 / 2 / 3', 'Bow / Axe / Health potion'], ['Wheel', 'Switch item'], ['V', 'First / third person'],
    ['Tab', 'Scoreboard'], ['Esc', 'Menu: change character or name']
];

// Nickname + character select. Used at start ('start' mode) and from the pause menu ('edit' mode).
export class MainMenu {
    constructor(root, { profile, sound, online = null, onPlay = () => {}, onSave = () => {}, onBack = () => {} }) {
        this.profile = profile;
        this.sound = sound;
        this.online = online;
        this.callbacks = { onPlay, onSave, onBack };
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

        this.offlineButton = el('button.btn.primary', { type: 'button', text: 'Play vs Bots', onclick: () => this.play('offline') });
        this.onlineButton = el('button.btn', { type: 'button', text: 'Play Online', onclick: () => this.play('online') });
        this.status = el('div.server-status');
        this.saveButton = el('button.btn.primary', { type: 'button', text: 'Save', onclick: () => this.save() });
        this.backButton = el('button.btn', { type: 'button', text: 'Back', onclick: () => this.callbacks.onBack() });
        this.startButtons = el('div.play-buttons', {}, [el('div.row', {}, [this.offlineButton, this.onlineButton]), this.status]);
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
            this.onlineButton.disabled = true;
            this.status.textContent = 'Online play: no server configured yet. Bots are ready!';
            return;
        }
        this.online.onStatus(status => {
            const ready = status === 'online';
            this.onlineButton.disabled = !ready;
            this.status.classList.toggle('online', ready);
            this.status.textContent = ready ? '● Server online' : 'Connecting to server... (free servers can take ~1 min to wake up)';
        });
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

    play(mode) {
        this.sound.unlock();
        this.sound.play('click');
        this.applyToProfile();
        this.callbacks.onPlay(mode);
    }

    save() {
        this.sound.play('click');
        this.applyToProfile();
        this.callbacks.onSave();
    }

    submitDefault() {
        if (this.mode === 'edit') this.save();
        else this.play(this.online && !this.onlineButton.disabled ? 'online' : 'offline');
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
