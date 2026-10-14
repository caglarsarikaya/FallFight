import * as THREE from 'three';
import { CharacterModel } from './CharacterModel.js';

const SKIN = '#eec39a';
const SKIN_SHINE = '#fbdcc0';
const HAIR = '#3a2a1e';
const KHAKI = '#c2a878';
const FRAME = '#111111';

function plaidTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3f6fb5';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = 'rgba(20, 40, 90, 0.6)';
    for (let i = 0; i < 32; i += 8) {
        ctx.fillRect(i, 0, 4, 32);
        ctx.fillRect(0, i, 32, 4);
    }
    ctx.fillStyle = 'rgba(220, 60, 50, 0.8)';
    for (let i = 6; i < 32; i += 8) {
        ctx.fillRect(i, 0, 1, 32);
        ctx.fillRect(0, i, 32, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    return texture;
}

function codeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#04120a';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#39ff6a';
    for (let y = 2; y < 64; y += 6) {
        const indent = ((y * 7) % 4) * 4;
        ctx.fillRect(4 + indent, y, 10 + ((y * 13) % 36), 3);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

export class ProgrammerModel extends CharacterModel {
    dimensions() {
        return { torsoW: 0.54, torsoD: 0.3, head: 0.5 };
    }

    get palette() {
        return { skin: SKIN, shirt: '#3f6fb5', pants: KHAKI, shoes: '#f2f2f2', hair: HAIR };
    }

    buildLegs() {
        super.buildLegs();
        const { legH, legW } = this.dims;
        for (const leg of [this.leftLeg, this.rightLeg]) {
            this.box(legW + 0.03, 0.03, legW + 0.07, this.mat('#d8342c'), 0, -legH + 0.07, -0.02, leg); // sneaker stripe
        }
    }

    buildTorso() {
        const { torsoW, torsoH, torsoD } = this.dims;
        const front = -torsoD / 2;
        this.box(torsoW, torsoH, torsoD, this.mat('#ffffff', { map: plaidTexture() }), 0, torsoH / 2, 0, this.body);
        // Collar points
        for (const side of [-1, 1]) {
            const collar = this.box(0.1, 0.06, 0.02, this.mat('#2c5590'), side * 0.06, torsoH - 0.04, front - 0.01, this.body);
            collar.rotation.z = side * 0.4;
        }
        // Tucked in with a belt
        this.box(torsoW + 0.02, 0.07, torsoD + 0.02, this.mat('#5b3418'), 0, 0.05, 0, this.body);
        this.box(0.08, 0.06, 0.02, this.mat('#a0a6ad', { metal: true }), 0, 0.05, front - 0.015, this.body);
        // Pocket protector stuffed with pens
        this.box(0.13, 0.13, 0.012, this.mat('#ffffff'), -0.12, torsoH * 0.62, front - 0.006, this.body);
        ['#d8342c', '#2246b8', '#111111'].forEach((color, i) => {
            this.box(0.022, 0.1, 0.022, this.mat(color), -0.16 + i * 0.04, torsoH * 0.62 + 0.08, front - 0.016, this.body);
        });
        // Lanyard and ID badge
        for (const side of [-1, 1]) {
            const strap = this.box(0.025, 0.24, 0.01, this.mat('#d8342c'), side * 0.05, torsoH * 0.78, front - 0.008, this.body);
            strap.rotation.z = side * 0.2;
        }
        this.box(0.1, 0.13, 0.012, this.mat('#ffffff'), 0.02, torsoH * 0.52, front - 0.01, this.body);
        this.box(0.04, 0.05, 0.014, this.mat('#9a7a66'), 0, torsoH * 0.53, front - 0.012, this.body);
    }

    buildArms() {
        const { armW, armH } = this.dims;
        const sleeve = 0.26;
        const shirt = this.mat('#ffffff', { map: plaidTexture() });
        for (const arm of [this.leftArm, this.rightArm]) {
            this.box(armW + 0.03, sleeve, armW + 0.03, shirt, 0, -sleeve / 2, 0, arm); // short sleeves
            this.box(armW - 0.03, armH - sleeve, armW - 0.03, this.mat(SKIN), 0, -sleeve - (armH - sleeve) / 2, 0, arm);
        }
        // Chunky digital watch on the left wrist
        this.box(armW + 0.01, 0.07, armW + 0.01, this.mat('#1c1c1c'), 0, -armH + 0.18, 0, this.leftArm);
        this.box(0.08, 0.05, 0.01, this.mat('#9dff9d', { emissive: '#4cff4c', emissiveIntensity: 0.6 }), 0, -armH + 0.18, -(armW + 0.01) / 2 - 0.006, this.leftArm);
    }

    buildHead() {
        const h = this.dims.head;
        const front = -h / 2;
        // Bald and shiny
        this.box(h, h, h, this.mat(SKIN), 0, h / 2, 0, this.head);
        this.box(0.18, 0.012, 0.14, this.mat(SKIN_SHINE), -0.06, h + 0.006, -0.04, this.head);
        // Fringe of hair around the back and sides only
        this.box(h + 0.03, 0.13, 0.05, this.mat(HAIR), 0, h * 0.45, h / 2 + 0.01, this.head);
        for (const side of [-1, 1]) {
            this.box(0.04, 0.13, h * 0.5, this.mat(HAIR), side * (h / 2 + 0.015), h * 0.47, h * 0.24, this.head);
            this.box(0.05, 0.11, 0.08, this.mat(SKIN), side * (h / 2 + 0.025), h * 0.5, -0.02, this.head); // ears
        }
        this.addEyes('#ffffff', '#3b2314', h * 0.56, 0.11);
        // Thick eyebrows, goofy grin with buck teeth
        for (const side of [-1, 1]) {
            this.box(0.13, 0.03, 0.012, this.mat(HAIR), side * 0.11, h * 0.73, front - 0.006, this.head);
        }
        this.box(0.14, 0.025, 0.01, this.mat('#7a3b2a'), 0, h * 0.27, front - 0.005, this.head);
        this.box(0.06, 0.035, 0.012, this.mat('#ffffff'), 0, h * 0.24, front - 0.007, this.head);

        // Big black rectangular glasses
        const z = front - 0.03;
        const y = h * 0.56;
        this.lens = this.mat('#bfe6ff', { transparent: true, opacity: 0.35, emissive: '#ffffff', emissiveIntensity: 0 });
        for (const side of [-1, 1]) {
            const x = side * 0.11;
            this.box(0.18, 0.03, 0.03, this.mat(FRAME), x, y + 0.065, z, this.head);
            this.box(0.18, 0.03, 0.03, this.mat(FRAME), x, y - 0.065, z, this.head);
            this.box(0.03, 0.16, 0.03, this.mat(FRAME), x + side * 0.075, y, z, this.head);
            this.box(0.03, 0.16, 0.03, this.mat(FRAME), x - side * 0.075, y, z, this.head);
            this.box(0.13, 0.1, 0.01, this.lens, x, y, z, this.head);
            this.box(0.02, 0.025, h * 0.6, this.mat(FRAME), side * (h / 2 + 0.01), y + 0.04, front + h * 0.28, this.head); // temples
        }
        this.box(0.06, 0.025, 0.025, this.mat(FRAME), 0, y + 0.03, z, this.head); // bridge
    }

    buildExtras() {
        const { torsoW, torsoH, torsoD } = this.dims;
        // Laptop strapped to his back, screen out, code scrolling
        const back = torsoD / 2;
        this.box(0.42, 0.32, 0.04, this.mat('#5a5f66', { metal: true }), 0, torsoH * 0.55, back + 0.03, this.body);
        this.code = codeTexture();
        const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(0.36, 0.26),
            this.mat('#ffffff', { map: this.code, emissive: '#1a5a2a', emissiveIntensity: 0.6 })
        );
        screen.position.set(0, torsoH * 0.55, back + 0.052);
        this.body.add(screen);
        for (const side of [-1, 1]) {
            this.box(0.05, torsoH + 0.02, torsoD + 0.03, this.mat('#2b2b2b'), side * torsoW * 0.42, torsoH * 0.5, 0.005, this.body); // straps
        }
    }

    animateExtras() {
        this.code.offset.y = (this.time * 0.25) % 1;
        // Glasses catch the light every few seconds
        const t = this.time % 3.2;
        this.lens.emissiveIntensity = t < 0.18 ? Math.sin((t / 0.18) * Math.PI) * 0.9 : 0;
    }
}
