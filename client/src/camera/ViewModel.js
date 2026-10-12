import * as THREE from 'three';
import { getItemView } from '../items/registry.js';

const SWITCH_TIME = 0.18;
const ACTION_TIMES = { swing: 0.35, shoot: 0.25, drink: 0.6 };

// The item held in first person, with bob, switch and use animations. It lives in its own scene,
// rendered after the world with a cleared depth buffer, so it never clips into blocks.
export class ViewModel {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
        this.scene.add(new THREE.HemisphereLight('#ffffff', '#8a6a50', 1.4));
        const light = new THREE.DirectionalLight('#ffffff', 1.4);
        light.position.set(1, 2, 1);
        this.scene.add(light);
        this.group = new THREE.Group();
        this.scene.add(this.group);
        this.itemId = null;
        this.holder = null;
        this.view = null;
        this.action = null;
        this.switchT = 1;
        this.draw = 0;
        this.bobPhase = 0;
    }

    setItem(itemId) {
        if (itemId === this.itemId) return;
        this.itemId = itemId;
        if (this.holder) this.group.remove(this.holder);
        this.view = getItemView(itemId);
        this.holder = this.view ? this.view.createFirstPerson() : null;
        if (this.holder) this.group.add(this.holder);
        this.switchT = 0;
        this.action = null;
        this.draw = 0;
    }

    play(action) {
        this.action = { name: action, t: 0 };
    }

    setDraw(progress) {
        this.draw = progress;
    }

    setVisible(visible) {
        this.group.visible = visible;
    }

    setAspect(aspect) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
    }

    render(renderer) {
        if (!this.group.visible || !this.holder) return;
        renderer.clearDepth();
        renderer.render(this.scene, this.camera);
    }

    update(dt, { speed = 0, onGround = true } = {}) {
        if (!this.holder) return;
        this.switchT = Math.min(1, this.switchT + dt / SWITCH_TIME);
        let t = 0;
        if (this.action) {
            this.action.t += dt / (ACTION_TIMES[this.action.name] || 0.3);
            t = Math.min(1, this.action.t);
        }
        this.view.animateFirstPerson(this.holder, { action: this.action?.name || null, t, draw: this.draw });
        if (this.action && this.action.t >= 1) this.action = null;

        // Walking bob and the raise animation after switching items
        const moving = onGround ? Math.min(speed / 4.6, 1) : 0;
        this.bobPhase += dt * 9 * moving;
        this.group.position.set(
            Math.sin(this.bobPhase) * 0.02 * moving,
            -Math.abs(Math.cos(this.bobPhase)) * 0.025 * moving - (1 - this.switchT) * 0.4,
            0
        );
    }
}
