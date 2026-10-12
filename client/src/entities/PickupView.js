import * as THREE from 'three';
import { createArrowModel } from '../items/BowView.js';
import { getItemView } from '../items/registry.js';

const COLORS = { arrow: '#ffd23f', health_potion: '#ff4f8b' };

// A floating, spinning pickup with a glow ring and a light beam so it's visible from afar
export class PickupView {
    constructor(scene, data) {
        this.scene = scene;
        this.data = data;
        this.time = Math.random() * 10;
        this.group = new THREE.Group();
        this.group.position.set(data.x, 0, data.z);

        this.item = data.type === 'arrow' ? this.createArrowBundle(data.amount) : getItemView('health_potion').createModel();
        if (data.type !== 'arrow') this.item.scale.setScalar(1.8);
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

    createArrowBundle(amount = 3) {
        const bundle = new THREE.Group();
        for (let i = 0; i < amount; i++) {
            const arrow = createArrowModel(0.6);
            arrow.rotation.set(Math.PI / 2, 0, (i - (amount - 1) / 2) * 0.35);
            arrow.position.set((i - (amount - 1) / 2) * 0.06, -0.3, 0);
            bundle.add(arrow);
        }
        return bundle;
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
