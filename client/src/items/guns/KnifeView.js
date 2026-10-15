import * as THREE from 'three';
import { ItemView } from '../ItemView.js';

const BLADE = '#c9ced3';
const EDGE = '#eef2f5';
const HANDLE = '#1d1e20';
const GLOVE = '#2a2522';
const SLEEVE = '#3b4756';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const mats = {};
const mat = (color, metal = false) => mats[color] || (mats[color] = metal
    ? new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.25 })
    : new THREE.MeshLambertMaterial({ color }));

function addBox(group, w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(unitBox, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.userData.shared = true;
    group.add(mesh);
    return mesh;
}

export class KnifeView extends ItemView {
    constructor() {
        super('knife');
    }

    // Blade forward (-Z), handle at the origin
    createModel() {
        const group = new THREE.Group();
        addBox(group, 0.03, 0.035, 0.11, 0, 0, 0.02, mat(HANDLE));
        addBox(group, 0.05, 0.05, 0.012, 0, 0, -0.04, mat('#3d4045', true));
        addBox(group, 0.012, 0.05, 0.17, 0, 0.004, -0.13, mat(BLADE, true));
        addBox(group, 0.013, 0.012, 0.17, 0, -0.021, -0.13, mat(EDGE, true));
        addBox(group, 0.012, 0.03, 0.04, 0, 0.01, -0.235, mat(BLADE, true));
        return group;
    }

    get firstPersonPose() {
        return { position: [0.15, -0.15, -0.3], rotation: [0.15, 0.25, -0.15], scale: 0.7 };
    }

    get thirdPersonPose() {
        return { position: [0, 0.02, 0.02], rotation: [-Math.PI / 2, 0, 0], scale: 0.9 };
    }

    createFirstPerson() {
        const holder = super.createFirstPerson();
        const model = holder.userData.model;
        addBox(model, 0.05, 0.06, 0.08, 0, 0, 0.03, mat(GLOVE));
        const sleeve = addBox(model, 0.075, 0.075, 0.3, 0.02, -0.04, 0.2, mat(SLEEVE));
        sleeve.rotation.x = 0.35;
        return holder;
    }

    applyFirstPersonAnimation(model, { action, t }) {
        if (action === 'swing') {
            // Slash right to left
            const s = Math.sin(t * Math.PI);
            model.position.x -= s * 0.2;
            model.position.z -= s * 0.08;
            model.rotation.y += s * 0.9;
            model.rotation.z += s * 0.6;
        } else if (action === 'stab') {
            // Pull back, then thrust
            const back = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
            const thrust = t < 0.35 ? 0 : Math.sin(((t - 0.35) / 0.65) * Math.PI);
            model.position.z += back * 0.08 - thrust * 0.2;
            model.position.x -= thrust * 0.06;
            model.rotation.x -= thrust * 0.3;
        }
    }

    drawIcon(ctx, size) {
        for (let i = 0; i <= 7; i++) ItemView.pixel(ctx, size, 4 + i, 11 - i, i < 2 ? HANDLE : i === 7 ? EDGE : BLADE);
        for (let i = 2; i <= 7; i++) ItemView.pixel(ctx, size, 5 + i, 11 - i, EDGE);
        ItemView.pixel(ctx, size, 3, 12, HANDLE);
        ItemView.pixel(ctx, size, 2, 13, HANDLE);
        ItemView.pixel(ctx, size, 5, 11, '#3d4045');
        ItemView.pixel(ctx, size, 6, 12, '#3d4045');
    }
}
