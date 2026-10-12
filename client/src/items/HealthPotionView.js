import * as THREE from 'three';
import { ItemView } from './ItemView.js';
import { drawPixelArt } from '../world/textures.js';

const ICON = [
    '................',
    '.......kk.......',
    '......kKKk......',
    '.......gg.......',
    '.......gg.......',
    '......g..g......',
    '.....g....g.....',
    '....gppppppg....',
    '....gpPppppg....',
    '....gpPppppg....',
    '....gppppppg....',
    '....gppppppg....',
    '.....gppppg.....',
    '......gggg......',
    '................',
    '................'
];
const ICON_PALETTE = { k: '#7a4a22', K: '#a06a35', g: '#d6e6f2', p: '#e8336f', P: '#ff9ec0' };

export class HealthPotionView extends ItemView {
    constructor() {
        super('health_potion');
    }

    createModel() {
        const group = new THREE.Group();
        const glass = new THREE.MeshStandardMaterial({ color: '#dbeaf7', transparent: true, opacity: 0.35, roughness: 0.1 });
        const liquid = new THREE.MeshStandardMaterial({ color: '#e8336f', emissive: '#a0103e', emissiveIntensity: 0.6, roughness: 0.3 });
        ItemView.box(group, 0.2, 0.2, 0.2, glass, 0, 0.1, 0);
        ItemView.box(group, 0.17, 0.15, 0.17, liquid, 0, 0.085, 0);
        ItemView.box(group, 0.08, 0.1, 0.08, glass, 0, 0.25, 0);
        ItemView.box(group, 0.07, 0.06, 0.07, ItemView.material('#7a4a22'), 0, 0.32, 0);
        return group;
    }

    get firstPersonPose() {
        return { position: [0.35, -0.38, -0.6], rotation: [0.1, -0.3, 0], scale: 1.2 };
    }

    get thirdPersonPose() {
        return { position: [0, -0.05, 0], rotation: [0, 0, 0], scale: 0.9 };
    }

    applyFirstPersonAnimation(model, { action, t }) {
        if (action !== 'drink') return;
        const lift = Math.sin(t * Math.PI);
        model.position.x -= lift * 0.3;
        model.position.y += lift * 0.25;
        model.rotation.x += lift * 1.2;
    }

    drawIcon(ctx, size) {
        drawPixelArt(ctx, ICON, ICON_PALETTE, size);
    }
}
