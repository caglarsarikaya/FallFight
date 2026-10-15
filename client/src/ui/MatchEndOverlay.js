import { el } from './dom.js';

// Shown when a match is won: the winner, the top of the table and a countdown to the next match
export class MatchEndOverlay {
    constructor(root) {
        this.title = el('h2');
        this.list = el('ol.standings');
        this.countdown = el('div.countdown');
        this.root = el('div.overlay.match-end.hidden', {}, el('div.panel', {}, [this.title, this.list, this.countdown]));
        root.append(this.root);
        this.timer = null;
    }

    // { title, standings: [{ id, name, score, kills, deaths }], restartIn }, scoreLabel e.g. 'KILLS'
    show({ title, standings = [], restartIn = 10 }, selfId, scoreLabel = 'SCORE') {
        this.title.textContent = title || 'Match over';
        this.list.replaceChildren(...standings.slice(0, 6).map((p, i) => el(`li${p.id === selfId ? '.me' : ''}`, {}, [
            el('span.rank', { text: `${i + 1}.` }),
            el('span.name', { text: p.name }),
            el('span.score', { text: `${p.score} ${scoreLabel}` }),
            el('span.kd', { text: `${p.kills} / ${p.deaths}` })
        ])));
        const until = performance.now() + restartIn * 1000;
        clearInterval(this.timer);
        const tick = () => {
            this.countdown.textContent = `Next match in ${Math.max(0, Math.ceil((until - performance.now()) / 1000))}...`;
        };
        tick();
        this.timer = setInterval(tick, 250);
        this.root.classList.remove('hidden');
    }

    hide() {
        clearInterval(this.timer);
        this.root.classList.add('hidden');
    }
}
