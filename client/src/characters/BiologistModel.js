import { CharacterModel } from './CharacterModel.js';

const COAT = '#f4f6f8';
const COAT_SHADE = '#d4d9e0';
const BLOUSE = '#7c5cbf';
const PANTS = '#2f4f5a';
const SKIN = '#f0c4a0';
const HAIR = '#7a3b1e';
const GLOVE = '#8ec9f0';
const SERUM = '#5dff7a';

export class BiologistModel extends CharacterModel {
    dimensions() {
        return { legW: 0.22, hipX: 0.12, torsoW: 0.48, torsoH: 0.7, torsoD: 0.26, armW: 0.18, head: 0.44 };
    }

    get palette() {
        return { skin: SKIN, shirt: COAT, pants: PANTS, shoes: '#1a1a1a', hair: HAIR };
    }

    buildTorso() {
        const { torsoW, torsoH, torsoD } = this.dims;
        const front = -(torsoD + 0.04) / 2;
        // Lab coat with the blouse showing through the open front
        this.box(torsoW + 0.04, torsoH, torsoD + 0.04, this.mat(COAT), 0, torsoH / 2, 0, this.body);
        this.box(0.12, torsoH * 0.8, 0.01, this.mat(BLOUSE), 0, torsoH * 0.6, front - 0.005, this.body);
        for (const side of [-1, 1]) {
            const lapel = this.box(0.07, torsoH * 0.45, 0.015, this.mat(COAT_SHADE), side * 0.09, torsoH * 0.72, front - 0.01, this.body);
            lapel.rotation.z = -side * 0.25;
        }
        // Long coat tail over the thighs, split down the front
        this.box(torsoW + 0.06, 0.4, torsoD + 0.06, this.mat(COAT), 0, -0.18, 0, this.body);
        this.box(0.02, 0.4, 0.01, this.mat(COAT_SHADE), 0, -0.18, -(torsoD + 0.06) / 2 - 0.005, this.body);
        // Breast pocket with a pen, ID badge on the other side
        this.box(0.13, 0.11, 0.012, this.mat(COAT_SHADE), -0.13, torsoH * 0.62, front - 0.006, this.body);
        this.box(0.025, 0.12, 0.025, this.mat('#2246b8'), -0.17, torsoH * 0.68, front - 0.015, this.body);
        this.box(0.09, 0.12, 0.01, this.mat('#ffffff'), 0.13, torsoH * 0.62, front - 0.006, this.body);
        this.box(0.09, 0.03, 0.012, this.mat('#2a8fd8'), 0.13, torsoH * 0.62 + 0.045, front - 0.008, this.body);
        this.box(0.035, 0.04, 0.012, this.mat('#9a7a66'), 0.13, torsoH * 0.6, front - 0.008, this.body);
    }

    buildArms() {
        const { armW, armH } = this.dims;
        for (const arm of [this.leftArm, this.rightArm]) {
            this.box(armW + 0.02, armH - 0.14, armW + 0.02, this.mat(COAT), 0, -(armH - 0.14) / 2, 0, arm);
            this.box(armW - 0.02, 0.14, armW - 0.02, this.mat(GLOVE), 0, -armH + 0.07, 0, arm); // nitrile gloves
        }
    }

    buildHead() {
        const h = this.dims.head;
        const front = -h / 2;
        this.box(h, h, h, this.mat(SKIN), 0, h / 2, 0, this.head);
        this.addEyes('#ffffff', '#3a6b3a', h * 0.55, 0.095);
        for (const side of [-1, 1]) {
            this.box(0.1, 0.02, 0.012, this.mat('#2a1a10'), side * 0.095, h * 0.66, front - 0.007, this.head); // lashes
        }
        this.box(0.1, 0.03, 0.01, this.mat('#c4566b'), 0, h * 0.25, front - 0.005, this.head); // lips
        // Long hair: cap, fringe, sides and back down to the shoulders
        this.box(h + 0.04, 0.1, h + 0.04, this.mat(HAIR), 0, h + 0.03, 0, this.head);
        this.box(h + 0.04, 0.07, 0.05, this.mat(HAIR), 0, h * 0.92, front - 0.01, this.head);
        this.box(h + 0.04, h * 0.95, 0.06, this.mat(HAIR), 0, h * 0.55, h / 2 + 0.01, this.head);
        for (const side of [-1, 1]) {
            this.box(0.05, h * 0.75, h + 0.02, this.mat(HAIR), side * (h / 2 + 0.01), h * 0.6, 0.01, this.head);
        }
        // Safety goggles pushed up onto the hair
        this.box(h + 0.06, 0.03, h + 0.06, this.mat('#2b2b2b'), 0, h + 0.03, 0, this.head);
        this.box(h * 0.8, 0.08, 0.04, this.mat('#bfe6ff', { transparent: true, opacity: 0.55 }), 0, h + 0.04, front - 0.03, this.head);
    }

    buildExtras() {
        const { torsoH, torsoD } = this.dims;
        const h = this.dims.head;
        // Glowing sample in a test tube, clipped in the pocket
        const z = -(torsoD + 0.04) / 2 - 0.03;
        this.cylinder(0.024, 0.17, this.mat('#ffffff', { transparent: true, opacity: 0.45 }), -0.1, torsoH * 0.7, z, this.body, 10);
        this.serum = this.mat(SERUM, { emissive: SERUM, emissiveIntensity: 1.2 });
        this.cylinder(0.019, 0.09, this.serum, -0.1, torsoH * 0.66, z, this.body, 10);
        this.cylinder(0.027, 0.03, this.mat('#d8342c'), -0.1, torsoH * 0.7 + 0.095, z, this.body, 10);

        // Ponytail hanging from the back of the head
        this.ponytail = this.pivot(0, h * 0.8, h / 2 + 0.04, this.head);
        this.box(0.09, 0.05, 0.08, this.mat('#c4566b'), 0, 0, 0, this.ponytail); // hair tie
        this.box(0.12, 0.34, 0.1, this.mat(HAIR), 0, -0.19, 0.02, this.ponytail);
    }

    animateExtras(_dt, state) {
        this.serum.emissiveIntensity = 1 + Math.sin(this.time * 3) * 0.5;
        const sway = Math.min((state.speed || 0) / 4.6, 1);
        this.ponytail.rotation.x = 0.15 + sway * 0.45 + Math.sin(this.walkPhase * 2) * 0.12 * sway;
        this.ponytail.rotation.z = Math.sin(this.time * 1.5) * 0.06 + Math.sin(this.walkPhase) * 0.2 * sway;
    }
}
