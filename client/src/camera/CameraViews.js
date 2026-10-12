import * as THREE from 'three';

// Camera strategies. Each places the camera for the local player's eye and look angles.

export class FirstPersonView {
    constructor() {
        this.id = 'first';
        this.label = 'First person';
        this.showsOwnBody = false;
        this.showsViewModel = true;
        this.closeToEye = true;
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

    // Over the shoulder, looking where the player looks; pulled in when a block is in the way
    apply(camera, { eye, yaw, pitch, arena }) {
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        this.offset.set(this.shoulder, this.height, this.distance).applyEuler(camera.rotation);
        let scale = 1;
        if (arena) {
            const length = this.offset.length();
            const dir = { x: this.offset.x / length, y: this.offset.y / length, z: this.offset.z / length };
            const hit = arena.raycast(eye, dir, length + 0.3);
            if (hit) scale = Math.max(0.1, (hit.distance - 0.3) / length);
        }
        camera.position.set(eye.x + this.offset.x * scale, eye.y + this.offset.y * scale, eye.z + this.offset.z * scale);
        // Pushed right up against our own head: the body would fill the screen
        this.closeToEye = this.offset.length() * scale < 1.1;
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
