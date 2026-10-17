import { ZOMBIES } from '../../shared/modes/zombies/config.js';
import { CharacterModel } from './CharacterModel.js';

// A shambling zombie: grey-green skin, torn shirt, arms reaching forward, glowing eyes.
// Kept to a handful of boxes: a wave can have two dozen of these on screen.
export class ZombieModel extends CharacterModel {
    get palette() {
        return { skin: '#7d9a62', shirt: '#4f5d6e', pants: '#3a3f33', shoes: '#2b2620', hair: '#2d3326' };
    }

    buildHead() {
        const { head } = this.dims;
        this.box(head, head, head, this.mat(this.palette.skin), 0, head / 2, 0, this.head);
        // Sunken red eyes and a dark mouth
        const front = -head / 2 - 0.006;
        for (const side of [-1, 1]) {
            this.box(0.09, 0.06, 0.01, this.mat('#ff3a20', { emissive: '#ff2a10', emissiveIntensity: 1.5 }), side * 0.1, head * 0.58, front, this.head);
        }
        this.box(0.2, 0.05, 0.01, this.mat('#2a1a14'), 0, head * 0.25, front, this.head);
    }

    buildTorso() {
        super.buildTorso();
        const { torsoW, torsoH, torsoD } = this.dims;
        // A rip showing skin
        this.box(torsoW * 0.35, torsoH * 0.3, 0.02, this.mat(this.palette.skin), torsoW * 0.15, torsoH * 0.35, -torsoD / 2 - 0.006, this.body);
    }

    // Arms out in front, a slow sway, and a lurching walk
    animateExtras(dt, { speed = 0, aiming = false }) {
        if (this.deathTimer !== null || aiming) return;
        const sway = Math.sin(this.time * 2.2) * 0.12;
        if (!this.action) {
            this.rightArm.rotation.set(Math.PI / 2 - 0.15 + sway, 0, 0.05);
            this.leftArm.rotation.set(Math.PI / 2 - 0.1 - sway, 0, -0.05);
        }
        this.body.rotation.z = Math.sin(this.walkPhase * 0.5) * 0.08 * Math.min(1, speed / 2);
        this.head.rotation.z = Math.sin(this.time * 1.3) * 0.15;
    }
}

// The fast kind: thinner, paler, red-eyed and bent forward
export class RunnerZombieModel extends ZombieModel {
    dimensions() {
        return { legW: 0.2, torsoW: 0.44, torsoD: 0.24, armW: 0.17, head: 0.42 };
    }

    get palette() {
        return { skin: '#a3b08c', shirt: '#6e2a2a', pants: '#2e2e2e', shoes: '#1e1e1e', hair: '#222' };
    }

    animateExtras(dt, state) {
        super.animateExtras(dt, state);
        if (this.deathTimer === null) this.body.rotation.x = -0.35;
    }
}

// The every-5th-wave boss: broad, dark and scaled up whole (its hitbox is scaled the same way)
export class GiantZombieModel extends ZombieModel {
    constructor() {
        super();
        this.root.scale.setScalar(ZOMBIES.giant.scale);
    }

    dimensions() {
        return { legW: 0.3, hipX: 0.16, torsoW: 0.66, torsoD: 0.36, armW: 0.26 };
    }

    get palette() {
        return { skin: '#5e7a48', shirt: '#3a2a22', pants: '#2a2620', shoes: '#1a1612', hair: '#1e2418' };
    }

    animateExtras(dt, state) {
        super.animateExtras(dt, state);
        // A slow, heavy stomp
        if (this.deathTimer === null) this.body.rotation.z *= 1.6;
    }
}
