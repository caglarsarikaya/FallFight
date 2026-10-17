import { TEAM_BUY, TEAM_BUY_EVENTS } from '../../../shared/modes/teambuy/config.js';
import { el } from '../../ui/dom.js';
import { ClientMode } from '../ClientMode.js';

function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Team Buy: rounds with freeze and buy time, the two teams' score, team-by-team scoreboard, and
// watching your team after you die
export class TeamBuyClient extends ClientMode {
    static id = 'teambuy';
    static controls = ['B buy · N ammo · M kevlar · H potions · G grenades'];

    get events() {
        const game = this.game;
        return {
            [TEAM_BUY_EVENTS.ROUND_START]: ({ round }) => {
                game.hud.showBanner(`Round ${round} · Buy now (B)`, 'round', 2500);
                game.sound.play('roundStart');
            },
            [TEAM_BUY_EVENTS.ROUND_END]: ({ winner }) => {
                const text = winner ? `${TEAM_BUY.teamNames[winner]} Win!` : 'Round Draw';
                game.hud.showBanner(text, winner ? `team-${winner}` : '', 4000);
                game.sound.play(winner && winner === game.self?.team ? 'win' : 'lose');
                game.buyMenu.hide();
            }
        };
    }

    get hasShop() {
        return true;
    }

    // Your team's pistol is what you get anyway
    buyMenuOptions() {
        return { free: false, defaultItem: TEAM_BUY.defaultPistol[this.game.self?.team] ?? null };
    }

    // In buy time only
    canBuy() {
        const s = this.game.modeState;
        return !!s && (s.phase === 'freeze' || (s.phase === 'live' && s.buyLeft > 0));
    }

    get frozen() {
        return this.game.modeState?.phase === 'freeze';
    }

    isTeammate(info) {
        return !!info.team && info.team === this.game.self?.team;
    }

    respawnWait() {
        return { waiting: true, text: null };
    }

    scoreboard() {
        return {
            columns: [['$', p => (p.money ?? 0)], ['K', p => p.kills], ['D', p => p.deaths]],
            sort: (a, b) => b.kills - a.kills || a.deaths - b.deaths,
            // Team by team, with the round score in the header row
            groups: (players, state) => TEAM_BUY.teams.map(team => ({
                label: `${TEAM_BUY.teamNames[team]} · ${state?.score?.[team] ?? 0}`,
                className: `team-${team}`,
                players: players.filter(p => p.team === team)
            }))
        };
    }

    panelView(state, self) {
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
}
