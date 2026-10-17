import * as THREE from 'three';
import { getItemView } from '../items/registry.js';

const SPOTLIGHT_HEIGHT = 70;

// How each pickup type looks: { color, create(): Object3D, spotlight?: true for a searchlight seen
// from anywhere, spin?: turn speed (power-ups turn faster and bob higher) }. Features register
// their own (registerPickupLook); anything unknown shows as a potion.
const LOOKS = new Map();

export function registerPickupLook(type, look) {
    LOOKS.set(type, look);
}

// A gun model, held up for show
function gunOnDisplay(id, scale) {
    const holder = new THREE.Group();
    const gun = getItemView(id)?.createModel();
    if (gun) {
        gun.scale.setScalar(scale);
        gun.rotation.y = Math.PI / 2;
        holder.add(gun);
    }
    return holder;
}

// A floating, spinning pickup with a glow ring and a light beam so it's visible from afar
export class PickupView {
    constructor(scene, data) {
        this.scene = scene;
        this.data = data;
        this.time = Math.random() * 10;
        this.group = new THREE.Group();
        this.group.position.set(data.x, data.baseY ?? 0, data.z);

        this.look = LOOKS.get(data.type) || LOOKS.get('health_potion');
        this.item = this.look.create(data);
        this.group.add(this.item);

        const color = this.look.color;
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.32, 0.45, 24),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        this.ring = ring;
        this.group.add(ring);

        if (this.look.spotlight) {
            this.createSpotlight(color);
        } else {
            const beam = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.12, 6, 8, 1, true),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })
            );
            beam.position.y = 3;
            this.group.add(beam);
        }

        this.scale = 0;
        scene.add(this.group);
    }

    // A power-up's marker: a searchlight beam into the sky, seen from anywhere on the map (no fog),
    // with two crossed bright blades sweeping round inside it and a wide pulsing ring on the floor.
    // Plain additive meshes, no real light (that would recompile every shader).
    createSpotlight(color) {
        const glow = opacity => new THREE.MeshBasicMaterial({
            color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false
        });
        this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.4, SPOTLIGHT_HEIGHT, 16, 1, true), glow(0.3));
        this.beam.position.y = SPOTLIGHT_HEIGHT / 2;
        this.group.add(this.beam);
        this.core = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.12, SPOTLIGHT_HEIGHT, 8, 1, true), glow(0.5));
        this.core.position.y = SPOTLIGHT_HEIGHT / 2;
        this.group.add(this.core);

        this.sweep = new THREE.Group();
        const blade = new THREE.PlaneGeometry(1.2, SPOTLIGHT_HEIGHT);
        for (let i = 0; i < 2; i++) {
            const plane = new THREE.Mesh(blade, glow(0.22));
            plane.rotation.y = i * Math.PI / 2;
            this.sweep.add(plane);
        }
        this.sweep.position.y = SPOTLIGHT_HEIGHT / 2;
        this.group.add(this.sweep);

        this.halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.6, 32), glow(0.6));
        this.halo.rotation.x = -Math.PI / 2;
        this.halo.position.y = 0.03;
        this.group.add(this.halo);
    }

    update(dt) {
        this.time += dt;
        this.scale = Math.min(1, this.scale + dt * 3);
        const spin = this.look.spin;
        this.item.position.y = (spin ? 0.95 : 0.75) + Math.sin(this.time * 2.5) * (spin ? 0.18 : 0.12);
        this.item.rotation.y += dt * (spin || 1.8);
        this.ring.material.opacity = 0.45 + Math.sin(this.time * 4) * 0.25;
        this.group.scale.setScalar(this.scale);
        if (this.beam) {
            const pulse = Math.sin(this.time * 3);
            this.beam.material.opacity = 0.24 + pulse * 0.08;
            this.core.material.opacity = 0.45 + pulse * 0.12;
            this.sweep.rotation.y += dt * 1.4;
            this.halo.material.opacity = 0.4 + pulse * 0.25;
            this.halo.scale.setScalar(1 + (this.time * 0.8 % 1) * 0.6);
        }
    }

    dispose() {
        this.scene.remove(this.group);
        if (!this.beam) return;
        for (const mesh of [this.beam, this.core, this.halo, ...this.sweep.children]) {
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
    }
}

// A blue kevlar vest with a helmet on top
function createVest() {
    const group = new THREE.Group();
    const blue = new THREE.MeshLambertMaterial({ color: '#3b6fa8' });
    const dark = new THREE.MeshLambertMaterial({ color: '#25466b' });
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.16), blue);
    vest.position.y = -0.1;
    group.add(vest);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.17), dark);
    strap.position.y = -0.2;
    group.add(strap);
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.26), dark);
    helmet.position.y = 0.18;
    group.add(helmet);
    group.traverse(o => {
        if (o.isMesh) o.castShadow = true;
    });
    return group;
}

// Olive ammo can with a yellow stripe and a couple of rounds on top
function createAmmoBox() {
    const box = new THREE.Group();
    const olive = new THREE.MeshLambertMaterial({ color: '#4b5a32' });
    const can = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.24), olive);
    box.add(can);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.425, 0.05, 0.245), new THREE.MeshLambertMaterial({ color: '#d8b43a' }));
    stripe.position.y = 0.04;
    box.add(stripe);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.06), new THREE.MeshLambertMaterial({ color: '#2f3820' }));
    lid.position.y = 0.15;
    box.add(lid);
    const brass = new THREE.MeshStandardMaterial({ color: '#c8a040', metalness: 0.8, roughness: 0.3 });
    for (let i = 0; i < 3; i++) {
        const round = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.035), brass);
        round.position.set(-0.1 + i * 0.07, 0.19, 0.05);
        box.add(round);
    }
    box.position.y = -0.2;
    box.traverse(o => {
        if (o.isMesh) o.castShadow = true;
    });
    const holder = new THREE.Group();
    holder.add(box);
    return holder;
}

registerPickupLook('ammo', { color: '#ffd23f', create: createAmmoBox });
registerPickupLook('armor', { color: '#5fb0ff', create: createVest });
registerPickupLook('weapon', { color: '#ffffff', create: data => gunOnDisplay(data.weapon, 1.6) });
registerPickupLook('rpg', { color: '#ff5a1f', spotlight: true, create: () => gunOnDisplay('rpg', 1.4) });
registerPickupLook('health_potion', {
    color: '#ff4f8b',
    create: () => {
        const potion = getItemView('health_potion').createModel();
        potion.scale.setScalar(1.8);
        return potion;
    }
});
