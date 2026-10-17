import * as THREE from 'three';
import { registerPickupLook } from '../../entities/PickupView.js';
import { ClientFeature } from '../ClientFeature.js';
import { canLockKeys, keysLocked } from '../../input/keyLock.js';

const FIRE = ['#fff3b0', '#ffc23a', '#ff7a1a', '#e2401a'];
const SMOKE = ['#4a4a4a', '#6b6b6b', '#8a8580'];
const DOWN = { x: 0, y: -1, z: 0 };
const PUFF = 0.03;        // seconds between flame puffs
const THRUST = 0.085;     // seconds between overlapping thruster sounds

// The jetpack on screen: the pack on carriers' backs, flames and smoke out of the nozzles of
// everyone flying, and the thruster roar
export class JetpackClient extends ClientFeature {
    static id = 'jetpack';
    static menuControls = [['Shift / Ctrl', 'Fly up / down with a jetpack']];

    constructor(game) {
        super(game);
        this.puff = 0;
        this.thrust = 0;
        this.nozzles = [new THREE.Vector3(), new THREE.Vector3()];
    }

    get pickups() {
        return {
            jetpack: {
                name: 'Jetpack',
                spawned: () => {
                    this.game.sound.play('rpgSpawn');
                    this.game.hud.toast('🚀 A JETPACK dropped! Follow the light');
                },
                taken: ({ by }) => {
                    if (!by) return;
                    const game = this.game;
                    if (by === game.selfId) game.sound.play('armorUp');
                    game.hud.toast(by === game.selfId ? '🚀 Jetpack! Shift up · Ctrl down · WASD to fly'
                        : `${game.players.get(by)?.name || 'Someone'} has the jetpack!`);
                    // Ctrl + W closes the tab unless the keys are locked in fullscreen
                    if (by === game.selfId && !keysLocked()) {
                        game.hud.toast(canLockKeys ? "Tip: turn on Fullscreen (Esc menu) so Ctrl+W can't close the tab"
                            : 'Tip: Ctrl+W closes the tab in this browser; Chrome or Edge fullscreen blocks it');
                    }
                }
            }
        };
    }

    onSnapshotPlayer(info) {
        setPack(info.avatar, info.alive !== false && !!info.jetpack);
    }

    onDeath(victim) {
        victim.jetpack = victim.jetting = false;
        setPack(victim.avatar, false);
    }

    // Lift-off, and the thruster: short roars overlapping into one, higher while climbing
    updateLocal(dt) {
        const game = this.game;
        const local = game.local;
        if (local.events.liftOff) game.sound.play('longJump');
        if (!local.alive || !local.body.flying) return;
        this.thrust -= dt;
        if (this.thrust > 0) return;
        this.thrust = THRUST;
        const jet = local.keys?.jetpack;
        game.sound.play('jetThrust', { pitch: jet?.up ? 1.15 : jet?.down ? 0.85 : 1, volume: 0.5, voiceMs: 300 });
    }

    // Others flying roar instead of stepping
    remoteSound(info, dt) {
        if (!info.jetting) return false;
        info.jetTimer = (info.jetTimer || 0) - dt;
        if (info.jetTimer <= 0) {
            info.jetTimer = THRUST;
            const p = info.avatar.group.position;
            this.game.sound.play('jetThrust', { at: { x: p.x, y: p.y + 1, z: p.z }, range: 45, voiceMs: 300 });
        }
        return true;
    }

    // Flames and smoke out of the nozzles of everyone flying. In first person we can't see our
    // own pack, so ours come from under our feet, where looking down shows them.
    update(dt) {
        this.puff += dt;
        if (this.puff < PUFF) return;
        this.puff = 0;
        const game = this.game;
        const nozzles = this.nozzles;
        for (const info of game.players.values()) {
            const self = info.id === game.selfId;
            const jetting = self ? game.local.alive && !!game.local.body.flying : info.alive !== false && !!info.jetting;
            if (!jetting) continue;
            if (self && !game.cameraController.view.showsOwnBody) {
                const b = game.local.body;
                nozzles[0].set(b.x + Math.sin(game.local.yaw) * 0.25, b.y + 0.35, b.z + Math.cos(game.local.yaw) * 0.25);
                this.burst(nozzles[0]);
                continue;
            }
            const pack = info.avatar.attachment('jetpack');
            if (!pack) continue;
            info.avatar.group.updateWorldMatrix(true, true);
            pack.anchors[0].getWorldPosition(nozzles[0]);
            pack.anchors[1].getWorldPosition(nozzles[1]);
            this.burst(nozzles[0]);
            this.burst(nozzles[1]);
        }
    }

    burst(at) {
        const particles = this.game.particles;
        particles.burst(at, { count: 2, colors: FIRE, speed: 0.4, up: 0, gravity: 0, life: 0.16, size: 0.13, spread: 0.03, glow: true, dir: DOWN, dirSpeed: 6 });
        particles.burst(at, { count: 1, colors: SMOKE, speed: 0.6, up: 0, gravity: -0.8, life: 0.9, size: 0.2, spread: 0.05, dir: DOWN, dirSpeed: 3 });
    }
}

function setPack(avatar, on) {
    if (on) avatar.attach('jetpack', buildPack);
    else avatar.detach('jetpack');
}

// GTA San Andreas style: a grey pack on the back with two rocket tanks; anchors are the nozzles
function buildPack(model) {
    const { torsoH, torsoD } = model.dims;
    const grey = new THREE.MeshLambertMaterial({ color: '#8a9099' });
    const dark = new THREE.MeshLambertMaterial({ color: '#3a3f46' });
    const red = new THREE.MeshLambertMaterial({ color: '#c8322a' });
    const box = (w, h, d, material, x, y, z, parent) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        parent.add(mesh);
        return mesh;
    };
    const pack = new THREE.Group();
    pack.position.set(0, torsoH * 0.55, torsoD / 2 + 0.07);
    box(0.36, 0.46, 0.12, dark, 0, 0, 0, pack);
    const anchors = [-1, 1].map(side => {
        const x = side * 0.17;
        box(0.15, 0.5, 0.15, grey, x, 0.02, 0.1, pack);
        box(0.16, 0.1, 0.16, red, x, 0.3, 0.1, pack);        // nose cap
        box(0.11, 0.08, 0.11, dark, x, -0.27, 0.1, pack);    // nozzle
        const anchor = new THREE.Object3D();
        anchor.position.set(x, -0.33, 0.1);
        pack.add(anchor);
        return anchor;
    });
    model.body.add(pack);
    return { parts: [pack], anchors };
}

// On the ground: a dark pack between two grey rocket tanks with red noses and fins, turning fast
registerPickupLook('jetpack', {
    color: '#ff8a2a',
    spotlight: true,
    spin: 3.2,
    create() {
        const group = new THREE.Group();
        const grey = new THREE.MeshLambertMaterial({ color: '#8a9099' });
        const dark = new THREE.MeshLambertMaterial({ color: '#3a3f46' });
        const red = new THREE.MeshLambertMaterial({ color: '#c8322a' });
        const box = (w, h, d, material, x, y, z) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
            mesh.position.set(x, y, z);
            group.add(mesh);
        };
        box(0.3, 0.4, 0.12, dark, 0, 0, 0);
        for (const side of [-1, 1]) {
            const x = side * 0.17;
            box(0.14, 0.46, 0.14, grey, x, 0, 0.08);
            box(0.15, 0.09, 0.15, red, x, 0.27, 0.08);
            box(0.1, 0.07, 0.1, dark, x, -0.26, 0.08);
            box(0.04, 0.14, 0.12, red, x + side * 0.09, -0.16, 0.08);   // fin
        }
        box(0.06, 0.18, 0.01, new THREE.MeshBasicMaterial({ color: '#ff8a2a' }), 0, 0.04, -0.065);
        group.traverse(o => {
            if (o.isMesh) o.castShadow = true;
        });
        group.scale.setScalar(1.5);
        return group;
    }
});
