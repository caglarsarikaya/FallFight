import { CharacterModel } from './CharacterModel.js';

const COAT = '#3d4a2c';
const COAT_DARK = '#2a3420';
const PANTS = '#262626';
const SKIN = '#e8b48a';
const HAIR = '#1c1410';
const STEEL = '#7d858c';
const JOINT = '#3a3f44';

const SEGMENTS = 7;
const SEGMENT_LENGTH = 0.2;

// Base angles for the four tentacles: two rise over the shoulders, two spread low to the sides
const TENTACLES = [
    { x: -0.14, y: 0.55, rx: 0.5, rz: 0.55, phase: 0 },
    { x: 0.14, y: 0.55, rx: 0.5, rz: -0.55, phase: 1.6 },
    { x: -0.12, y: 0.25, rx: 1.25, rz: 1.0, phase: 3.1 },
    { x: 0.12, y: 0.25, rx: 1.25, rz: -1.0, phase: 4.4 }
];

export class DrOctopusModel extends CharacterModel {
    dimensions() {
        return { torsoW: 0.56, torsoH: 0.74, torsoD: 0.32, head: 0.48 };
    }

    get palette() {
        return { skin: SKIN, shirt: COAT, pants: PANTS, shoes: '#111111', hair: HAIR };
    }

    buildTorso() {
        const { torsoW, torsoH, torsoD } = this.dims;
        this.box(torsoW, torsoH, torsoD, this.mat(COAT), 0, torsoH / 2, 0, this.body);
        // Lapels and the long coat tail over the thighs
        for (const side of [-1, 1]) {
            this.box(0.12, torsoH * 0.5, 0.02, this.mat(COAT_DARK), side * 0.09, torsoH * 0.72, -torsoD / 2 - 0.01, this.body);
        }
        this.box(torsoW + 0.06, 0.42, torsoD + 0.06, this.mat(COAT), 0, -0.17, 0, this.body);
        // Metal harness: belt and back plate the arms grow from
        this.box(torsoW + 0.04, 0.09, torsoD + 0.04, this.mat(STEEL, { metal: true }), 0, 0.08, 0, this.body);
        this.box(torsoW * 0.7, torsoH * 0.7, 0.08, this.mat(STEEL, { metal: true }), 0, torsoH * 0.45, torsoD / 2 + 0.04, this.body);
    }

    buildHead() {
        const h = this.dims.head;
        const front = -h / 2;
        this.box(h, h, h, this.mat(SKIN), 0, h / 2, 0, this.head);
        // Bowl haircut
        this.box(h + 0.04, 0.12, h + 0.04, this.mat(HAIR), 0, h + 0.03, 0, this.head);
        this.box(h + 0.04, h * 0.55, 0.06, this.mat(HAIR), 0, h * 0.72, h / 2, this.head);
        for (const side of [-1, 1]) {
            this.box(0.05, h * 0.42, h + 0.02, this.mat(HAIR), side * (h / 2 + 0.01), h * 0.75, 0.01, this.head);
        }
        this.box(h + 0.04, 0.08, 0.05, this.mat(HAIR), 0, h * 0.94, front - 0.01, this.head); // fringe
        // Round dark goggles
        for (const side of [-1, 1]) {
            const rim = this.cylinder(0.085, 0.04, this.mat(STEEL, { metal: true }), side * 0.11, h * 0.6, front - 0.02, this.head, 16);
            rim.rotation.x = Math.PI / 2;
            const lens = this.cylinder(0.065, 0.045, this.mat('#0c0c0c', { metal: true }), side * 0.11, h * 0.6, front - 0.025, this.head, 16);
            lens.rotation.x = Math.PI / 2;
        }
        this.box(0.08, 0.02, 0.02, this.mat(STEEL), 0, h * 0.62, front - 0.03, this.head);
        this.box(0.16, 0.03, 0.01, this.mat('#7a3b2a'), 0.02, h * 0.25, front - 0.005, this.head); // smirk
    }

    buildExtras() {
        const { torsoD } = this.dims;
        this.prongs = [];
        this.tentacles = TENTACLES.map(spec => {
            const base = this.pivot(spec.x, spec.y, torsoD / 2 + 0.08, this.body);
            base.rotation.set(spec.rx, 0, spec.rz);
            const joints = [];
            let parent = base;
            for (let i = 0; i < SEGMENTS; i++) {
                const joint = this.pivot(0, 0, 0, parent);
                this.box(0.09, 0.09, 0.09, this.mat(JOINT, { metal: true }), 0, 0, 0, joint);
                const radius = 0.05 - i * 0.003;
                this.cylinder(radius, SEGMENT_LENGTH, this.mat(STEEL, { metal: true }), 0, SEGMENT_LENGTH / 2, 0, joint, 8);
                const next = this.pivot(0, SEGMENT_LENGTH, 0, joint);
                joints.push(joint);
                parent = next;
            }
            // Three-pronged claw with a red sensor light
            for (let p = 0; p < 3; p++) {
                const prong = this.pivot(0, 0, 0, parent);
                prong.rotation.set(0.5, (p / 3) * Math.PI * 2, 0);
                this.box(0.035, 0.16, 0.035, this.mat(STEEL, { metal: true }), 0, 0.08, 0, prong);
                this.prongs.push(prong);
            }
            this.box(0.06, 0.06, 0.06, this.mat('#ff2a2a', { emissive: '#ff2a2a', emissiveIntensity: 1.6 }), 0, 0.02, 0, parent);
            return { base, joints, spec };
        });
    }

    animateExtras(_dt, state) {
        const attacking = this.action?.name === 'swing';
        const strike = attacking ? Math.sin(Math.min(1, this.action.t) * Math.PI) : 0;
        const urgency = state.speed > 0.5 ? 1.6 : 1;

        this.tentacles.forEach(({ base, joints, spec }, index) => {
            // Front pair lunges forward over the shoulders when he attacks
            const lunge = index < 2 ? strike : strike * 0.3;
            base.rotation.x = spec.rx - lunge * 1.4;
            joints.forEach((joint, i) => {
                const wave = Math.sin(this.time * 2.2 * urgency + spec.phase + i * 0.7);
                joint.rotation.x = wave * 0.18 - lunge * 0.12;
                joint.rotation.z = Math.cos(this.time * 1.7 + spec.phase + i * 0.5) * 0.12;
            });
        });
        const pinch = 0.5 + Math.sin(this.time * 4) * 0.15 + strike * 0.4;
        for (const prong of this.prongs) prong.rotation.x = pinch;
    }
}
