import * as THREE from 'three';

// Visual side of a shared Item: its 3D model (held in first person, in a character's hand, or as
// a world pickup), its first-person animation and its hotbar icon.
// Models are built with the grip at the origin and the item's "up" along +Y.
export class ItemView {
    constructor(itemId) {
        this.itemId = itemId;
    }

    createModel() {
        throw new Error(`${this.constructor.name} must implement createModel()`);
    }

    // Position/rotation relative to the camera
    get firstPersonPose() {
        return { position: [0.42, -0.42, -0.65], rotation: [0, 0, 0], scale: 1 };
    }

    // Position/rotation relative to CharacterModel.handAnchor (arm hanging down, -Y along the arm)
    get thirdPersonPose() {
        return { position: [0, 0, 0], rotation: [-Math.PI / 2, 0, 0], scale: 0.85 };
    }

    createFirstPerson() {
        return this.posed(this.firstPersonPose);
    }

    createThirdPerson() {
        return this.posed(this.thirdPersonPose);
    }

    posed({ position, rotation, scale }) {
        const holder = new THREE.Group();
        const model = this.createModel();
        model.position.set(...position);
        model.rotation.set(...rotation);
        model.scale.setScalar(scale);
        holder.add(model);
        holder.userData.model = model;
        holder.userData.pose = { position, rotation, scale };
        return holder;
    }

    // state: { action: 'swing'|'shoot'|'drink'|null, t: 0..1, draw: 0..1 }. Called every frame.
    animateFirstPerson(holder, state) {
        const model = holder.userData.model;
        const { position, rotation } = holder.userData.pose;
        model.position.set(...position);
        model.rotation.set(...rotation);
        this.applyFirstPersonAnimation(model, state);
    }

    applyFirstPersonAnimation(_model, _state) {}

    // Pixel-art hotbar icon
    drawIcon(_ctx, _size) {}

    // Helpers
    static material(color, options = {}) {
        return new THREE.MeshLambertMaterial({ color, ...options });
    }

    static box(group, w, h, d, material, x = 0, y = 0, z = 0) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        group.add(mesh);
        return mesh;
    }

    static pixel(ctx, size, x, y, color) {
        const s = size / 16;
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor(x * s), Math.floor(y * s), Math.ceil(s), Math.ceil(s));
    }
}
