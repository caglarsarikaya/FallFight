import * as THREE from 'three';
import { ItemView } from './ItemView.js';
import { drawPixelArt } from '../world/textures.js';

// The Zombies angel in slot 8: a gold halo over a pair of small white wings
const ICON = [
    '................',
    '.....yyyyyy.....',
    '....y......y....',
    '.....yyyyyy.....',
    '................',
    '.ww..........ww.',
    'wWww........wwWw',
    'wWWww......wwWWw',
    '.wWWww....wwWWw.',
    '..wWWwwwwwwWWw..',
    '...wwWWwwWWww...',
    '....wwwwwwww....',
    '.....ww..ww.....',
    '................',
    '................',
    '................'
];
const ICON_PALETTE = { y: '#ffd23f', w: '#ffffff', W: '#d8e4f0' };

export class GodModeView extends ItemView {
    constructor() {
        super('godmode');
    }

    createModel() {
        const group = new THREE.Group();
        const gold = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb000', emissiveIntensity: 0.8, roughness: 0.3 });
        const white = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#c8d8ff', emissiveIntensity: 0.4, roughness: 0.6 });
        for (const [w, d, x, z] of [[0.24, 0.04, 0, 0.1], [0.24, 0.04, 0, -0.1], [0.04, 0.16, 0.1, 0], [0.04, 0.16, -0.1, 0]]) {
            ItemView.box(group, w, 0.04, d, gold, x, 0.24, z);
        }
        for (const side of [-1, 1]) {
            for (let i = 0; i < 3; i++) {
                const w = 0.2 - i * 0.05;
                ItemView.box(group, w, 0.05, 0.03, white, side * (0.06 + w / 2), 0.06 - i * 0.055, 0);
            }
        }
        return group;
    }

    get firstPersonPose() {
        return { position: [0.35, -0.36, -0.6], rotation: [0.2, -0.3, 0], scale: 1.2 };
    }

    get thirdPersonPose() {
        return { position: [0, -0.05, 0], rotation: [0, 0, 0], scale: 0.9 };
    }

    // Raised up high when used
    applyFirstPersonAnimation(model, { action, t }) {
        if (action !== 'angel') return;
        const lift = Math.sin(t * Math.PI);
        model.position.x -= lift * 0.25;
        model.position.y += lift * 0.35;
        model.rotation.y += t * Math.PI * 2;
    }

    drawIcon(ctx, size) {
        drawPixelArt(ctx, ICON, ICON_PALETTE, size);
    }
}
