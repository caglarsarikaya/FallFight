import { CHARACTERS } from '../../shared/characters/definitions.js';
import { el } from './dom.js';

const characterName = id => CHARACTERS.find(c => c.id === id)?.name || '';

// Hold Tab: kills and deaths for everyone in the arena
export class Scoreboard {
    constructor(root) {
        this.body = el('tbody');
        this.root = el('div.overlay.hidden', {}, el('div.panel.scoreboard', {}, [
            el('h3', { text: 'SCOREBOARD' }),
            el('table', {}, [
                el('thead', {}, el('tr', {}, [
                    el('th', { text: 'PLAYER' }), el('th', { text: 'CHARACTER' }),
                    el('th.num', { text: 'K' }), el('th.num', { text: 'D' })
                ])),
                this.body
            ])
        ]));
        root.append(this.root);
    }

    show(players, selfId) {
        const rows = [...players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
        this.body.replaceChildren(...rows.map(p => el(`tr${p.id === selfId ? '.me' : ''}${p.alive ? '' : '.dead'}`, {}, [
            el('td', { text: `${p.name}${p.isBot ? ' (bot)' : ''}` }),
            el('td', { text: characterName(p.characterId) }),
            el('td.num', { text: String(p.kills) }),
            el('td.num', { text: String(p.deaths) })
        ])));
        this.root.classList.remove('hidden');
    }

    hide() {
        this.root.classList.add('hidden');
    }
}
