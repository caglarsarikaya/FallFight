import { CharacterModel } from './CharacterModel.js';

const METAL = '#9aa4ad';
const DARK = '#3d4650';
const ACCENT = '#ffb000';

export class RobotModel extends CharacterModel {
    dimensions() {
        return { legW: 0.26, torsoW: 0.58, torsoD: 0.34, armW: 0.22, head: 0.5 };
    }

    get palette() {
        return { skin: METAL, shirt: METAL, pants: DARK, shoes: DARK, hair: DARK };
    }

    buildLegs() {
        const { legH, legW } = this.dims;
        for (const leg of [this.leftLeg, this.rightLeg]) {
            this.box(legW, legH - 0.14, legW, this.mat(DARK, { metal: true }), 0, -(legH - 0.14) / 2, 0, leg);
            this.box(legW + 0.04, 0.12, legW + 0.03, this.mat(METAL, { metal: true }), 0, -legH * 0.42, -0.01, leg); // knee plate
            this.box(legW + 0.06, 0.14, legW + 0.12, this.mat(METAL, { metal: true }), 0, -legH + 0.07, -0.04, leg); // foot
        }
    }

    buildTorso() {
        const { torsoW, torsoH, torsoD } = this.dims;
        this.box(torsoW, torsoH, torsoD, this.mat(METAL, { metal: true }), 0, torsoH / 2, 0, this.body);
        this.box(torsoW * 0.62, torsoH * 0.45, 0.02, this.mat(DARK), 0, torsoH * 0.6, -torsoD / 2 - 0.01, this.body);
        this.leds = ['#39ff6a', '#ffd23f', '#ff4141'].map((color, i) =>
            this.box(0.06, 0.06, 0.02, this.mat(color, { emissive: color, emissiveIntensity: 1.2 }),
                -0.1 + i * 0.1, torsoH * 0.66, -torsoD / 2 - 0.025, this.body));
        this.box(torsoW + 0.02, 0.06, torsoD + 0.02, this.mat(ACCENT), 0, 0.04, 0, this.body); // belt stripe
    }

    buildArms() {
        const { armW, armH } = this.dims;
        for (const arm of [this.leftArm, this.rightArm]) {
            this.box(armW + 0.08, 0.16, armW + 0.08, this.mat(ACCENT), 0, -0.06, 0, arm); // shoulder pad
            this.box(armW, armH - 0.16, armW, this.mat(METAL, { metal: true }), 0, -(armH - 0.16) / 2, 0, arm);
            this.box(armW + 0.02, 0.06, armW + 0.02, this.mat(DARK), 0, -armH * 0.5, 0, arm); // elbow
            this.box(0.07, 0.14, armW, this.mat(DARK, { metal: true }), -0.06, -armH + 0.05, 0, arm); // clamp
            this.box(0.07, 0.14, armW, this.mat(DARK, { metal: true }), 0.06, -armH + 0.05, 0, arm);
        }
    }

    buildHead() {
        const h = this.dims.head;
        const front = -h / 2 - 0.01;
        this.box(h, h, h, this.mat(METAL, { metal: true }), 0, h / 2, 0, this.head);
        this.visor = this.box(h * 0.84, 0.12, 0.02, this.mat('#29e6ff', { emissive: '#29e6ff', emissiveIntensity: 1.5 }), 0, h * 0.6, front, this.head);
        for (let i = 0; i < 3; i++) {
            this.box(h * 0.4, 0.025, 0.02, this.mat(DARK), 0, h * 0.28 - i * 0.05, front, this.head); // mouth grill
        }
        for (const side of [-1, 1]) {
            const bolt = this.cylinder(0.06, 0.06, this.mat(ACCENT), side * (h / 2 + 0.03), h * 0.5, 0, this.head);
            bolt.rotation.z = Math.PI / 2;
        }
        this.cylinder(0.015, 0.22, this.mat(DARK), 0.12, h + 0.11, 0, this.head);
        this.antennaLight = this.box(0.07, 0.07, 0.07, this.mat('#ff3030', { emissive: '#ff3030', emissiveIntensity: 1.5 }), 0.12, h + 0.24, 0, this.head);
    }

    animateExtras() {
        const blink = Math.sin(this.time * 6) > 0;
        this.antennaLight.material.emissiveIntensity = blink ? 2 : 0.2;
        this.leds.forEach((led, i) => {
            led.material.emissiveIntensity = Math.sin(this.time * 3 + i * 2) > 0 ? 1.4 : 0.2;
        });
    }
}
