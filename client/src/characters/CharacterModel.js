import * as THREE from 'three';

const HURT_TIME = 0.25;
const DEATH_TIME = 0.45;

const DEFAULT_DIMS = {
    legH: 0.75, legW: 0.24, hipX: 0.13,
    torsoW: 0.52, torsoH: 0.72, torsoD: 0.28,
    armW: 0.2, armH: 0.68,
    head: 0.46
};

const easeOut = t => 1 - (1 - t) * (1 - t);

// Base class for the blocky player characters. Builds a rig (legs, torso, arms, head on pivots,
// origin at the feet, facing -Z) and animates walking, crouching, aiming a gun, knifing, recoil,
// reloading, drinking, getting hurt and dying. Subclasses customise the look by overriding the build* hooks and add their own
// motion in animateExtras().
export class CharacterModel {
    constructor() {
        this.root = new THREE.Group();
        this.rig = new THREE.Group();
        this.root.add(this.rig);
        this.materials = [];
        this.dims = { ...DEFAULT_DIMS, ...this.dimensions() };

        this.walkPhase = 0;
        this.time = 0;
        this.action = null;      // { name, t, duration }
        this.hurtTimer = 0;
        this.flinch = 0;            // 0..1: thrown back by a hit, springs back fast
        this.flinchHead = false;    // a headshot snaps the head back
        this.glow = false;       // Zombies angel: a pulsing golden shine (setGlow)
        this.deathTimer = null;
        this.crouch = 0;

        this.build();
        this.root.traverse(o => {
            if (o.isMesh) o.castShadow = true;
        });
    }

    // ---- hooks for subclasses --------------------------------------------------------

    dimensions() {
        return {};
    }

    get palette() {
        return { skin: '#f1c27d', shirt: '#3b7dd8', pants: '#2c3e74', shoes: '#3a2a1a', hair: '#3b2314' };
    }

    buildLegs() {
        const { legH, legW } = this.dims;
        for (const leg of [this.leftLeg, this.rightLeg]) {
            this.box(legW, legH - 0.12, legW, this.mat(this.palette.pants), 0, -(legH - 0.12) / 2, 0, leg);
            this.box(legW + 0.02, 0.12, legW + 0.06, this.mat(this.palette.shoes), 0, -legH + 0.06, -0.02, leg);
        }
    }

    buildTorso() {
        const { torsoW, torsoH, torsoD } = this.dims;
        this.box(torsoW, torsoH, torsoD, this.mat(this.palette.shirt), 0, torsoH / 2, 0, this.body);
    }

    buildArms() {
        const { armW, armH } = this.dims;
        for (const arm of [this.leftArm, this.rightArm]) {
            this.box(armW, armH - 0.14, armW, this.mat(this.palette.shirt), 0, -(armH - 0.14) / 2, 0, arm);
            this.box(armW - 0.02, 0.14, armW - 0.02, this.mat(this.palette.skin), 0, -armH + 0.07, 0, arm);
        }
    }

    buildHead() {
        const { head } = this.dims;
        this.box(head, head, head, this.mat(this.palette.skin), 0, head / 2, 0, this.head);
        this.addEyes('#ffffff', '#2b2b2b');
    }

    buildExtras() {}

    animateExtras(_dt, _state) {}

    // ---- construction helpers --------------------------------------------------------

    build() {
        const { legH, hipX, torsoW, torsoH, armW } = this.dims;
        this.leftLeg = this.pivot(-hipX, legH, 0);
        this.rightLeg = this.pivot(hipX, legH, 0);
        this.body = this.pivot(0, legH, 0);
        const shoulderY = legH + torsoH - 0.06;
        const shoulderX = torsoW / 2 + armW / 2 + 0.01;
        this.leftArm = this.pivot(-shoulderX, shoulderY, 0);
        this.rightArm = this.pivot(shoulderX, shoulderY, 0);
        this.head = this.pivot(0, legH + torsoH, 0);
        this.restY = { shoulder: shoulderY, head: legH + torsoH };

        // Weapons attach here (in the right hand, pointing forward)
        this.handAnchor = new THREE.Group();
        this.handAnchor.position.set(0, -this.dims.armH + 0.06, -0.02);
        this.rightArm.add(this.handAnchor);

        this.buildLegs();
        this.buildTorso();
        this.buildArms();
        this.buildHead();
        this.buildExtras();
    }

    pivot(x, y, z, parent = this.rig) {
        const group = new THREE.Group();
        group.position.set(x, y, z);
        parent.add(group);
        return group;
    }

    mat(color, { emissive = null, emissiveIntensity = 1, metal = false, map = null, transparent = false, opacity = 1 } = {}) {
        const material = metal
            ? new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35, map })
            : new THREE.MeshLambertMaterial({ color, map });
        if (emissive) {
            material.emissive = new THREE.Color(emissive);
            material.emissiveIntensity = emissiveIntensity;
        }
        if (transparent) {
            material.transparent = true;
            material.opacity = opacity;
        }
        material.userData.baseEmissive = material.emissive.clone();
        material.userData.baseEmissiveIntensity = material.emissiveIntensity;
        this.materials.push(material);
        return material;
    }

    box(w, h, d, material, x = 0, y = 0, z = 0, parent = this.rig) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        parent.add(mesh);
        return mesh;
    }

    cylinder(radius, height, material, x = 0, y = 0, z = 0, parent = this.rig, segments = 12) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
        mesh.position.set(x, y, z);
        parent.add(mesh);
        return mesh;
    }

    // Two square eyes on the front of the head
    addEyes(white, pupil, y = this.dims.head * 0.55, spacing = 0.1) {
        const front = -this.dims.head / 2 - 0.005;
        for (const side of [-1, 1]) {
            this.box(0.1, 0.08, 0.01, this.mat(white), side * spacing, y, front, this.head);
            this.box(0.05, 0.08, 0.012, this.mat(pupil), side * spacing + side * 0.025, y, front - 0.002, this.head);
        }
    }

    // ---- animation -------------------------------------------------------------------

    playAction(name) {
        const durations = { swing: 0.35, stab: 0.5, shoot: 0.14, drink: 0.6, reload: 1.4, throw: 0.45, angel: 0.7 };
        this.action = { name, t: 0, duration: durations[name] || 0.3 };
    }

    // strength 0..1 (how hard the hit was)
    hurt(strength = 0.4, headshot = false) {
        this.hurtTimer = HURT_TIME;
        this.flinch = Math.min(1, Math.max(this.flinch, strength));
        this.flinchHead = headshot;
    }

    die() {
        this.deathTimer = 0;
    }

    rise() {
        this.deathTimer = null;
        this.rig.rotation.set(0, 0, 0);
        this.rig.position.set(0, 0, 0);
    }

    // state: { speed, onGround, aiming (holding a gun), crouching, pitch }
    animate(dt, state) {
        this.time += dt;
        const { speed = 0, onGround = true, aiming = false, crouching = false, pitch = 0 } = state;

        // Crouch: shorter legs, everything above them lower
        this.crouch += ((crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 12);
        const { legH } = this.dims;
        const drop = legH * 0.42 * this.crouch;
        for (const leg of [this.leftLeg, this.rightLeg]) {
            leg.position.y = legH - drop;
            leg.scale.y = 1 - 0.42 * this.crouch;
        }
        this.leftArm.position.y = this.rightArm.position.y = this.restY.shoulder - drop;
        this.head.position.y = this.restY.head - drop;

        // Walk cycle
        const stride = Math.min(speed / 4.6, 1);
        this.walkPhase += dt * (4 + speed * 1.6) * (stride > 0.05 ? 1 : 0);
        const swing = Math.sin(this.walkPhase) * 0.75 * stride;
        const air = onGround ? 0 : 0.35;
        this.leftLeg.rotation.x = swing + air;
        this.rightLeg.rotation.x = -swing - air * 0.5;
        this.leftArm.rotation.set(-swing * 0.8, 0, 0);
        this.rightArm.rotation.set(swing * 0.8 + 0.25, 0, 0);
        this.head.rotation.set(THREE.MathUtils.clamp(pitch, -0.8, 0.8), 0, 0);
        this.body.rotation.set(0, 0, 0);
        // Idle breathing
        this.body.position.y = this.dims.legH - drop + Math.sin(this.time * 2) * 0.008;
        if (this.crouch > 0.01) this.body.rotation.x = -0.2 * this.crouch;

        if (aiming) {
            // Gun up at the shoulder: right hand on the grip, left hand on the handguard
            this.rightArm.rotation.set(Math.PI / 2 + pitch, 0, 0.06);
            this.leftArm.rotation.set(Math.PI / 2 + pitch - 0.12, 0.5, 0);
        }

        if (this.action) {
            this.action.t += dt / this.action.duration;
            const t = Math.min(1, this.action.t);
            if (this.action.name === 'swing') {
                const raise = t < 0.35 ? easeOut(t / 0.35) * 2.6 : 2.6 - easeOut((t - 0.35) / 0.65) * 2.2;
                this.rightArm.rotation.set(raise + 0.2, 0, 0.15);
                this.body.rotation.y = -Math.sin(t * Math.PI) * 0.25;
            } else if (this.action.name === 'stab') {
                const thrust = Math.sin(t * Math.PI);
                this.rightArm.rotation.set(0.6 + thrust * 1.1 + pitch * thrust, 0, 0.1);
                this.body.rotation.y = thrust * 0.2;
            } else if (this.action.name === 'shoot') {
                const kick = Math.sin(t * Math.PI) * 0.18;
                this.rightArm.rotation.set(Math.PI / 2 + pitch + kick, 0, 0.06);
                this.leftArm.rotation.set(Math.PI / 2 + pitch - 0.12 + kick, 0.5, 0);
            } else if (this.action.name === 'reload') {
                // Left hand down to the magazine and back
                const reach = Math.sin(Math.min(1, t * 1.2) * Math.PI);
                this.rightArm.rotation.set(Math.PI / 2 + pitch - 0.5 * reach, 0, 0.06 + 0.3 * reach);
                this.leftArm.rotation.set(Math.PI / 2 + pitch - 0.12 - 1.1 * reach, 0.5, 0);
            } else if (this.action.name === 'throw') {
                // Overhand: arm back over the shoulder, then forward
                const arc = t < 0.4 ? -easeOut(t / 0.4) * 0.6 : -0.6 + easeOut((t - 0.4) / 0.6) * 2.6;
                this.rightArm.rotation.set(2.4 + arc, 0, 0.1);
                this.body.rotation.y = -Math.sin(t * Math.PI) * 0.2;
            } else if (this.action.name === 'drink') {
                this.rightArm.rotation.set(2.3, 0, 0.6);
                this.head.rotation.x = 0.45 * Math.sin(t * Math.PI);
            } else if (this.action.name === 'angel') {
                // Holds the halo up to the sky
                this.rightArm.rotation.set(Math.PI * Math.sin(t * Math.PI), 0, 0.15);
                this.head.rotation.x = -0.4 * Math.sin(t * Math.PI);
            }
            if (this.action.t >= 1) this.action = null;
        }

        // Hit flinch: the torso rocks back, a headshot snaps the head back
        if (this.flinch > 0) {
            const f = this.flinch * this.flinch;
            this.body.rotation.x += 0.28 * f;
            this.head.rotation.x -= (this.flinchHead ? 0.6 : 0.15) * f;
            this.flinch = Math.max(0, this.flinch - dt * 5);
        }

        this.animateExtras(dt, state);
        this.updateHurtFlash(dt);
        this.updateDeath(dt);
    }

    setGlow(on) {
        this.glow = on;
    }

    // Red flash when hurt, on top of the angel's golden shine while it lasts
    updateHurtFlash(dt) {
        if (this.hurtTimer <= 0 && !this.flashing && !this.glow) return;
        this.hurtTimer = Math.max(0, this.hurtTimer - dt);
        const k = this.hurtTimer / HURT_TIME;
        const g = this.glow ? 0.3 + 0.18 * Math.sin(this.time * 6) : 0;
        this.flashing = k > 0 || g > 0;
        for (const material of this.materials) {
            const base = material.userData.baseEmissive;
            material.emissive.setRGB(
                Math.min(1, base.r + (1 - base.r) * 0.6 * k + g),
                Math.min(1, base.g * (1 - k) + g * 0.8),
                Math.min(1, base.b * (1 - k) + g * 0.3)
            );
            material.emissiveIntensity = this.flashing ? 1 : material.userData.baseEmissiveIntensity;
        }
    }

    updateDeath(dt) {
        if (this.deathTimer === null) return;
        this.deathTimer += dt;
        const t = Math.min(1, this.deathTimer / DEATH_TIME);
        this.rig.rotation.z = easeOut(t) * Math.PI / 2;
        this.rig.position.y = easeOut(t) * 0.25;
    }

    dispose() {
        this.root.traverse(o => {
            if (o.isMesh && !o.userData.shared) o.geometry.dispose();
        });
        this.materials.forEach(m => {
            m.map?.dispose();
            m.dispose();
        });
    }
}
