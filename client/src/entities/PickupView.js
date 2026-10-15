import * as THREE from 'three';
import { getItemView } from '../items/registry.js';

const COLORS = { ammo: '#ffd23f', health_potion: '#ff4f8b', armor: '#5fb0ff', weapon: '#ffffff', rpg: '#ff5a1f', longjump: '#6dff6a' };
const SPOTLIGHT_HEIGHT = 70;

// A floating, spinning pickup with a glow ring and a light beam so it's visible from afar
export class PickupView {
    constructor(scene, data) {
        this.scene = scene;
        this.data = data;
        this.time = Math.random() * 10;
        this.group = new THREE.Group();
        this.group.position.set(data.x, data.baseY ?? 0, data.z);

        this.item = this.createItem(data);
        this.group.add(this.item);

        const color = COLORS[data.type] || '#ffffff';
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.32, 0.45, 24),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        this.ring = ring;
        this.group.add(ring);

        if (data.type === 'rpg' || data.type === 'longjump') {
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

    // The RPG's marker: a searchlight beam into the sky, seen from anywhere on the map (no fog),
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

    createItem(data) {
        if (data.type === 'ammo') return this.createAmmoBox();
        if (data.type === 'rpg') {
            const holder = new THREE.Group();
            const gun = getItemView('rpg')?.createModel();
            if (gun) {
                gun.scale.setScalar(1.4);
                gun.rotation.y = Math.PI / 2;
                holder.add(gun);
            }
            return holder;
        }
        if (data.type === 'armor') return this.createVest();
        if (data.type === 'longjump') return this.createLongJump();
        if (data.type === 'weapon') {
            const holder = new THREE.Group();
            const gun = getItemView(data.weapon)?.createModel();
            if (gun) {
                gun.scale.setScalar(1.6);
                gun.rotation.y = Math.PI / 2;
                holder.add(gun);
            }
            return holder;
        }
        const potion = getItemView('health_potion').createModel();
        potion.scale.setScalar(1.8);
        return potion;
    }

    // A blue kevlar vest with a helmet on top
    createVest() {
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

    // The long jump module: a grey backpack with two thrusters and a green light strip
    createLongJump() {
        const group = new THREE.Group();
        const grey = new THREE.MeshLambertMaterial({ color: '#7a828c' });
        const dark = new THREE.MeshLambertMaterial({ color: '#33383f' });
        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.18), grey);
        group.add(pack);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.01),
            new THREE.MeshBasicMaterial({ color: '#6dff6a' }));
        strip.position.set(0, 0.02, 0.095);
        group.add(strip);
        for (const side of [-1, 1]) {
            const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.26, 10), dark);
            thruster.position.set(side * 0.12, -0.2, -0.12);
            group.add(thruster);
        }
        group.traverse(o => {
            if (o.isMesh) o.castShadow = true;
        });
        group.scale.setScalar(1.3);
        return group;
    }

    // Olive ammo can with a yellow stripe and a couple of rounds on top
    createAmmoBox() {
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

    update(dt) {
        this.time += dt;
        this.scale = Math.min(1, this.scale + dt * 3);
        this.item.position.y = 0.75 + Math.sin(this.time * 2.5) * 0.12;
        this.item.rotation.y += dt * 1.8;
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
