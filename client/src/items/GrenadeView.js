import * as THREE from 'three';
import { ItemView } from './ItemView.js';
import { drawPixelArt } from '../world/textures.js';

// HE: an olive egg with a steel spoon and pin. Smoke: a grey can with a green band.
const LOOKS = {
    hegrenade: {
        body: '#4b5a32', band: '#2c3620', top: '#8b9096',
        icon: [
            '................',
            '.........ss.....',
            '.......sssss....',
            '......sSs..s....',
            '......ss...s....',
            '.....oooo.......',
            '....oOoooo......',
            '...oOoooooo.....',
            '...oOdddddo.....',
            '...oooooooo.....',
            '...oOoooooo.....',
            '...oooooooo.....',
            '....oooooo......',
            '.....oooo.......',
            '................',
            '................'
        ]
    },
    smokegrenade: {
        body: '#7b8086', band: '#4f7a3a', top: '#2b2d31',
        icon: [
            '................',
            '.........ss.....',
            '.......sssss....',
            '......sss..s....',
            '.....kkkkk.s....',
            '....gGggggg.....',
            '....gGggggg.....',
            '....bbbbbbb.....',
            '....gGggggg.....',
            '....gGggggg.....',
            '....gGggggg.....',
            '....gGggggg.....',
            '....kkkkkkk.....',
            '................',
            '................',
            '................'
        ]
    }
};
const PALETTE = { s: '#a3a9ae', S: '#d0d4d8', o: '#4b5a32', O: '#6c7d48', d: '#2c3620', g: '#7b8086', G: '#a3a8ad', b: '#4f7a3a', k: '#2b2d31' };

export class GrenadeView extends ItemView {
    constructor(itemId) {
        super(itemId);
        this.look = LOOKS[itemId];
    }

    createModel() {
        const { body, band, top } = this.look;
        const group = new THREE.Group();
        const round = this.itemId === 'hegrenade';
        ItemView.box(group, round ? 0.1 : 0.09, round ? 0.12 : 0.15, round ? 0.1 : 0.09, ItemView.material(body), 0, 0.06, 0);
        ItemView.box(group, round ? 0.105 : 0.095, 0.02, round ? 0.105 : 0.095, ItemView.material(band), 0, round ? 0.06 : 0.09, 0);
        ItemView.box(group, 0.05, 0.035, 0.05, ItemView.material(top), 0, round ? 0.135 : 0.15, 0);
        // Spoon down the side, ring on top
        ItemView.box(group, 0.02, 0.1, 0.012, ItemView.material('#a3a9ae'), 0.04, 0.09, 0.045);
        ItemView.box(group, 0.035, 0.008, 0.035, ItemView.material('#d0d4d8'), -0.02, 0.165, 0);
        return group;
    }

    get firstPersonPose() {
        return { position: [0.3, -0.3, -0.5], rotation: [0.2, -0.4, 0], scale: 1.3 };
    }

    get thirdPersonPose() {
        return { position: [0, -0.06, 0], rotation: [0, 0, 0], scale: 1 };
    }

    // Wind up and throw overhand
    applyFirstPersonAnimation(model, { action, t }) {
        // Gone from the hand once it's thrown (until the next one is drawn)
        model.visible = action !== 'throw' || t < 0.55;
        if (action !== 'throw') return;
        const wind = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
        model.position.y += wind * 0.18 - (t > 0.35 ? (t - 0.35) * 0.6 : 0);
        model.position.z += t > 0.35 ? -(t - 0.35) * 0.8 : wind * 0.1;
        model.rotation.x -= wind * 0.9;
    }

    drawIcon(ctx, size) {
        drawPixelArt(ctx, this.look.icon, PALETTE, size);
    }
}
