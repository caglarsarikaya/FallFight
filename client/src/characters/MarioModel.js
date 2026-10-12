import * as THREE from 'three';
import { CharacterModel } from './CharacterModel.js';

const RED = '#e0201b';
const BLUE = '#1d4ed8';
const SKIN = '#f5c08e';
const BROWN = '#5b3418';
const HAIR = '#3b2314';

function emblemTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = RED;
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', 16, 17);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

export class MarioModel extends CharacterModel {
    dimensions() {
        return { legH: 0.68, torsoW: 0.56, torsoH: 0.68, torsoD: 0.32, head: 0.5 };
    }

    get palette() {
        return { skin: SKIN, shirt: RED, pants: BLUE, shoes: BROWN, hair: HAIR };
    }

    buildLegs() {
        const { legH, legW } = this.dims;
        for (const leg of [this.leftLeg, this.rightLeg]) {
            this.box(legW, legH - 0.12, legW, this.mat(BLUE), 0, -(legH - 0.12) / 2, 0, leg);
            this.box(legW + 0.04, 0.13, legW + 0.14, this.mat(BROWN), 0, -legH + 0.065, -0.05, leg);
        }
    }

    buildTorso() {
        const { torsoW, torsoH, torsoD } = this.dims;
        this.box(torsoW, torsoH, torsoD, this.mat(RED), 0, torsoH / 2, 0, this.body);
        // Overalls: lower half, bib and straps
        this.box(torsoW + 0.01, torsoH * 0.38, torsoD + 0.01, this.mat(BLUE), 0, torsoH * 0.19, 0, this.body);
        this.box(torsoW * 0.55, torsoH * 0.32, 0.02, this.mat(BLUE), 0, torsoH * 0.5, -torsoD / 2 - 0.01, this.body);
        for (const side of [-1, 1]) {
            this.box(0.08, torsoH * 0.3, torsoD + 0.02, this.mat(BLUE), side * torsoW * 0.22, torsoH * 0.78, 0, this.body);
            this.box(0.07, 0.07, 0.02, this.mat('#ffd23f'), side * torsoW * 0.2, torsoH * 0.6, -torsoD / 2 - 0.025, this.body);
        }
    }

    buildArms() {
        const { armW, armH } = this.dims;
        for (const arm of [this.leftArm, this.rightArm]) {
            this.box(armW, armH - 0.16, armW, this.mat(RED), 0, -(armH - 0.16) / 2, 0, arm);
            this.box(armW + 0.05, 0.17, armW + 0.05, this.mat('#ffffff'), 0, -armH + 0.08, 0, arm); // glove
        }
    }

    buildHead() {
        const h = this.dims.head;
        const front = -h / 2;
        this.box(h, h, h, this.mat(SKIN), 0, h / 2, 0, this.head);
        this.addEyes('#ffffff', '#2246b8', h * 0.62, 0.1);
        // Nose, mustache, hair
        this.box(0.12, 0.11, 0.1, this.mat('#f0a87a'), 0, h * 0.44, front - 0.05, this.head);
        this.box(0.32, 0.07, 0.04, this.mat(HAIR), 0, h * 0.32, front - 0.02, this.head);
        this.box(h + 0.02, h * 0.36, 0.08, this.mat(HAIR), 0, h * 0.62, h / 2 - 0.03, this.head);
        for (const side of [-1, 1]) {
            this.box(0.04, 0.16, 0.12, this.mat(HAIR), side * (h / 2 + 0.01), h * 0.55, 0.06, this.head);
        }
        // Cap with brim and emblem
        this.box(h + 0.06, 0.16, h + 0.06, this.mat(RED), 0, h + 0.06, 0.01, this.head);
        this.box(h * 0.9, 0.04, 0.18, this.mat(RED), 0, h - 0.01, front - 0.1, this.head);
        const emblem = new THREE.Mesh(
            new THREE.PlaneGeometry(0.16, 0.16),
            this.mat('#ffffff', { map: emblemTexture(), transparent: true })
        );
        emblem.position.set(0, h + 0.07, front - 0.04);
        emblem.rotation.y = Math.PI;
        this.head.add(emblem);
    }
}
