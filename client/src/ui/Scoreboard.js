import { CHARACTERS } from '../../shared/characters/definitions.js';
import { el } from './dom.js';

const characterName = id => CHARACTERS.find(c => c.id === id)?.name || '';

// Hold Tab: the table for everyone in the room, laid out for the current mode
export class Scoreboard {
    constructor(root) {
        this.title = el('h3', { text: 'SCOREBOARD' });
        this.head = el('thead');
        this.body = el('tbody');
        this.root = el('div.overlay.scores.hidden', {}, el('div.panel.scoreboard', {}, [
            this.title,
            el('table', {}, [this.head, this.body])
        ]));
        root.append(this.root);
    }

    // mode: the ClientMode, which says who's listed and how (ClientMode.scoreboard)
    show(players, selfId, mode, modeState = null) {
        const { columns, sort, groups } = mode.scoreboard();
        this.head.replaceChildren(el('tr', {}, [
            el('th', { text: 'PLAYER' }), el('th', { text: 'CHARACTER' }),
            ...columns.map(([name]) => el('th.num', { text: name }))
        ]));
        const row = p => el(`tr${p.id === selfId ? '.me' : ''}${p.alive ? '' : '.dead'}`, {}, [
            el('td', { text: `${p.name}${p.isBot ? ' (bot)' : ''}` }),
            el('td', { text: characterName(p.characterId) }),
            ...columns.map(([, value]) => el('td.num', { text: String(value(p, modeState)) }))
        ]);
        const all = [...players.values()].filter(p => mode.listed(p));
        if (groups) {
            // Group by group (team by team), each under a header row
            const rows = [];
            for (const group of groups(all, modeState)) {
                rows.push(el(`tr.team-row.${group.className}`, {}, el('td', { colspan: 2 + columns.length, text: group.label })));
                rows.push(...group.players.sort(sort).map(row));
            }
            this.body.replaceChildren(...rows);
        } else {
            this.body.replaceChildren(...all.sort(sort).map(row));
        }
        this.root.classList.remove('hidden');
    }

    hide() {
        this.root.classList.add('hidden');
    }
}
