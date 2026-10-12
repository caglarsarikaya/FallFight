import * as THREE from 'three';

const MAX_PARTICLES = 600;

// Simple cube particles: block debris, hit sparks, heal sparkles
export class Particles {
    constructor(scene) {
        this.scene = scene;
        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        this.materials = new Map();
        this.active = [];
    }

    material(color, glow) {
        const key = `${color}|${glow}`;
        if (!this.materials.has(key)) {
            this.materials.set(key, glow
                ? new THREE.MeshBasicMaterial({ color })
                : new THREE.MeshLambertMaterial({ color }));
        }
        return this.materials.get(key);
    }

    // options: { count, colors, speed, up, gravity, life, size, spread, glow }
    burst(position, { count = 12, colors = ['#ffffff'], speed = 3, up = 2, gravity = 18, life = 0.8, size = 0.12, spread = 0.4, glow = false } = {}) {
        for (let i = 0; i < count && this.active.length < MAX_PARTICLES; i++) {
            const color = colors[Math.floor(Math.random() * colors.length)];
            const mesh = new THREE.Mesh(this.geometry, this.material(color, glow));
            mesh.position.set(
                position.x + (Math.random() - 0.5) * spread,
                position.y + (Math.random() - 0.5) * spread,
                position.z + (Math.random() - 0.5) * spread
            );
            const s = size * (0.6 + Math.random() * 0.8);
            mesh.scale.setScalar(s);
            this.scene.add(mesh);
            this.active.push({
                mesh,
                size: s,
                life,
                age: 0,
                gravity,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * speed,
                    Math.random() * up,
                    (Math.random() - 0.5) * speed
                )
            });
        }
    }

    update(dt) {
        this.active = this.active.filter(p => {
            p.age += dt;
            if (p.age >= p.life) {
                this.scene.remove(p.mesh);
                return false;
            }
            p.velocity.y -= p.gravity * dt;
            p.mesh.position.addScaledVector(p.velocity, dt);
            p.mesh.rotation.x += dt * 4;
            p.mesh.rotation.y += dt * 3;
            p.mesh.scale.setScalar(p.size * (1 - p.age / p.life));
            return true;
        });
    }
}
