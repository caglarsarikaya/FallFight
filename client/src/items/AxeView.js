import * as THREE from 'three';
import { ItemView } from './ItemView.js';

const WOOD = '#8a5a2b';
const WOOD_DARK = '#5e3b1a';
const IRON = '#c9ced3';
const IRON_DARK = '#7f878e';

export class AxeView extends ItemView {
    constructor() {
        super('axe');
    }

    createModel() {
        const group = new THREE.Group();
        const wood = ItemView.material(WOOD);
        ItemView.box(group, 0.06, 0.72, 0.06, wood, 0, 0.18, 0);
        ItemView.box(group, 0.07, 0.08, 0.07, ItemView.material(WOOD_DARK), 0, -0.14, 0);
        // Blade sticks out forward (-Z) from the top of the handle
        const iron = new THREE.MeshStandardMaterial({ color: IRON, metalness: 0.7, roughness: 0.3 });
        ItemView.box(group, 0.05, 0.24, 0.2, iron, 0, 0.44, -0.12);
        ItemView.box(group, 0.055, 0.3, 0.05, new THREE.MeshStandardMaterial({ color: IRON_DARK, metalness: 0.6, roughness: 0.4 }), 0, 0.44, -0.235);
        ItemView.box(group, 0.07, 0.12, 0.08, iron, 0, 0.47, 0.02);
        return group;
    }

    get firstPersonPose() {
        return { position: [0.42, -0.5, -0.62], rotation: [-0.25, -0.35, -0.15], scale: 1 };
    }

    applyFirstPersonAnimation(model, { action, t }) {
        if (action !== 'swing') return;
        // Lift, then chop down hard
        const lift = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
        const chop = t < 0.3 ? 0 : Math.sin(((t - 0.3) / 0.7) * Math.PI);
        model.rotation.x += lift * 0.6 - chop * 1.4;
        model.position.y += lift * 0.1 - chop * 0.12;
        model.position.x -= chop * 0.12;
    }

    drawIcon(ctx, size) {
        for (let i = 0; i <= 8; i++) ItemView.pixel(ctx, size, 3 + i, 13 - i, i % 3 === 0 ? WOOD_DARK : WOOD);
        const head = { 2: [10, 12], 3: [9, 13], 4: [9, 13], 5: [10, 13], 6: [11, 12] };
        for (const [y, [from, to]] of Object.entries(head)) {
            for (let x = from; x <= to; x++) {
                const edge = x === to || Number(y) === 2;
                ItemView.pixel(ctx, size, x, Number(y), edge ? '#eef2f5' : x <= from ? IRON_DARK : IRON);
            }
        }
    }
}
