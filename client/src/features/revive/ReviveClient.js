import { C2S } from '../../../shared/protocol.js';
import { REVIVE, REVIVE_ACTION, REVIVE_EVENTS } from '../../../shared/features/revive/config.js';
import { ClientFeature } from '../ClientFeature.js';
import { ReviveEffects } from './ReviveEffects.js';

// Hold E on a fallen teammate (who's a teammate is the mode's call): the hint, the progress bar,
// and the light coming down on the body for everyone to see
export class ReviveClient extends ClientFeature {
    static id = 'revive';
    static controls = ['E revive'];
    static menuControls = [['E (hold)', 'Revive a fallen teammate']];

    constructor(game) {
        super(game);
        this.fx = new ReviveEffects(game.scene, game.particles);
        this.target = null;     // the body we're holding E on
        this.revive = null;     // { label, until } a revive we're part of (server time)
    }

    get events() {
        return {
            [REVIVE_EVENTS.REVIVE]: data => this.onRevive(data),
            [REVIVE_EVENTS.REVIVED]: data => this.onRevived(data)
        };
    }

    // The nearest fallen teammate close enough to revive, or null
    candidate() {
        const game = this.game;
        if (!game.local.alive) return null;
        const { x, y, z } = game.local.body;
        let best = null;
        let bestDist = Infinity;
        for (const info of game.players.values()) {
            if (info.alive || info.id === game.selfId || !game.mode.isTeammate(info)) continue;
            const p = info.avatar.group.position;
            const d = Math.hypot(p.x - x, p.z - z);
            if (d <= REVIVE.reach && Math.abs(p.y - y) <= REVIVE.reach && d < bestDist) {
                best = info;
                bestDist = d;
            }
        }
        return best;
    }

    // E down: start reviving whoever is at our feet; E up: stop
    onUseKey(down) {
        const target = down ? this.candidate() : null;
        if ((target?.id ?? null) === this.target) return;
        this.target = target?.id ?? null;
        this.game.connection.send(C2S.ACTION, { name: REVIVE_ACTION, data: { id: this.target } });
    }

    onRevive({ reviverId, targetId, until }) {
        const game = this.game;
        // Everyone sees the light come down and the soul return
        const body = game.players.get(targetId)?.avatar.group.position;
        if (until === null) this.fx.stop(targetId);
        else if (body) {
            this.fx.start(targetId, body, until);
            game.sound.play('reviveStart', { at: body, range: 40 });
        }
        if (reviverId === game.selfId && until === null) this.target = null;
        if (reviverId !== game.selfId && targetId !== game.selfId) return;
        if (until === null) {
            this.revive = null;
            return;
        }
        const other = game.players.get(reviverId === game.selfId ? targetId : reviverId)?.name || 'teammate';
        this.revive = { label: reviverId === game.selfId ? `Reviving ${other}...` : `${other} is reviving you...`, until };
    }

    onRevived({ reviverId, targetId }) {
        const game = this.game;
        this.fx.finish(targetId);
        const body = game.players.get(targetId)?.avatar.group.position;
        if (body) game.sound.play('revived', { at: body, range: 50 });
        const name = id => game.players.get(id)?.name || 'Someone';
        if (targetId === game.selfId) game.hud.toast(`${name(reviverId)} revived you!`);
        else if (reviverId === game.selfId) game.hud.toast(`You revived ${name(targetId)}`);
        else game.hud.toast(`${name(reviverId)} revived ${name(targetId)}`);
    }

    onPlayerLeft(id) {
        this.fx.remove(id);
    }

    onMatchStart() {
        this.fx.clear();
        this.revive = null;
        this.target = null;
    }

    update(dt) {
        const game = this.game;
        this.fx.update(dt, game.serverOffset === null ? null : performance.now() / 1000 + game.serverOffset,
            id => game.players.get(id)?.avatar.group.position);
    }

    // Every frame: the hint, the progress bar, and following E (held while walking up to a body
    // starts it; letting go or losing the mouse stops it)
    updateLocal() {
        const game = this.game;
        const held = game.input.keys.has('KeyE') && game.local.alive;
        if (this.target ? !held : held && !this.revive) this.onUseKey(held);
        const candidate = !this.revive && game.input.locked ? this.candidate() : null;
        game.hud.setUseHint(candidate ? `Hold E to revive ${candidate.name}` : null);
        const r = this.revive;
        const now = game.serverOffset === null ? null : performance.now() / 1000 + game.serverOffset;
        game.hud.setProgress(r && now !== null ? { label: r.label, progress: 1 - (r.until - now) / REVIVE.time } : null);
    }

    dispose() {
        this.fx.clear();
        this.game.hud.setUseHint(null);
        this.game.hud.setProgress(null);
    }
}
