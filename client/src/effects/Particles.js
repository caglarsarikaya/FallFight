import * as THREE from 'three';

const MAX_PARTICLES = 800;

// Small cube particles (block debris, blood, sparks, heal sparkles) drawn as one instanced mesh
// per material kind: two draw calls in total, and no allocation per particle.
class ParticlePool {
    constructor(scene, material) {
        this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, MAX_PARTICLES);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.count = 0;
        // Make sure the colour buffer exists before the first frame
        this.mesh.setColorAt(0, new THREE.Color());
        scene.add(this.mesh);
        this.count = 0;
        const n = MAX_PARTICLES;
        this.pos = new Float32Array(n * 3);
        this.vel = new Float32Array(n * 3);
        this.rot = new Float32Array(n * 2);
        this.age = new Float32Array(n);
        this.life = new Float32Array(n);
        this.size = new Float32Array(n);
        this.gravity = new Float32Array(n);
        this.color = new Float32Array(n * 3);
    }

    add(x, y, z, vx, vy, vz, life, size, gravity, color) {
        if (this.count >= MAX_PARTICLES) return;
        const i = this.count++;
        const p = i * 3;
        this.pos[p] = x;
        this.pos[p + 1] = y;
        this.pos[p + 2] = z;
        this.vel[p] = vx;
        this.vel[p + 1] = vy;
        this.vel[p + 2] = vz;
        this.color[p] = color.r;
        this.color[p + 1] = color.g;
        this.color[p + 2] = color.b;
        this.rot[i * 2] = Math.random() * 6;
        this.rot[i * 2 + 1] = Math.random() * 6;
        this.age[i] = 0;
        this.life[i] = life;
        this.size[i] = size;
        this.gravity[i] = gravity;
    }

    // Swap-remove: move the last particle into slot i
    remove(i) {
        const last = --this.count;
        if (i === last) return;
        this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
        this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
        this.rot.copyWithin(i * 2, last * 2, last * 2 + 2);
        this.color.copyWithin(i * 3, last * 3, last * 3 + 3);
        this.age[i] = this.age[last];
        this.life[i] = this.life[last];
        this.size[i] = this.size[last];
        this.gravity[i] = this.gravity[last];
    }

    update(dt, dummy, color) {
        for (let i = this.count - 1; i >= 0; i--) {
            this.age[i] += dt;
            if (this.age[i] >= this.life[i]) this.remove(i);
        }
        for (let i = 0; i < this.count; i++) {
            const p = i * 3;
            this.vel[p + 1] -= this.gravity[i] * dt;
            this.pos[p] += this.vel[p] * dt;
            this.pos[p + 1] += this.vel[p + 1] * dt;
            this.pos[p + 2] += this.vel[p + 2] * dt;
            this.rot[i * 2] += dt * 4;
            this.rot[i * 2 + 1] += dt * 3;
            dummy.position.set(this.pos[p], this.pos[p + 1], this.pos[p + 2]);
            dummy.rotation.set(this.rot[i * 2], this.rot[i * 2 + 1], 0);
            dummy.scale.setScalar(this.size[i] * (1 - this.age[i] / this.life[i]));
            dummy.updateMatrix();
            this.mesh.setMatrixAt(i, dummy.matrix);
            color.setRGB(this.color[p], this.color[p + 1], this.color[p + 2]);
            this.mesh.setColorAt(i, color);
        }
        this.mesh.count = this.count;
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
}

export class Particles {
    constructor(scene) {
        this.lit = new ParticlePool(scene, new THREE.MeshLambertMaterial({ color: '#ffffff' }));
        this.glow = new ParticlePool(scene, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        this.dummy = new THREE.Object3D();
        this.tmpColor = new THREE.Color();
        this.colorCache = new Map();
    }

    colorOf(css) {
        let c = this.colorCache.get(css);
        if (!c) {
            c = new THREE.Color(css);
            this.colorCache.set(css, c);
        }
        return c;
    }

    // options: { count, colors, speed, up, gravity, life, size, spread, glow, dir: {x,y,z} bias }
    burst(position, { count = 12, colors = ['#ffffff'], speed = 3, up = 2, gravity = 18, life = 0.8, size = 0.12, spread = 0.4, glow = false, dir = null, dirSpeed = 0 } = {}) {
        const pool = glow ? this.glow : this.lit;
        for (let i = 0; i < count; i++) {
            const color = this.colorOf(colors[Math.floor(Math.random() * colors.length)]);
            pool.add(
                position.x + (Math.random() - 0.5) * spread,
                position.y + (Math.random() - 0.5) * spread,
                position.z + (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * speed + (dir ? dir.x * dirSpeed * Math.random() : 0),
                Math.random() * up + (dir ? dir.y * dirSpeed * Math.random() : 0),
                (Math.random() - 0.5) * speed + (dir ? dir.z * dirSpeed * Math.random() : 0),
                life * (0.7 + Math.random() * 0.6),
                size * (0.6 + Math.random() * 0.8),
                gravity,
                color
            );
        }
    }

    update(dt) {
        this.lit.update(dt, this.dummy, this.tmpColor);
        this.glow.update(dt, this.dummy, this.tmpColor);
    }
}
