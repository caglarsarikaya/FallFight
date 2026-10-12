import { el } from './dom.js';

// Esc menu: resume, change character/name, camera, volume, sensitivity, leave
export class PauseMenu {
    constructor(root, { profile, onResume, onEditProfile, onToggleCamera, onVolume, onSensitivity, onLeave }) {
        this.cameraButton = el('button.btn', { type: 'button', onclick: () => onToggleCamera() });
        this.volume = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: profile.volume });
        this.volume.addEventListener('input', () => onVolume(Number(this.volume.value)));
        this.sensitivity = el('input', { type: 'range', min: 0.3, max: 2.5, step: 0.1, value: profile.sensitivity });
        this.sensitivity.addEventListener('input', () => onSensitivity(Number(this.sensitivity.value)));

        this.root = el('div.overlay.dim.pause.hidden', {}, [
            el('h2', { text: 'GAME MENU' }),
            el('button.btn.primary', { type: 'button', text: 'Back to Game', onclick: () => onResume() }),
            el('button.btn', { type: 'button', text: 'Change Character & Name', onclick: () => onEditProfile() }),
            this.cameraButton,
            el('div.setting', {}, [el('span.label', { text: 'SOUND' }), this.volume]),
            el('div.setting', {}, [el('span.label', { text: 'MOUSE SENSITIVITY' }), this.sensitivity]),
            el('button.btn', { type: 'button', text: 'Leave Game', onclick: () => onLeave() })
        ]);
        root.append(this.root);
    }

    setCameraLabel(label) {
        this.cameraButton.textContent = `Camera: ${label}`;
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
