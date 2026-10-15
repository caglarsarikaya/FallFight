import { TEAM_BUY, getModeInfo } from '../../shared/config/modes.js';
import { weaponSpec } from '../../shared/config/weapons.js';
import { el } from './dom.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The strip at the top centre of the screen: what the current mode is about right now.
// Deathmatch: your kills vs the leader. Gun Game: your level, gun and progress. Team Buy: score,
// round timer and who's alive. Zombies: wave, zombies left and a reminder that B buys.
export class ModePanel {
    constructor(root) {
        this.title = el('div.mode-title');
        this.main = el('div.mode-main');
        this.sub = el('div.mode-sub');
        this.root = el('div.mode-panel.hidden', {}, [this.title, this.main, this.sub]);
        root.append(this.root);
        this.state = null;
        this.key = '';
    }

    // state: latest MODE_STATE; players: the game's player map; selfId
    render(state, players, selfId) {
        if (!state) return;
        this.state = state;
        const self = players.get(selfId);
        const view = this[`view_${state.mode}`]?.(state, self, players) || this.view_ffa(state, self, players);
        const key = `${view.title}|${view.main}|${view.sub}|${view.className || ''}`;
        if (key === this.key) return;
        this.key = key;
        this.root.classList.remove('hidden');
        this.root.className = `mode-panel ${view.className || ''}`;
        this.title.textContent = view.title;
        if (view.mainNodes) this.main.replaceChildren(...view.mainNodes);
        else this.main.textContent = view.main;
        this.sub.textContent = view.sub || '';
    }

    view_ffa(state, self, players) {
        let leader = null;
        for (const p of players.values()) if (!leader || p.kills > leader.kills) leader = p;
        return {
            title: getModeInfo(state.mode)?.name.toUpperCase() || 'DEATHMATCH',
            main: `${plural(self?.kills ?? 0, 'kill')}`,
            sub: leader && leader !== self ? `Leader: ${leader.name} (${leader.kills})` : leader ? 'You are in the lead' : ''
        };
    }

    view_gungame(state, self) {
        const level = self?.level ?? 0;
        const kills = self?.levelKills ?? 0;
        const gun = weaponSpec(state.ladder[level]);
        const next = weaponSpec(state.ladder[level + 1]);
        const pips = Array.from({ length: state.killsPerLevel }, (_, i) => el(`span.pip${i < kills ? '.on' : ''}`));
        const leader = state.leader;
        return {
            title: `GUN GAME · LEVEL ${level + 1}/${state.ladder.length}`,
            main: `${gun?.short || ''} ${kills}`,
            mainNodes: [el('span.gun', { text: gun?.short || '' }), el('span.pips', {}, pips)],
            sub: [
                next ? `Next: ${next.short}` : 'Final gun: one more kill wins!',
                leader && leader.id !== self?.id ? `Leader: ${leader.name} L${leader.level + 1}` : null
            ].filter(Boolean).join(' · ')
        };
    }

    view_teambuy(state, self) {
        const team = self?.team;
        const time = state.phase === 'freeze' ? state.freezeLeft : state.timeLeft;
        const phase = state.phase === 'freeze' ? 'BUY TIME' : state.phase === 'over' ? 'ROUND OVER' : formatTime(time);
        return {
            title: `ROUND ${state.round} · FIRST TO ${state.roundsToWin}`,
            mainNodes: [
                el('span.team-t', { text: `${TEAM_BUY.teamTags.t} ${state.score.t}` }),
                el('span.clock', { text: state.phase === 'freeze' ? formatTime(time) : phase }),
                el('span.team-ct', { text: `${state.score.ct} ${TEAM_BUY.teamTags.ct}` })
            ],
            main: `${state.score.t}-${state.score.ct} ${phase} ${time | 0}`,
            sub: `${state.alive.t} ${TEAM_BUY.teamTags.t} alive · ${state.alive.ct} ${TEAM_BUY.teamTags.ct} alive${team ? ` · You: ${TEAM_BUY.teamNames[team]}` : ''}${state.phase === 'freeze' ? ' · Press B to buy' : ''}`,
            className: team ? `team-${team}` : ''
        };
    }

    view_zombies(state) {
        const between = state.phase === 'break';
        return {
            title: between ? `WAVE ${state.wave + 1} INCOMING` : `WAVE ${state.wave}`,
            main: between ? `${Math.ceil(state.breakLeft)}s` : `${state.left} zombie${state.left === 1 ? '' : 's'} left`,
            sub: `Kills ${state.kills} · Best wave ${state.bestWave}${state.phase === 'lost' ? ' · Everyone is down!' : ' · B to buy'}`
        };
    }
}
