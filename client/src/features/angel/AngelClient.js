import * as THREE from 'three';
import { GOD_MODE } from '../../../shared/features/angel/config.js';
import { C2S } from '../../../shared/protocol.js';
import { registerPickupLook } from '../../entities/PickupView.js';
import { ClientFeature } from '../ClientFeature.js';

const GOLD = ['#fff2a8', '#ffd23f', '#ffffff'];
const SPARKLE_EVERY = 0.08;

// The angel on screen: wings, a halo and a golden shine on whoever is blessed, a badge counting
// down our own time, and the sounds of it coming and going
export class AngelClient extends ClientFeature {
    static id = 'angel';
    static menuControls = [['8', 'Angel: 15 s untouchable, if you carry one']];

    constructor(game) {
        super(game);
        this.shown = 0;         // whole seconds of our own angel on the badge
        this.sparkle = 0;
    }

    get pickups() {
        return {
            godmode: {
                name: 'Angel',
                spawned: data => {
                    this.game.sound.play('angel', { at: { x: data.x, y: data.y, z: data.z }, range: 80 });
                    this.game.hud.toast('😇 An angel dropped! Follow the light');
                },
                taken: ({ by }) => {
                    if (!by) return;
                    const game = this.game;
                    if (by === game.selfId) game.sound.play('armorUp');
                    game.hud.toast(by === game.selfId ? '😇 Angel picked up! It saves you from a deadly hit, or press 8 to use it early'
                        : `${game.players.get(by)?.name || 'Someone'} has an angel!`);
                }
            }
        };
    }

    itemName(id) {
        return id === 'godmode' ? 'Angel' : null;
    }

    // Slot 8: GOD_MODE.duration seconds that nothing can hurt you
    useItem(id, now) {
        if (id !== 'godmode') return false;
        const game = this.game;
        game.nextUseAt = now + 600;
        if (!(game.weapons.inventory.counts.godmode > 0)) return true;
        if (game.self.godLeft > 0) {
            game.hud.toast('The angel is already with you');
            return true;
        }
        game.connection.send(C2S.USE, { slot: game.weapons.inventory.selected, dir: game.aimDirection() });
        this.playBlessing();
        game.hud.toast(`😇 Angel! ${GOD_MODE.duration}s safe from harm`);
        return true;
    }

    playBlessing() {
        this.game.viewModel.play('angel');
        this.game.self?.avatar.playAction('angel');
        this.game.sound.play('angel');
    }

    onAction({ id, action, auto }) {
        if (action !== 'angel') return false;
        const game = this.game;
        // An angel that came out by itself to save someone from a deadly hit
        if (auto) this.saved(id);
        if (id !== game.selfId) {
            const info = game.players.get(id);
            if (info) game.sound.play('angel', { at: info.avatar.group.position, range: 40 });
        }
        return true;
    }

    saved(id) {
        const game = this.game;
        if (id !== game.selfId) {
            const name = game.players.get(id)?.name;
            if (name) game.hud.toast(`😇 ${name} was saved by an angel!`);
            return;
        }
        this.playBlessing();
        game.hud.flash('heal');
        game.hud.toast(`😇 The angel saved you! ${GOD_MODE.duration} s untouchable`);
    }

    onSnapshotPlayer(info, isSelf) {
        setWings(info.avatar, info.alive !== false && info.godLeft > 0);
        if (isSelf) this.updateTimer(info.godLeft || 0);
    }

    onDeath(victim) {
        victim.godLeft = 0;
        setWings(victim.avatar, false);
        if (victim.id === this.game.selfId) {
            this.shown = 0;
            this.game.hud.setBadge(null);
            this.game.hud.setGlow(false);
        }
    }

    // Our own angel time: the HUD badge, a tick for each of the last seconds, a sound when it ends
    updateTimer(left) {
        const game = this.game;
        const shown = left > 0 ? Math.ceil(left) : 0;
        if (shown === this.shown) return;
        if (shown > 0 && shown <= 3 && shown < this.shown) game.sound.play('angelTick');
        if (!shown && this.shown && game.local.alive) {
            game.sound.play('angelEnd');
            game.hud.toast('The angel is gone: you can be hurt again');
        }
        this.shown = shown;
        game.hud.setBadge(shown ? `😇 ANGEL ${shown}s` : null, shown <= 3);
        game.hud.setGlow(shown > 0);
    }

    // Golden sparkles round everyone blessed
    update(dt) {
        this.sparkle += dt;
        if (this.sparkle < SPARKLE_EVERY) return;
        this.sparkle = 0;
        const game = this.game;
        for (const info of game.players.values()) {
            if (!info.avatar.attachment('angel') || !info.alive) continue;
            // Our own sparkles would fill the screen in first person
            if (info.id === game.selfId && !game.cameraController.view.showsOwnBody) continue;
            const pos = info.avatar.group.position;
            game.particles.burst({ x: pos.x, y: pos.y + 1.1, z: pos.z }, { count: 2, colors: GOLD, speed: 0.8, up: 0.6, gravity: -1.5, life: 0.9, size: 0.06, spread: 0.9, glow: true });
        }
    }
}

function setWings(avatar, on) {
    if (on) avatar.attach('angel', buildWings);
    else avatar.detach('angel');
}

// Blocky white wings on the back, a gold halo and a golden shine while it lasts
function buildWings(model) {
    const { torsoH, torsoD, head } = model.dims;
    const white = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#d6e2ff', emissiveIntensity: 0.5 });
    const gold = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
    const wings = [-1, 1].map(side => {
        const wing = new THREE.Group();
        wing.position.set(side * 0.08, torsoH * 0.82, torsoD / 2 + 0.04);
        wing.userData.side = side;
        // Feathers in tiers: long on top, shorter below, all sweeping outwards
        for (let i = 0; i < 4; i++) {
            const length = 0.62 - i * 0.12;
            const feather = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, 0.05), white);
            feather.position.set(side * (length / 2), 0.08 - i * 0.11, 0);
            wing.add(feather);
        }
        model.body.add(wing);
        return wing;
    });
    const halo = new THREE.Group();
    for (const [w, d, x, z] of [[0.4, 0.06, 0, 0.17], [0.4, 0.06, 0, -0.17], [0.06, 0.28, 0.17, 0], [0.06, 0.28, -0.17, 0]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), gold);
        bar.position.set(x, 0, z);
        halo.add(bar);
    }
    halo.position.y = head + 0.16;
    model.head.add(halo);
    return {
        parts: [...wings, halo],
        glow: true,
        // Slow beat, the wings swing back and forth around the spine
        animate(now) {
            const beat = Math.sin(now / 1000 * 7);
            for (const wing of wings) wing.rotation.y = wing.userData.side * (-0.5 + beat * 0.35);
            halo.position.y = head + 0.16 + Math.sin(now / 1000 * 3) * 0.03;
        }
    };
}

// On the ground: a gold halo over two small blocky white wings
registerPickupLook('godmode', {
    color: '#fff2a8',
    spotlight: true,
    create() {
        const group = new THREE.Group();
        const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
        const gold = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
        for (const side of [-1, 1]) {
            for (let i = 0; i < 3; i++) {
                const feather = new THREE.Mesh(new THREE.BoxGeometry(0.34 - i * 0.08, 0.08, 0.04), white);
                feather.position.set(side * (0.2 + (0.34 - i * 0.08) / 2), 0.08 - i * 0.09, 0);
                group.add(feather);
            }
        }
        for (const [w, d, x, z] of [[0.32, 0.05, 0, 0.13], [0.32, 0.05, 0, -0.13], [0.05, 0.22, 0.13, 0], [0.05, 0.22, -0.13, 0]]) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), gold);
            bar.position.set(x, 0.32, z);
            group.add(bar);
        }
        group.scale.setScalar(1.3);
        return group;
    }
});
