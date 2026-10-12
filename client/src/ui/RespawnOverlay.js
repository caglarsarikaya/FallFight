import { el } from './dom.js';

export class RespawnOverlay {
    constructor(root) {
        this.reason = el('div.reason');
        this.countdown = el('div.countdown');
        this.root = el('div.overlay.respawn.hidden', {}, [el('h2', { text: 'YOU DIED!' }), this.reason, this.countdown]);
        root.append(this.root);
        this.timer = null;
    }

    show(reason, seconds) {
        this.reason.textContent = reason;
        this.root.classList.remove('hidden');
        const until = performance.now() + seconds * 1000;
        clearInterval(this.timer);
        const tick = () => {
            const left = Math.max(0, Math.ceil((until - performance.now()) / 1000));
            this.countdown.textContent = `Respawning in ${left}...`;
        };
        tick();
        this.timer = setInterval(tick, 200);
    }

    hide() {
        clearInterval(this.timer);
        this.root.classList.add('hidden');
    }
}
