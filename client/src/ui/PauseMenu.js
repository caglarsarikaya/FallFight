import { el, choice } from './dom.js';
import { canLockKeys } from '../input/fullscreen.js';
import { renderControls } from './controls.js';

const ON_OFF = [['on', 'On'], ['off', 'Off']];
const onOff = on => (on ? 'on' : 'off');

// Esc menu, three pages: the main list (resume, options, help, character/name, leave), Options
// grouped into Audio & Mouse / Video / Gameplay (camera, sights, Deathmatch random guns), and
// Help with every key (ui/controls.js) for anyone who missed the hint at the start
export class PauseMenu {
    constructor(root, { profile, onResume, onEditProfile, onToggleCamera, onVolume, onSensitivity, onShowStats, onSights, onToggleRandom, onGraphics, onFullscreen, onLeave }) {
        this.graphicsChoice = choice([['high', 'High'], ['low', 'Low (fast)']], v => {
            this.graphicsChoice.set(v);
            onGraphics(v);
        });
        this.graphicsChoice.set(profile.graphics);
        this.fullscreenChoice = choice([['on', canLockKeys ? 'On (Ctrl+W safe)' : 'On'], ['off', 'Off']], v => {
            this.setFullscreen(v === 'on');
            onFullscreen(v === 'on');
        });
        this.setFullscreen(profile.fullscreen);
        this.statsChoice = choice(ON_OFF, v => {
            this.statsChoice.set(v);
            onShowStats(v === 'on');
        });
        this.statsChoice.set(onOff(profile.showStats));
        this.sightsChoice = choice(ON_OFF, v => {
            this.sightsChoice.set(v);
            onSights(v === 'on');
        });
        this.sightsChoice.set(onOff(profile.sights));
        this.cameraButton = el('button.btn.pause-toggle', { type: 'button', onclick: () => onToggleCamera() });
        // Deathmatch only (setRandomGuns): new guns every life, or keep the ones bought.
        // The server flips it and echoes back, so only ask when the pick differs
        this.randomGuns = null;
        this.randomChoice = choice(ON_OFF, v => {
            if ((v === 'on') !== this.randomGuns) onToggleRandom();
        });
        this.volume = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: profile.volume });
        this.volume.addEventListener('input', () => onVolume(Number(this.volume.value)));
        this.sensitivity = el('input', { type: 'range', min: 0.3, max: 2.5, step: 0.1, value: profile.sensitivity });
        this.sensitivity.addEventListener('input', () => onSensitivity(Number(this.sensitivity.value)));

        const row = (label, control) => el('div.menu-setting', {}, [el('span.menu-label', { text: label }), control]);
        const section = (title, rows) => el('div.pause-section', {}, [el('h3', { text: title }), ...rows]);
        this.randomRow = row('Random guns each life', this.randomChoice.node);
        this.randomRow.classList.add('hidden');

        this.title = el('h2', { text: 'GAME MENU' });
        this.pages = {
            main: el('div.pause-page.pause-main', {}, [
                this.title,
                el('button.btn.primary', { type: 'button', text: 'Back to Game', onclick: () => onResume() }),
                el('button.btn', { type: 'button', text: 'Options', onclick: () => this.showPage('options') }),
                el('button.btn', { type: 'button', text: 'Help & Controls', onclick: () => this.showPage('help') }),
                el('button.btn', { type: 'button', text: 'Change Character & Name', onclick: () => onEditProfile() }),
                el('button.btn.pause-leave', { type: 'button', text: 'Leave Game', onclick: () => onLeave() })
            ]),
            options: el('div.pause-page', {}, [
                el('h2', { text: 'OPTIONS' }),
                el('div.pause-options', {}, [
                    el('div.pause-column', {}, [
                        section('Audio & Mouse', [row('Sound volume', this.volume), row('Mouse sensitivity', this.sensitivity)]),
                        section('Video', [
                            row('Graphics', this.graphicsChoice.node),
                            row('Fullscreen', this.fullscreenChoice.node),
                            row('FPS & ping', this.statsChoice.node)
                        ])
                    ]),
                    el('div.pause-column', {}, [
                        section('Gameplay', [
                            row('Camera', this.cameraButton),
                            row('Sights (hold right click)', this.sightsChoice.node),
                            this.randomRow
                        ])
                    ])
                ]),
                el('button.btn.primary', { type: 'button', text: 'Back', onclick: () => this.showPage('main') })
            ]),
            help: el('div.pause-page.pause-help', {}, [
                el('h2', { text: 'HELP & CONTROLS' }),
                this.helpList = el('div'),
                el('button.btn.primary', { type: 'button', text: 'Back', onclick: () => this.showPage('main') })
            ])
        };
        this.root = el('div.overlay.dim.pause.hidden', {}, Object.values(this.pages));
        this.showPage('main');
        root.append(this.root);
    }

    // The keys for this room's mode and features (ui/controls.js)
    setHelp(groups) {
        this.helpList.replaceChildren(renderControls(groups));
    }

    showPage(id) {
        for (const [name, page] of Object.entries(this.pages)) page.classList.toggle('hidden', name !== id);
    }

    setTitle(text) {
        this.title.textContent = text;
    }

    setCameraLabel(label) {
        this.cameraButton.textContent = label;
    }

    // Turned on from outside too (the Play Fullscreen button at the start)
    setFullscreen(on) {
        this.fullscreenChoice.set(onOff(on));
    }

    // true / false, or null to hide the switch (not Deathmatch)
    setRandomGuns(on) {
        this.randomGuns = on;
        this.randomRow.classList.toggle('hidden', on === null);
        if (on !== null) this.randomChoice.set(onOff(on));
    }

    get visible() {
        return !this.root.classList.contains('hidden');
    }

    show() {
        this.showPage('main');
        this.root.classList.remove('hidden');
    }

    hide() {
        this.root.classList.add('hidden');
    }
}
