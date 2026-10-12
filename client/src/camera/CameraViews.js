import * as THREE from 'three';

// Camera strategies. Each places the camera for the local player's eye and look angles.

export class FirstPersonView {
    constructor() {
        this.id = 'first';
        this.label = 'First person';
        this.showsOwnBody = false;
        this.showsViewModel = true;
    }

    apply(camera, { eye, yaw, pitch }) {
        camera.position.set(eye.x, eye.y, eye.z);
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }
}

export class ThirdPersonView {
    constructor({ distance = 4, height = 0.5, shoulder = 0.7 } = {}) {
        this.id = 'third';
        this.label = 'Third person';
        this.showsOwnBody = true;
        this.showsViewModel = false;
        this.distance = distance;
        this.height = height;
        this.shoulder = shoulder;
        this.offset = new THREE.Vector3();
    }

    // Over the shoulder, looking where the player looks
    apply(camera, { eye, yaw, pitch }) {
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        this.offset.set(this.shoulder, this.height, this.distance).applyEuler(camera.rotation);
        camera.position.set(eye.x + this.offset.x, Math.max(eye.y + this.offset.y, -30), eye.z + this.offset.z);
    }
}

export class CameraController {
    constructor(camera, mode = 'first') {
        this.camera = camera;
        this.views = [new FirstPersonView(), new ThirdPersonView()];
        this.setMode(mode);
    }

    setMode(mode) {
        this.view = this.views.find(v => v.id === mode) || this.views[0];
    }

    toggle() {
        const index = this.views.indexOf(this.view);
        this.view = this.views[(index + 1) % this.views.length];
        return this.view;
    }

    update(target) {
        this.view.apply(this.camera, target);
    }
}
