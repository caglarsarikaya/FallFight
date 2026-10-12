import { CharacterModel } from './CharacterModel.js';

const FUR = '#a0582c';
const FUR_DARK = '#7a3f1c';
const BELLY = '#f0d6aa';

export class SquirrelModel extends CharacterModel {
    dimensions() {
        return { legH: 0.55, legW: 0.22, torsoW: 0.48, torsoH: 0.62, torsoD: 0.32, armW: 0.17, armH: 0.56, head: 0.5 };
    }

    get palette() {
        return { skin: FUR, shirt: FUR, pants: FUR, shoes: BELLY, hair: FUR_DARK };
    }

    buildTorso() {
        const { torsoW, torsoH, torsoD } = this.dims;
        this.box(torsoW, torsoH, torsoD, this.mat(FUR), 0, torsoH / 2, 0, this.body);
        this.box(torsoW * 0.66, torsoH * 0.8, 0.02, this.mat(BELLY), 0, torsoH * 0.45, -torsoD / 2 - 0.01, this.body);
    }

    buildArms() {
        const { armW, armH } = this.dims;
        for (const arm of [this.leftArm, this.rightArm]) {
            this.box(armW, armH - 0.1, armW, this.mat(FUR), 0, -(armH - 0.1) / 2, 0, arm);
            this.box(armW + 0.02, 0.1, armW + 0.02, this.mat(FUR_DARK), 0, -armH + 0.05, 0, arm); // paw
        }
    }

    buildHead() {
        const h = this.dims.head;
        const front = -h / 2;
        this.box(h, h * 0.9, h, this.mat(FUR), 0, h * 0.45, 0, this.head);
        // Muzzle with cheeks, nose and buck teeth
        this.box(h * 0.62, h * 0.32, 0.14, this.mat(BELLY), 0, h * 0.24, front - 0.06, this.head);
        this.box(0.1, 0.07, 0.03, this.mat('#2a1a12'), 0, h * 0.37, front - 0.14, this.head);
        this.box(0.05, 0.08, 0.02, this.mat('#ffffff'), -0.028, h * 0.06, front - 0.12, this.head);
        this.box(0.05, 0.08, 0.02, this.mat('#ffffff'), 0.028, h * 0.06, front - 0.12, this.head);
        // Big shiny eyes
        for (const side of [-1, 1]) {
            this.box(0.11, 0.12, 0.01, this.mat('#111111'), side * 0.13, h * 0.58, front - 0.005, this.head);
            this.box(0.04, 0.04, 0.012, this.mat('#ffffff'), side * 0.13 + 0.03, h * 0.62, front - 0.01, this.head);
        }
        // Ears with pink insides
        for (const side of [-1, 1]) {
            const ear = this.pivot(side * h * 0.3, h * 0.9, 0, this.head);
            this.box(0.13, 0.22, 0.06, this.mat(FUR_DARK), 0, 0.1, 0, ear);
            this.box(0.07, 0.13, 0.01, this.mat('#f2a0a8'), 0, 0.09, -0.035, ear);
            ear.rotation.z = side * -0.2;
        }
    }

    // A big fluffy tail curling up the back
    buildExtras() {
        const { torsoD } = this.dims;
        this.tail = [];
        let parent = this.pivot(0, 0.12, torsoD / 2 + 0.02, this.body);
        parent.rotation.x = -0.9;
        const sizes = [0.2, 0.28, 0.34, 0.36, 0.32];
        sizes.forEach((size, i) => {
            const color = i % 2 ? FUR : FUR_DARK;
            this.box(size, 0.26, size, this.mat(color), 0, 0.13, 0, parent);
            const next = this.pivot(0, 0.24, 0, parent);
            next.rotation.x = i < 2 ? 0.55 : 0.35;
            this.tail.push(parent);
            parent = next;
        });
        // Fluffy tip
        this.box(0.3, 0.2, 0.3, this.mat(BELLY), 0, 0.08, 0, parent);
    }

    animateExtras(_dt, state) {
        const wag = Math.sin(this.time * (state.speed > 0.5 ? 9 : 3));
        this.tail.forEach((segment, i) => {
            segment.rotation.z = wag * 0.08 * (i + 1);
        });
    }
}
