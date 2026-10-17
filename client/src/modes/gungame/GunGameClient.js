import { weaponSpec } from '../../../shared/config/weapons.js';
import { GUN_GAME_EVENTS } from '../../../shared/modes/gungame/config.js';
import { el } from '../../ui/dom.js';
import { ClientMode } from '../ClientMode.js';

// Gun Game: the level and the gun ladder on the panel and scoreboard, a sound on every level up
export class GunGameClient extends ClientMode {
    static id = 'gungame';

    get events() {
        return {
            [GUN_GAME_EVENTS.LEVEL_UP]: ({ id, level, weapon }) => {
                if (id !== this.game.selfId) return;
                this.game.sound.play('levelUp');
                this.game.hud.toast(`Level ${level + 1}: ${weaponSpec(weapon)?.name || weapon}`);
            }
        };
    }

    get scoreLabel() {
        return 'PTS';
    }

    scoreboard() {
        return {
            columns: [
                ['LEVEL', p => (p.level ?? 0) + 1],
                ['GUN', (p, s) => weaponSpec(s?.ladder?.[p.level ?? 0])?.short || ''],
                ['K', p => p.kills], ['D', p => p.deaths]
            ],
            sort: (a, b) => (b.level ?? 0) - (a.level ?? 0) || (b.levelKills ?? 0) - (a.levelKills ?? 0) || b.kills - a.kills
        };
    }

    panelView(state, self) {
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
}
