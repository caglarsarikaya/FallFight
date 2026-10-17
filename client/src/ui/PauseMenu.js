import { el } from './dom.js';
import { canLockKeys } from '../input/fullscreen.js';
import { renderControls } from './controls.js';

// Esc menu: resume, change character/name, camera, volume, sensitivity, graphics, fullscreen,
// stats overlay, sights (hold right click to aim), Deathmatch random guns, leave; and a Help page
// with every key (ui/controls.js) for anyone who missed the hint at the start
export class PauseMenu {
    constructor(root, { profile, onResume, onEditProfile, onToggleCamera, onVolume, onSensitivity, onShowStats, onSights, onToggleRandom, onGraphics, onFullscreen, onLeave }) {
        this.graphics = profile.graphics;
        this.graphicsButton = el('button.btn', {
            type: 'button',
            onclick: () => {
                this.graphics = this.graphics === 'low' ? 'high' : 'low';
                this.updateGraphicsLabel();
                onGraphics(this.graphics);
            }
        });
        this.updateGraphicsLabel();
        this.fullscreen = profile.fullscreen;
        this.fullscreenButton = el('button.btn', {
            type: 'button',
            onclick: () => {
                this.fullscreen = !this.fullscreen;
                this.updateFullscreenLabel();
                onFullscreen(this.fullscreen);
            }
        });
        this.updateFullscreenLabel();
        this.cameraButton = el('button.btn', { type: 'button', onclick: () => onToggleCamera() });
        this.showStats = profile.showStats;
        this.statsButton = el('button.btn', {
            type: 'button',
            onclick: () => {
                this.showStats = !this.showStats;
                this.updateStatsLabel();
                onShowStats(this.showStats);
            }
        });
        this.updateStatsLabel();
        this.sights = profile.sights;
        this.sightsButton = el('button.btn', {
            type: 'button',
            onclick: () => {
                this.sights = !this.sights;
                this.updateSightsLabel();
                onSights(this.sights);
            }
        });
        this.updateSightsLabel();
        // Deathmatch only (setRandomGuns): new guns every life, or keep the ones bought
        this.randomGuns = null;
        this.randomButton = el('button.btn.hidden', { type: 'button', onclick: () => onToggleRandom() });
        this.volume = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: profile.volume });
        this.volume.addEventListener('input', () => onVolume(Number(this.volume.value)));
        this.sensitivity = el('input', { type: 'range', min: 0.3, max: 2.5, step: 0.1, value: profile.sensitivity });
        this.sensitivity.addEventListener('input', () => onSensitivity(Number(this.sensitivity.value)));

        this.title = el('h2', { text: 'GAME MENU' });
        this.main = el('div.pause-page', {}, [
            this.title,
            el('button.btn.primary', { type: 'button', text: 'Back to Game', onclick: () => onResume() }),
            el('button.btn', { type: 'button', text: 'Help & Controls', onclick: () => this.showHelp(true) }),
            el('button.btn', { type: 'button', text: 'Change Character & Name', onclick: () => onEditProfile() }),
            this.cameraButton,
            el('div.setting', {}, [el('span.label', { text: 'SOUND' }), this.volume]),
            el('div.setting', {}, [el('span.label', { text: 'MOUSE SENSITIVITY' }), this.sensitivity]),
            this.graphicsButton,
            this.fullscreenButton,
            this.statsButton,
            this.sightsButton,
            this.randomButton,
            el('button.btn', { type: 'button', text: 'Leave Game', onclick: () => onLeave() })
        ]);
        this.helpList = el('div');
        this.help = el('div.pause-page.pause-help.hidden', {}, [
            el('h2', { text: 'HELP & CONTROLS' }),
            this.helpList,
            el('button.btn.primary', { type: 'button', text: 'Back', onclick: () => this.showHelp(false) })
        ]);
        this.root = el('div.overlay.dim.pause.hidden', {}, [this.main, this.help]);
        root.append(this.root);
    }

    // The keys for this room's mode and features (ui/controls.js)
    setHelp(groups) {
        this.helpList.replaceChildren(renderControls(groups));
    }

    showHelp(on) {
        this.help.classList.toggle('hidden', !on);
        this.main.classList.toggle('hidden', on);
    }

    setTitle(text) {
        this.title.textContent = text;
    }

    setCameraLabel(label) {
        this.cameraButton.textContent = `Camera: ${label}`;
    }

    updateGraphicsLabel() {
        this.graphicsButton.textContent = `Graphics: ${this.graphics === 'low' ? 'LOW (fast)' : 'HIGH'}`;
    }

    // Turned on from outside (the Play Fullscreen button at the start)
    setFullscreen(on) {
        this.fullscreen = on;
        this.updateFullscreenLabel();
    }

    updateFullscreenLabel() {
        this.fullscreenButton.textContent = `Fullscreen: ${this.fullscreen ? (canLockKeys ? 'ON (Ctrl+W safe)' : 'ON') : 'OFF'}`;
    }

    updateStatsLabel() {
        this.statsButton.textContent = `FPS & Ping: ${this.showStats ? 'ON' : 'OFF'}`;
    }

    updateSightsLabel() {
        this.sightsButton.textContent = `Sights (hold right click): ${this.sights ? 'ON' : 'OFF'}`;
    }

    // true / false, or null to hide the switch (not Deathmatch)
    setRandomGuns(on) {
        this.randomGuns = on;
        this.randomButton.classList.toggle('hidden', on === null);
        if (on !== null) this.randomButton.textContent = `Random guns: ${on ? 'ON' : 'OFF'}`;
    }

    get visible() {
        return !this.root.classList.contains('hidden');
    }

    show() {
        this.showHelp(false);
        this.root.classList.remove('hidden');
    }

    hide() {
        this.root.classList.add('hidden');
    }
}
