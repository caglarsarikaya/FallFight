import * as THREE from 'three';
import { getItemView } from '../items/registry.js';

const SWITCH_TIME = 0.22;
const ACTION_TIMES = { swing: 0.42, stab: 0.85, drink: 0.6, throw: 0.5, angel: 0.7 };
const MAX_SHELLS = 12;

// The item held in first person, with bob, sway, switch, recoil and reload animations. It lives in
// its own scene, rendered after the world with a cleared depth buffer, so it never clips into blocks.
export class ViewModel {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(68, 1, 0.01, 10);
        this.scene.add(new THREE.HemisphereLight('#ffffff', '#8a6a50', 1.5));
        const light = new THREE.DirectionalLight('#ffffff', 1.3);
        light.position.set(1, 2, 1);
        this.scene.add(light);
        // Lights up the gun for a frame when it fires
        this.flashLight = new THREE.PointLight('#ffc070', 0, 2, 2);
        this.flashLight.position.set(0.2, -0.1, -0.8);
        this.scene.add(this.flashLight);
        this.group = new THREE.Group();
        this.scene.add(this.group);
        this.itemId = null;
        this.holder = null;
        this.view = null;
        this.action = null;
        this.switchT = 1;
        this.kickAmount = 0;
        this.reload = null;
        this.bolt = null;
        this.bobPhase = 0;
        this.sway = { x: 0, y: 0 };
        this.flashTime = 0;
        this.crouch = 0;

        // Spent casings flying out of the ejection port
        this.shells = [];
        const brass = new THREE.MeshStandardMaterial({ color: '#c8a040', metalness: 0.8, roughness: 0.3 });
        const geometry = new THREE.BoxGeometry(0.012, 0.012, 0.03);
        for (let i = 0; i < MAX_SHELLS; i++) {
            const mesh = new THREE.Mesh(geometry, brass);
            mesh.visible = false;
            this.scene.add(mesh);
            this.shells.push({ mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
        }
        this.nextShell = 0;
        this.tmp = new THREE.Vector3();
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
        this.reload = null;
        this.bolt = null;
        this.kickAmount = 0;
    }

    play(action) {
        this.action = { name: action, t: 0 };
    }

    // One shot: kick, flash, casing
    fire({ shell = true } = {}) {
        this.kickAmount = Math.min(1.6, this.kickAmount + 1);
        const flash = this.holder?.userData.flash;
        if (flash) {
            flash.visible = true;
            flash.material.rotation = Math.random() * Math.PI;
            this.flashTime = 0.04;
            this.flashLight.intensity = 3;
        }
        if (shell) this.ejectShell();
    }

    // progress 0..1 or null
    setReload(progress) {
        this.reload = progress;
    }

    setBolt(progress) {
        this.bolt = progress;
    }

    setVisible(visible) {
        this.group.visible = visible;
    }

    setAspect(aspect) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
    }

    ejectShell() {
        const model = this.holder?.userData.model;
        const eject = model?.userData.eject;
        if (!eject) return;
        const shell = this.shells[this.nextShell];
        this.nextShell = (this.nextShell + 1) % MAX_SHELLS;
        model.updateWorldMatrix(true, false);
        shell.mesh.position.copy(eject).applyMatrix4(model.matrixWorld);
        shell.velocity.set(0.9 + Math.random() * 0.4, 0.9 + Math.random() * 0.5, 0.3 + Math.random() * 0.3);
        shell.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
        shell.life = 0.5;
        shell.mesh.visible = true;
    }

    render(renderer) {
        if (!this.group.visible || !this.holder) return;
        renderer.clearDepth();
        renderer.render(this.scene, this.camera);
    }

    // look: mouse delta this frame, for weapon sway
    update(dt, { speed = 0, onGround = true, crouching = false, lookX = 0, lookY = 0 } = {}) {
        this.updateShells(dt);
        if (this.flashTime > 0) {
            this.flashTime -= dt;
            if (this.flashTime <= 0) {
                if (this.holder?.userData.flash) this.holder.userData.flash.visible = false;
                this.flashLight.intensity = 0;
            }
        }
        if (!this.holder) return;
        this.switchT = Math.min(1, this.switchT + dt / SWITCH_TIME);
        let t = 0;
        if (this.action) {
            this.action.t += dt / (ACTION_TIMES[this.action.name] || 0.3);
            t = Math.min(1, this.action.t);
        }
        // Recoil kick springs back quickly
        this.kickAmount = Math.max(0, this.kickAmount - dt * (6 + this.kickAmount * 8));
        this.view.animateFirstPerson(this.holder, {
            action: this.action?.name || null, t,
            kick: Math.min(1, this.kickAmount),
            reload: this.reload,
            bolt: this.bolt
        });
        if (this.action && this.action.t >= 1) this.action = null;

        // The gun lags behind fast mouse movement, then catches up
        const k = 1 - Math.exp(-dt * 10);
        this.sway.x += (Math.max(-1, Math.min(1, -lookX * 0.01)) - this.sway.x) * k;
        this.sway.y += (Math.max(-1, Math.min(1, lookY * 0.01)) - this.sway.y) * k;
        this.crouch += ((crouching ? 1 : 0) - this.crouch) * k;

        // Walking bob and the raise animation after switching items
        const moving = onGround ? Math.min(speed / 4.6, 1) : 0;
        this.bobPhase += dt * 9 * moving;
        const raise = 1 - this.switchT;
        this.group.position.set(
            Math.sin(this.bobPhase) * 0.012 * moving + this.sway.x * 0.025,
            -Math.abs(Math.cos(this.bobPhase)) * 0.014 * moving - raise * raise * 0.35 + this.sway.y * 0.02 - this.crouch * 0.01,
            0
        );
        this.group.rotation.set(raise * 0.6, this.sway.x * 0.05, -this.crouch * 0.04);
    }

    updateShells(dt) {
        for (const s of this.shells) {
            if (!s.mesh.visible) continue;
            s.life -= dt;
            if (s.life <= 0) {
                s.mesh.visible = false;
                continue;
            }
            s.velocity.y -= 6 * dt;
            s.mesh.position.addScaledVector(s.velocity, dt);
            s.mesh.rotation.x += s.spin.x * dt;
            s.mesh.rotation.y += s.spin.y * dt;
            s.mesh.rotation.z += s.spin.z * dt;
        }
    }
}
