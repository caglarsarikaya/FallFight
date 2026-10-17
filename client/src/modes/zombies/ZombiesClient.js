import { ZOMBIES, ZOMBIES_EVENTS } from '../../../shared/modes/zombies/config.js';
import { SHOP_CONTROLS } from '../../ui/controls.js';
import { ClientMode } from '../ClientMode.js';

// Zombies: wave banners, moaning and clawing monsters, quiet zombie deaths, and waiting for the
// wave to end (watching the others) after you fall
export class ZombiesClient extends ClientMode {
    static id = 'zombies';
    static menuControls = SHOP_CONTROLS;

    get events() {
        const game = this.game;
        return {
            [ZOMBIES_EVENTS.WAVE_START]: ({ wave, count, giants = 0 }) => {
                const giantText = giants ? ` · ${giants} GIANT${giants > 1 ? 'S' : ''}!` : '';
                game.hud.showBanner(`Wave ${wave} · ${count} zombies${giantText}`, 'wave', giants ? 4500 : 3000);
                game.sound.play('roundStart');
                setTimeout(() => game.sound.play(giants ? 'giantRoar' : 'zombieGroan', { volume: giants ? 1 : 0.8, pitch: 0.8 }), 400);
            },
            [ZOMBIES_EVENTS.WAVE_END]: ({ wave, breakTime }) => {
                game.hud.showBanner(`Wave ${wave} cleared! Next in ${breakTime}s`, 'team-ct', 3500);
                game.sound.play('win');
            }
        };
    }

    get hasShop() {
        return true;
    }

    // Everyone who isn't a zombie
    isTeammate(info) {
        return !info.isNpc;
    }

    respawnWait() {
        return { waiting: true, text: 'Back when this wave is cleared...' };
    }

    scoreboard() {
        return {
            columns: [['KILLS', p => p.kills], ['DEATHS', p => p.deaths]],
            sort: (a, b) => b.kills - a.kills || a.deaths - b.deaths
        };
    }

    panelView(state) {
        const between = state.phase === 'break';
        return {
            title: between ? `WAVE ${state.wave + 1} INCOMING` : `WAVE ${state.wave}`,
            main: between ? `${Math.ceil(state.breakLeft)}s` : `${state.left} zombie${state.left === 1 ? '' : 's'} left`,
            sub: `Kills ${state.kills} · Best wave ${state.bestWave}${state.phase === 'lost' ? ' · Everyone is down!' : ' · B to buy'}`
        };
    }

    // Claws instead of a knife swing
    onAction({ id, item }) {
        if (item !== 'claws' || id === this.game.selfId) return false;
        const info = this.game.players.get(id);
        if (info) this.game.sound.play('zombieAttack', { at: info.avatar.group.position, range: 25 });
        return true;
    }

    // Zombie deaths stay out of the kill feed unless they're yours
    onDeath(victim, { killerId, headshot }) {
        if (!victim.isZombie) return false;
        const game = this.game;
        const pos = victim.avatar.group.position;
        const giant = victim.avatar.scale > 1;
        game.sound.play('zombieDeath', { at: { x: pos.x, y: pos.y + 1, z: pos.z }, range: giant ? 60 : 30, pitch: giant ? 0.55 : 1, volume: giant ? 1.4 : 1 });
        if (killerId === game.selfId) {
            game.sound.play(headshot ? 'headshotKill' : 'kill');
            if (giant) game.hud.toast(`Giant down! +$${ZOMBIES.giant.killMoney}`);
        }
        return true;
    }

    // Zombies moan now and then instead of making footsteps
    remoteSound(info, dt) {
        if (!info.isZombie) return false;
        info.groanTimer = (info.groanTimer ?? 2 + Math.random() * 6) - dt;
        if (info.groanTimer <= 0) {
            info.groanTimer = 4 + Math.random() * 7;
            const avatar = info.avatar;
            const p = avatar.group.position;
            const giant = avatar.scale > 1;
            this.game.sound.play(giant ? 'giantRoar' : 'zombieGroan', { at: { x: p.x, y: p.y + 1.5 * avatar.scale, z: p.z }, range: giant ? 50 : 26, pitch: 0.8 + Math.random() * 0.4 });
        }
        return true;
    }
}
