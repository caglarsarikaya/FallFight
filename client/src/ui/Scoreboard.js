import { CHARACTERS } from '../../shared/characters/definitions.js';
import { TEAM_BUY } from '../../shared/config/modes.js';
import { weaponSpec } from '../../shared/config/weapons.js';
import { el } from './dom.js';

const characterName = id => CHARACTERS.find(c => c.id === id)?.name || '';

// Columns per mode: [header, value(player, modeState)]
const COLUMNS = {
    ffa: [['K', p => p.kills], ['D', p => p.deaths]],
    gungame: [
        ['LEVEL', p => (p.level ?? 0) + 1],
        ['GUN', (p, s) => weaponSpec(s?.ladder?.[p.level ?? 0])?.short || ''],
        ['K', p => p.kills], ['D', p => p.deaths]
    ],
    teambuy: [['$', p => (p.money ?? 0)], ['K', p => p.kills], ['D', p => p.deaths]],
    zombies: [['KILLS', p => p.kills], ['DEATHS', p => p.deaths]]
};

const SORT = {
    gungame: (a, b) => (b.level ?? 0) - (a.level ?? 0) || (b.levelKills ?? 0) - (a.levelKills ?? 0) || b.kills - a.kills,
    default: (a, b) => b.kills - a.kills || a.deaths - b.deaths
};

// Hold Tab: the table for everyone in the room, laid out for the current mode
export class Scoreboard {
    constructor(root) {
        this.title = el('h3', { text: 'SCOREBOARD' });
        this.head = el('thead');
        this.body = el('tbody');
        this.root = el('div.overlay.hidden', {}, el('div.panel.scoreboard', {}, [
            this.title,
            el('table', {}, [this.head, this.body])
        ]));
        root.append(this.root);
    }

    show(players, selfId, modeId = 'ffa', modeState = null) {
        const columns = COLUMNS[modeId] || COLUMNS.ffa;
        const sort = SORT[modeId] || SORT.default;
        this.head.replaceChildren(el('tr', {}, [
            el('th', { text: 'PLAYER' }), el('th', { text: 'CHARACTER' }),
            ...columns.map(([name]) => el('th.num', { text: name }))
        ]));
        const row = p => el(`tr${p.id === selfId ? '.me' : ''}${p.alive ? '' : '.dead'}`, {}, [
            el('td', { text: `${p.name}${p.isBot ? ' (bot)' : ''}` }),
            el('td', { text: characterName(p.characterId) }),
            ...columns.map(([, value]) => el('td.num', { text: String(value(p, modeState)) }))
        ]);
        const all = [...players.values()].filter(p => !p.isZombie);
        if (modeId === 'teambuy') {
            // Team by team, with the round score in the header row
            const rows = [];
            for (const team of TEAM_BUY.teams) {
                const score = modeState?.score?.[team] ?? 0;
                rows.push(el(`tr.team-row.team-${team}`, {}, el('td', { colspan: 2 + columns.length, text: `${TEAM_BUY.teamNames[team]} · ${score}` })));
                rows.push(...all.filter(p => p.team === team).sort(sort).map(row));
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
