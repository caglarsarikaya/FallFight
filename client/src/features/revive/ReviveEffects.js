import * as THREE from 'three';
import { REVIVE } from '../../../shared/features/revive/config.js';

const BEAM_HEIGHT = 40;
const SOUL_START = 12;         // how high above the body the soul starts its way down
const SOUL_END = 0.35;         // the chest of a body lying on the floor
const FADE_IN = 0.4;
const FADE_OUT = { stop: 0.3, finish: 0.7 };
const LIGHT = ['#fffbe6', '#fff2a8', '#ffffff'];
const SOUL = ['#d8f6ff', '#ffffff', '#a8e8ff'];

// Zombies revive, seen by everyone: a beam of light comes down from the sky onto the fallen
// player, and their soul floats down through it, closer every second, until it sinks back into
// the body. Plain additive meshes like the pickup spotlights, no real lights.
export class ReviveEffects {
    constructor(scene, particles) {
        this.scene = scene;
        this.particles = particles;
        this.effects = new Map();     // target id -> effect
        this.geo = {
            beam: new THREE.CylinderGeometry(1.3, 0.65, BEAM_HEIGHT, 20, 1, true),
            core: new THREE.CylinderGeometry(0.22, 0.1, BEAM_HEIGHT, 10, 1, true),
            ring: new THREE.RingGeometry(0.6, 1.1, 32),
            box: new THREE.BoxGeometry(1, 1, 1)
        };
    }

    glow(color, opacity, blending = THREE.AdditiveBlending) {
        return new THREE.MeshBasicMaterial({
            color, transparent: true, opacity, depthWrite: false, blending, side: THREE.DoubleSide, fog: false
        });
    }

    // A small blocky ghost: head, body and two arms held out a little
    createSoul(material) {
        const soul = new THREE.Group();
        for (const [w, h, d, x, y, rz] of [
            [0.3, 0.3, 0.3, 0, 0.42, 0],
            [0.34, 0.46, 0.2, 0, 0, 0],
            [0.1, 0.36, 0.1, -0.25, 0.04, 0.5],
            [0.1, 0.36, 0.1, 0.25, 0.04, -0.5],
            [0.22, 0.2, 0.14, 0, -0.3, 0]          // the tail it trails instead of legs
        ]) {
            const part = new THREE.Mesh(this.geo.box, material);
            part.scale.set(w, h, d);
            part.position.set(x, y, 0);
            part.rotation.z = rz;
            soul.add(part);
        }
        return soul;
    }

    start(id, position, until) {
        const existing = this.effects.get(id);
        if (existing && !existing.ending) {
            existing.until = until;
            return;
        }
        if (existing) this.remove(id);
        const group = new THREE.Group();
        group.position.copy(position);
        const mats = {
            beam: this.glow('#ffe9a0', 0),
            core: this.glow('#fff8e0', 0),
            ring: this.glow('#fff2a8', 0),
            // Not additive, so the pale blue soul still shows inside the bright light
            soul: this.glow('#8fdcff', 0, THREE.NormalBlending)
        };
        const beam = new THREE.Mesh(this.geo.beam, mats.beam);
        beam.position.y = BEAM_HEIGHT / 2;
        const core = new THREE.Mesh(this.geo.core, mats.core);
        core.position.y = BEAM_HEIGHT / 2;
        const ring = new THREE.Mesh(this.geo.ring, mats.ring);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        const soul = this.createSoul(mats.soul);
        soul.position.y = SOUL_START;
        group.add(beam, core, ring, soul);
        this.scene.add(group);
        this.effects.set(id, { group, mats, beam, core, ring, soul, until, age: 0, mote: 0, ending: null, endAge: 0 });
    }

    // Let go or interrupted: the light just fades away and the soul goes back up
    stop(id) {
        const fx = this.effects.get(id);
        if (fx && !fx.ending) fx.ending = 'stop';
    }

    // Revived: the soul is in, a flash, and the light lifts
    finish(id) {
        const fx = this.effects.get(id);
        if (!fx || fx.ending === 'finish') return;
        fx.ending = 'finish';
        fx.endAge = 0;
        fx.soul.visible = false;
        const pos = fx.group.position;
        const at = { x: pos.x, y: pos.y + 0.5, z: pos.z };
        this.particles.burst(at, { count: 40, colors: LIGHT, speed: 5, up: 4, gravity: 2, life: 1, size: 0.1, spread: 0.6, glow: true });
        this.particles.burst(at, { count: 20, colors: SOUL, speed: 1.5, up: 6, gravity: -1, life: 1.4, size: 0.08, spread: 0.4, glow: true });
    }

    clear() {
        for (const id of [...this.effects.keys()]) this.remove(id);
    }

    remove(id) {
        const fx = this.effects.get(id);
        if (!fx) return;
        this.scene.remove(fx.group);
        for (const m of Object.values(fx.mats)) m.dispose();
        this.effects.delete(id);
    }

    // serverNow: the server clock (null before we know it); positionOf(id): where the body lies now
    update(dt, serverNow, positionOf) {
        for (const [id, fx] of this.effects) {
            fx.age += dt;
            const pos = positionOf(id);
            if (pos) fx.group.position.copy(pos);
            const p = serverNow === null ? 0 : THREE.MathUtils.clamp(1 - (fx.until - serverNow) / REVIVE.time, 0, 1);

            let fade = Math.min(1, fx.age / FADE_IN);
            if (fx.ending) {
                fx.endAge += dt;
                fade *= Math.max(0, 1 - fx.endAge / FADE_OUT[fx.ending]);
                if (fade <= 0) {
                    this.remove(id);
                    continue;
                }
            }
            const pulse = Math.sin(fx.age * 5);
            const t = fx.age;

            // The light: narrower and brighter as the soul gets closer
            fx.beam.scale.set(1 - p * 0.35, 1, 1 - p * 0.35);
            fx.mats.beam.opacity = (0.07 + p * 0.07 + pulse * 0.02) * fade;
            fx.mats.core.opacity = (0.16 + p * 0.2 + pulse * 0.04) * fade;
            fx.mats.ring.opacity = (0.45 + pulse * 0.2) * fade;
            const ringGrow = fx.ending === 'finish' ? 1 + fx.endAge * 6 : 1 + (t * 0.7 % 1) * 0.5;
            fx.ring.scale.setScalar(ringGrow);

            // The soul: eases down the beam, slow at first and faster near the end
            if (fx.soul.visible) {
                const down = fx.ending === 'stop' ? -fx.endAge * 4 : 1 - (1 - p) ** 2;
                const sway = (1 - p) * 0.35;
                fx.soul.position.set(Math.sin(t * 1.7) * sway, SOUL_END + (SOUL_START - SOUL_END) * (1 - down) + Math.sin(t * 3) * 0.08, Math.cos(t * 1.3) * sway);
                fx.soul.rotation.y = t * 1.2;
                fx.soul.scale.setScalar(1.15 - p * 0.35);
                fx.mats.soul.opacity = (0.55 + p * 0.3 + Math.sin(t * 9) * 0.06) * fade;
            }

            // Motes falling down the light, and a wisp behind the soul
            fx.mote += dt;
            if (!fx.ending && fx.mote >= 0.06) {
                fx.mote = 0;
                const g = fx.group.position;
                const h = 2 + Math.random() * 14;
                this.particles.burst({ x: g.x, y: g.y + h, z: g.z }, { count: 1, colors: LIGHT, speed: 0.3, up: 0, gravity: 1.5, life: 1.6, size: 0.07, spread: 1.4, glow: true });
                const s = fx.soul.position;
                this.particles.burst({ x: g.x + s.x, y: g.y + s.y, z: g.z + s.z }, { count: 1, colors: SOUL, speed: 0.4, up: 0.8, gravity: -0.5, life: 0.7, size: 0.06, spread: 0.3, glow: true });
            }
        }
    }
}
