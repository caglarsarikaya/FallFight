import * as THREE from 'three';
import { PROJECTILE } from '../../shared/constants.js';
import { createArrowModel } from '../items/BowView.js';

const STUCK_TIME = 4;

// A flying arrow, replayed locally from its spawn velocity with the same gravity as the server
export class ProjectileView {
    constructor(scene, data) {
        this.scene = scene;
        this.position = new THREE.Vector3(data.x, data.y, data.z);
        this.velocity = new THREE.Vector3(data.vx, data.vy, data.vz);
        this.group = new THREE.Group();
        const arrow = createArrowModel(0.7);
        arrow.rotation.y = Math.PI; // the model points -Z; lookAt aims +Z
        arrow.position.z = 0.35;
        this.group.add(arrow);
        this.group.position.copy(this.position);
        scene.add(this.group);
        this.stuckTime = null;
        this.orient();
    }

    orient() {
        this.group.lookAt(this.position.clone().add(this.velocity));
    }

    // Server says where it ended; stick into blocks, vanish on players
    end({ x, y, z, stuck }) {
        this.position.set(x, y, z);
        this.group.position.copy(this.position);
        if (stuck) this.stuckTime = 0;
        else this.dispose();
    }

    // Returns false once it should be removed
    update(dt) {
        if (this.disposed) return false;
        if (this.stuckTime !== null) {
            this.stuckTime += dt;
            if (this.stuckTime > STUCK_TIME) {
                this.dispose();
                return false;
            }
            return true;
        }
        this.velocity.y -= PROJECTILE.gravity * dt;
        this.position.addScaledVector(this.velocity, dt);
        this.group.position.copy(this.position);
        this.orient();
        if (this.position.y < -40) {
            this.dispose();
            return false;
        }
        return true;
    }

    dispose() {
        this.disposed = true;
        this.scene.remove(this.group);
    }
}
