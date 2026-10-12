import * as THREE from 'three';
import { ItemView } from './ItemView.js';

const WOOD = '#7a4a22';
const WOOD_LIGHT = '#a06a35';
const STRING = '#e8e8e8';
const HALF = 0.42;      // half the bow's height
const BEND = 0.14;      // how far the limbs curve forward

// An arrow pointing along -Z with the nock at the origin (also used for projectiles and pickups)
export function createArrowModel(length = 0.7) {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, length), new THREE.MeshLambertMaterial({ color: '#c8a26a' }));
    shaft.position.z = -length / 2;
    group.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), new THREE.MeshStandardMaterial({ color: '#9aa1a8', metalness: 0.7, roughness: 0.3 }));
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -length - 0.04;
    group.add(tip);
    const feather = new THREE.MeshLambertMaterial({ color: '#f2f2f2', side: THREE.DoubleSide });
    for (const angle of [0, Math.PI / 2]) {
        const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.14), feather);
        fin.rotation.set(Math.PI / 2, 0, angle);
        fin.position.z = -0.08;
        group.add(fin);
    }
    group.traverse(o => {
        if (o.isMesh) o.castShadow = true;
    });
    return group;
}

export class BowView extends ItemView {
    constructor() {
        super('bow');
    }

    createModel() {
        const group = new THREE.Group();
        const wood = ItemView.material(WOOD);
        const light = ItemView.material(WOOD_LIGHT);
        // Limbs: a curve of small blocks bending forward (-Z)
        const steps = 9;
        for (let i = 0; i <= steps; i++) {
            const y = -HALF + (2 * HALF * i) / steps;
            const z = -BEND * (1 - (y / HALF) ** 2);
            ItemView.box(group, 0.05, 0.11, 0.05, i === steps / 2 || i === (steps - 1) / 2 ? light : wood, 0, y, z);
        }
        ItemView.box(group, 0.07, 0.14, 0.07, ItemView.material('#4a2c12'), 0, 0, -BEND); // grip

        // String: two segments meeting at the nock point, which moves back while drawing
        const stringMaterial = new THREE.MeshBasicMaterial({ color: STRING });
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1, 0.012), stringMaterial);
        const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1, 0.012), stringMaterial);
        group.add(top, bottom);
        const arrow = createArrowModel(0.65);
        arrow.visible = false;
        group.add(arrow);
        group.userData = { top, bottom, arrow };
        BowView.setDraw(group, 0);
        return group;
    }

    // Pull the string back by 0..1 and show a nocked arrow while drawing
    static setDraw(model, draw) {
        const { top, bottom, arrow } = model.userData;
        const nock = new THREE.Vector3(0, 0, 0.02 + draw * 0.3);
        for (const [segment, end] of [[top, new THREE.Vector3(0, HALF, 0)], [bottom, new THREE.Vector3(0, -HALF, 0)]]) {
            const mid = end.clone().add(nock).multiplyScalar(0.5);
            segment.position.copy(mid);
            segment.scale.y = end.distanceTo(nock);
            segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(nock).normalize());
        }
        arrow.visible = draw > 0.02;
        arrow.position.copy(nock);
    }

    get firstPersonPose() {
        return { position: [0.3, -0.32, -0.7], rotation: [0, 0, 0.35], scale: 1 };
    }

    get thirdPersonPose() {
        return { position: [0, 0, 0], rotation: [-Math.PI / 2, 0, 0], scale: 0.9 };
    }

    applyFirstPersonAnimation(model, { action, t, draw }) {
        // While drawing: bring the bow to the centre and upright
        const d = draw || 0;
        model.position.x -= d * 0.22;
        model.position.y += d * 0.06;
        model.position.z += d * 0.1;
        model.rotation.z -= d * 0.3;
        if (action === 'shoot') model.position.z += Math.sin(t * Math.PI) * 0.06;
        BowView.setDraw(model, d);
    }

    drawIcon(ctx, size) {
        // String along the diagonal, limbs curving out to the top right
        for (let i = 3; i <= 12; i++) ItemView.pixel(ctx, size, i, i, STRING);
        for (let k = 0; k <= 20; k++) {
            const t = k / 20;
            const x = (1 - t) ** 2 * 3 + 2 * (1 - t) * t * 14 + t * t * 12;
            const y = (1 - t) ** 2 * 3 + 2 * (1 - t) * t * 1 + t * t * 12;
            ItemView.pixel(ctx, size, Math.round(x), Math.round(y), k > 8 && k < 12 ? '#4a2c12' : k % 4 ? WOOD : WOOD_LIGHT);
        }
    }
}
