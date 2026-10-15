import * as THREE from 'three';
import { getItemView } from '../items/registry.js';

const COLORS = { ammo: '#ffd23f', health_potion: '#ff4f8b', armor: '#5fb0ff', weapon: '#ffffff' };

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

        const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 6, 8, 1, true),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        beam.position.y = 3;
        this.group.add(beam);

        this.scale = 0;
        scene.add(this.group);
    }

    createItem(data) {
        if (data.type === 'ammo') return this.createAmmoBox();
        if (data.type === 'armor') return this.createVest();
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
    }

    dispose() {
        this.scene.remove(this.group);
    }
}
