import { el } from './dom.js';
import { canLockKeys } from '../input/fullscreen.js';

// Esc menu: resume, change character/name, camera, volume, sensitivity, graphics, fullscreen,
// stats overlay, leave
export class PauseMenu {
    constructor(root, { profile, onResume, onEditProfile, onToggleCamera, onVolume, onSensitivity, onShowStats, onGraphics, onFullscreen, onLeave }) {
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
        this.volume = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: profile.volume });
        this.volume.addEventListener('input', () => onVolume(Number(this.volume.value)));
        this.sensitivity = el('input', { type: 'range', min: 0.3, max: 2.5, step: 0.1, value: profile.sensitivity });
        this.sensitivity.addEventListener('input', () => onSensitivity(Number(this.sensitivity.value)));

        this.title = el('h2', { text: 'GAME MENU' });
        this.root = el('div.overlay.dim.pause.hidden', {}, [
            this.title,
            el('button.btn.primary', { type: 'button', text: 'Back to Game', onclick: () => onResume() }),
            el('button.btn', { type: 'button', text: 'Change Character & Name', onclick: () => onEditProfile() }),
            this.cameraButton,
            el('div.setting', {}, [el('span.label', { text: 'SOUND' }), this.volume]),
            el('div.setting', {}, [el('span.label', { text: 'MOUSE SENSITIVITY' }), this.sensitivity]),
            this.graphicsButton,
            this.fullscreenButton,
            this.statsButton,
            el('button.btn', { type: 'button', text: 'Leave Game', onclick: () => onLeave() })
        ]);
        root.append(this.root);
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

    updateFullscreenLabel() {
        this.fullscreenButton.textContent = `Fullscreen: ${this.fullscreen ? (canLockKeys ? 'ON (Ctrl+W safe)' : 'ON') : 'OFF'}`;
    }

    updateStatsLabel() {
        this.statsButton.textContent = `FPS & Ping: ${this.showStats ? 'ON' : 'OFF'}`;
    }

    get visible() {
        return !this.root.classList.contains('hidden');
    }

    show() {
        this.root.classList.remove('hidden');
    }

    hide() {
        this.root.classList.add('hidden');
    }
}
