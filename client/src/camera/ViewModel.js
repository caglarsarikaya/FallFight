import * as THREE from 'three';
import { getItemView } from '../items/registry.js';

const SWITCH_TIME = 0.22;
const ACTION_TIMES = { swing: 0.42, stab: 0.85, drink: 0.6, throw: 0.5, angel: 0.7 };
// Spent casings: brass tubes with a dark primer end, kicked out of the ejection port up and to the
// right, tumbling end over end, glowing hot for a moment
const MAX_SHELLS = 24;
const SHELL_LIFE = 0.75;
const SHELL_GRAVITY = 7;
const SHELL_HOT = 0.08;     // seconds of hot glint
const BRASS = '#d4a945';
// Recoil is a spring: each shot kicks it, it snaps back with a slight overshoot (underdamped)
const KICK_STIFFNESS = 340;
const KICK_DAMPING = 2 * Math.sqrt(KICK_STIFFNESS) * 0.55;
const KICK_IMPULSE = 28;    // a rifle shot peaks near 0.8

// The item held in first person, with bob, sway, switch, recoil, reload and aim-down-sights
// animations (aim 0..1 moves the gun up to the eye, see GunView.mountSight). It lives in
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
        this.kickVelocity = 0;
        this.kickRoll = 0;      // which way this shot twists the gun, -1..1
        this.reload = null;
        this.bolt = null;
        this.bobPhase = 0;
        this.sway = { x: 0, y: 0 };
        this.flashTime = 0;
        this.crouch = 0;
        this.aim = 0;

        // Spent casings flying out of the ejection port (lying across the gun: length along X)
        this.shells = [];
        const geometry = new THREE.CylinderGeometry(0.0062, 0.0062, 0.03, 8);
        geometry.rotateZ(Math.PI / 2);
        const primer = new THREE.MeshStandardMaterial({ color: '#5a4520', metalness: 0.6, roughness: 0.5 });
        for (let i = 0; i < MAX_SHELLS; i++) {
            // Own brass material per shell, so each can glow hot on its own
            const brass = new THREE.MeshStandardMaterial({ color: BRASS, metalness: 0.85, roughness: 0.28, emissive: '#ff9a30', emissiveIntensity: 0 });
            const mesh = new THREE.Mesh(geometry, [brass, brass, primer]);   // side, mouth, primer end
            mesh.visible = false;
            this.scene.add(mesh);
            this.shells.push({ mesh, brass, velocity: new THREE.Vector3(), spinAxis: new THREE.Vector3(), spinRate: 0, age: 0 });
        }
        this.nextShell = 0;
        this.tmp = new THREE.Vector3();
        this.tmpQuat = new THREE.Quaternion();
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
        this.kickVelocity = 0;
    }

    // The optic on the gun in hand (null: iron sights)
    setSight(sightId) {
        if (!this.holder || !this.view?.mountSight || (this.holder.userData.sightId ?? null) === (sightId ?? null)) return;
        this.view.mountSight(this.holder, sightId);
    }

    // 0 hip, 1 fully down the sights
    setAim(t) {
        this.aim = t;
    }

    play(action) {
        this.action = { name: action, t: 0 };
    }

    // One shot: kick (strength 0..1.6, see Game.kickOf), flash, casing (its size, 0 for none)
    fire({ shell = 1, kick = 0.5 } = {}) {
        this.kickVelocity += KICK_IMPULSE * (0.6 + kick * 0.8);
        this.kickRoll = Math.random() * 2 - 1;
        const flash = this.holder?.userData.flash;
        if (flash) {
            // Bigger and longer for heavier guns, never quite the same twice
            flash.userData.baseScale ??= flash.scale.x;
            flash.scale.setScalar(flash.userData.baseScale * (0.8 + kick * 0.35) * (0.85 + Math.random() * 0.3));
            flash.visible = true;
            flash.material.rotation = Math.random() * Math.PI;
            this.flashTime = 0.04 + kick * 0.015;
            this.flashLight.intensity = 3 + kick * 1.5;
        }
        if (shell) this.ejectShell(shell);
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

    // Out of the port in the gun's own frame (right, up, a little back toward us), so it leaves
    // the right way even mid-recoil
    ejectShell(size) {
        const model = this.holder?.userData.model;
        const eject = model?.userData.eject;
        if (!eject) return;
        const shell = this.shells[this.nextShell];
        this.nextShell = (this.nextShell + 1) % MAX_SHELLS;
        model.updateWorldMatrix(true, false);
        model.getWorldQuaternion(this.tmpQuat);
        shell.mesh.position.copy(eject).applyMatrix4(model.matrixWorld);
        shell.mesh.quaternion.copy(this.tmpQuat);
        shell.mesh.scale.setScalar(size);
        shell.velocity.set(1 + Math.random() * 0.45, 1.05 + Math.random() * 0.5, 0.2 + Math.random() * 0.25).applyQuaternion(this.tmpQuat);
        // End over end (about the barrel's axis), with a little wobble
        shell.spinAxis.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 1).normalize();
        shell.spinRate = -(24 + Math.random() * 14);
        shell.age = 0;
        shell.brass.emissiveIntensity = 1.4;
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
        // Recoil spring (semi-implicit Euler, in small steps so a long frame stays stable)
        for (let left = Math.min(dt, 0.1); left > 0; left -= 1 / 120) {
            const h = Math.min(left, 1 / 120);
            this.kickVelocity += (-KICK_STIFFNESS * this.kickAmount - KICK_DAMPING * this.kickVelocity) * h;
            this.kickAmount += this.kickVelocity * h;
        }
        this.kickAmount = Math.max(-0.4, Math.min(1.4, this.kickAmount));
        this.view.animateFirstPerson(this.holder, {
            action: this.action?.name || null, t,
            kick: this.kickAmount,
            roll: this.kickRoll,
            reload: this.reload,
            bolt: this.bolt,
            aim: this.aim
        });
        if (this.action && this.action.t >= 1) this.action = null;

        // The gun lags behind fast mouse movement, then catches up
        const k = 1 - Math.exp(-dt * 10);
        this.sway.x += (Math.max(-1, Math.min(1, -lookX * 0.01)) - this.sway.x) * k;
        this.sway.y += (Math.max(-1, Math.min(1, lookY * 0.01)) - this.sway.y) * k;
        this.crouch += ((crouching ? 1 : 0) - this.crouch) * k;

        // Walking bob and the raise animation after switching items (barely any down the sights)
        const steady = 1 - this.aim * 0.8;
        const moving = (onGround ? Math.min(speed / 4.6, 1) : 0) * steady;
        this.bobPhase += dt * 9 * moving;
        const raise = 1 - this.switchT;
        this.group.position.set(
            Math.sin(this.bobPhase) * 0.012 * moving + this.sway.x * 0.025 * steady,
            -Math.abs(Math.cos(this.bobPhase)) * 0.014 * moving - raise * raise * 0.35 + (this.sway.y * 0.02 - this.crouch * 0.01) * steady,
            0
        );
        this.group.rotation.set(raise * 0.6, this.sway.x * 0.05 * steady, -this.crouch * 0.04 * steady);
    }

    updateShells(dt) {
        for (const s of this.shells) {
            if (!s.mesh.visible) continue;
            s.age += dt;
            if (s.age >= SHELL_LIFE) {
                s.mesh.visible = false;
                continue;
            }
            s.brass.emissiveIntensity = Math.max(0, 1.4 * (1 - s.age / SHELL_HOT));
            s.velocity.y -= SHELL_GRAVITY * dt;
            s.mesh.position.addScaledVector(s.velocity, dt);
            s.mesh.rotateOnAxis(s.spinAxis, s.spinRate * dt);
        }
    }
}
