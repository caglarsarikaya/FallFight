import * as THREE from 'three';
import { PROJECTILE } from '../../shared/constants.js';
import { stepBouncing } from '../../shared/game/Projectile.js';
import { getItemView } from '../items/registry.js';

const STUCK_TIME = 4;

// Shared rocket parts (RPG): olive body, red warhead tip, dark fins
const ROCKET = (() => {
    let parts = null;
    return () => parts || (parts = {
        body: new THREE.BoxGeometry(0.11, 0.11, 0.5),
        tip: new THREE.BoxGeometry(0.15, 0.15, 0.18),
        fin: new THREE.BoxGeometry(0.26, 0.02, 0.1),
        olive: new THREE.MeshLambertMaterial({ color: '#4b5a32' }),
        red: new THREE.MeshLambertMaterial({ color: '#8c2a1c' }),
        dark: new THREE.MeshLambertMaterial({ color: '#2b2d31' }),
        flame: new THREE.MeshBasicMaterial({ color: '#ffb347' })
    });
})();

// A flying projectile (rockets, grenades), replayed locally from its spawn velocity with the
// same gravity as the server. Grenades bounce off our copy of the arena with the server's own
// step (shared/game/Projectile.js), tumbling as they go; onBounce(position) plays the clink.
export class ProjectileView {
    constructor(scene, data, { arena = null, onBounce = null } = {}) {
        this.scene = scene;
        this.itemId = data.itemId;
        this.position = new THREE.Vector3(data.x, data.y, data.z);
        this.velocity = new THREE.Vector3(data.vx, data.vy, data.vz);
        this.gravity = data.gravity ?? PROJECTILE.gravity;
        this.group = new THREE.Group();
        if (data.bounce > 0 && arena) {
            // Plain numbers for the shared step; copied into the mesh every frame
            this.body = { x: data.x, y: data.y, z: data.z, vx: data.vx, vy: data.vy, vz: data.vz, gravity: this.gravity, bounce: data.bounce, resting: false };
            this.arena = arena;
            this.onBounce = onBounce;
            const model = getItemView(data.itemId)?.createModel();
            if (model) {
                model.position.y = -0.08;
                this.group.add(model);
            }
        } else if (data.itemId === 'rpg') this.buildRocket();
        else this.group.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.2), new THREE.MeshLambertMaterial({ color: '#3d4045' })));
        this.group.position.copy(this.position);
        scene.add(this.group);
        this.stuckTime = null;
        this.trail = 0;
        this.orient();
    }

    // Model points along +Z (lookAt aims +Z at the target)
    buildRocket() {
        const r = ROCKET();
        const add = (geometry, material, z, rotZ = 0) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.z = z;
            mesh.rotation.z = rotZ;
            this.group.add(mesh);
        };
        add(r.body, r.olive, 0);
        add(r.tip, r.red, 0.3);
        add(r.fin, r.dark, -0.2);
        add(r.fin, r.dark, -0.2, Math.PI / 2);
        const flame = new THREE.Mesh(r.tip, r.flame);
        flame.scale.set(0.6, 0.6, 1.2);
        flame.position.z = -0.35;
        this.group.add(flame);
    }

    orient() {
        this.group.lookAt(this.position.clone().add(this.velocity));
    }

    // Server says where it ended; stick into blocks, vanish on players and in explosions
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
        if (this.body) return this.updateBouncing(dt);
        this.velocity.y -= this.gravity * dt;
        this.position.addScaledVector(this.velocity, dt);
        this.group.position.copy(this.position);
        this.orient();
        if (this.position.y < -40) {
            this.dispose();
            return false;
        }
        return true;
    }

    updateBouncing(dt) {
        const b = this.body;
        const hitSpeed = Math.hypot(b.vx, b.vy, b.vz);
        if (stepBouncing(b, dt, this.arena) && hitSpeed > 2) this.onBounce?.(b);
        this.group.position.set(b.x, b.y, b.z);
        if (!b.resting) {
            this.group.rotation.x += dt * 9;
            this.group.rotation.z += dt * 5;
        }
        if (b.y < -40) {
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
