import { el } from './dom.js';

export class RespawnOverlay {
    constructor(root) {
        this.reason = el('div.reason');
        this.countdown = el('div.countdown');
        this.watching = el('div.watching');
        this.root = el('div.overlay.respawn.hidden', {}, [el('h2', { text: 'YOU DIED!' }), this.reason, this.watching, this.countdown]);
        root.append(this.root);
        this.timer = null;
    }

    // seconds: countdown to respawn, or null when waiting for the next round
    show(reason, seconds) {
        this.reason.textContent = reason;
        this.setSpectating(null);
        this.root.classList.remove('hidden');
        clearInterval(this.timer);
        if (seconds === null) {
            this.countdown.textContent = this.waitText || 'Waiting for the next round...';
            return;
        }
        const until = performance.now() + seconds * 1000;
        const tick = () => {
            const left = Math.max(0, Math.ceil((until - performance.now()) / 1000));
            this.countdown.textContent = `Respawning in ${left}...`;
        };
        tick();
        this.timer = setInterval(tick, 200);
    }

    // Watching a teammate: shrink to a strip at the top so the view stays clear (name null: not watching)
    setSpectating(name) {
        this.root.classList.toggle('spectating', !!name);
        this.watching.textContent = name ? `Watching ${name} · Click: next · V: view` : '';
    }

    hide() {
        clearInterval(this.timer);
        this.setSpectating(null);
        this.root.classList.add('hidden');
    }
}
