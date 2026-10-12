import * as THREE from 'three';
import { BLOCK } from '../../shared/constants.js';
import { BLOCK_KIND, BLOCK_STATE } from '../../shared/world/Arena.js';
import { createBlockTextures, createCrackTextures } from './textures.js';
import { Sky } from './Sky.js';

const REGROW_TIME = 0.35;

// Debris colours when a block of each kind breaks
export const DEBRIS_COLORS = {
    [BLOCK_KIND.GRASS]: ['#866043', '#6b4a32', '#5d9b3a', '#4e8a2f'],
    [BLOCK_KIND.STONE]: ['#8a8a8a', '#6e6e6e', '#a3a3a3'],
    [BLOCK_KIND.PLANKS]: ['#b8945f', '#9c7a48', '#7d6139']
};

// Draws the arena's blocks (one instanced mesh per block kind) and animates cracking,
// breaking and regrowing.
export class WorldRenderer {
    constructor(scene) {
        this.scene = scene;
        this.sky = new Sky(scene);
        this.textures = createBlockTextures();
        this.crackTextures = createCrackTextures();
        this.meshes = [];
        this.instances = new Map();  // voxel index -> { mesh, id }
        this.cracking = new Map();   // voxel index -> { mesh, startedAt, center }
        this.regrowing = new Map();  // voxel index -> elapsed
        this.time = 0;
        this.matrix = new THREE.Matrix4();
        this.highlight = this.createHighlight();
    }

    materialsFor(kind) {
        const { grassTop, grassSide, dirt, stoneBricks, planks } = this.textures;
        const lambert = map => new THREE.MeshLambertMaterial({ map });
        if (kind === BLOCK_KIND.GRASS) {
            const side = lambert(grassSide);
            return [side, side, lambert(grassTop), lambert(dirt), side, side];
        }
        return lambert(kind === BLOCK_KIND.STONE ? stoneBricks : planks);
    }

    setArena(arena) {
        this.arena = arena;
        for (const mesh of this.meshes) {
            this.scene.remove(mesh);
            mesh.dispose();
        }
        this.meshes = [];
        this.instances.clear();

        // Group voxels by kind
        const byKind = new Map();
        for (let i = 0; i < arena.kinds.length; i++) {
            const kind = arena.kinds[i];
            if (kind === BLOCK_KIND.AIR) continue;
            if (!byKind.has(kind)) byKind.set(kind, []);
            byKind.get(kind).push(i);
        }

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const color = new THREE.Color();
        for (const [kind, voxels] of byKind) {
            const mesh = new THREE.InstancedMesh(geometry, this.materialsFor(kind), voxels.length);
            mesh.receiveShadow = true;
            mesh.castShadow = true;
            voxels.forEach((voxel, id) => {
                this.instances.set(voxel, { mesh, id });
                const { ix, iy, iz } = arena.coords(voxel);
                // Subtle per-block brightness variation
                const v = 0.9 + (Math.abs((ix * 73856093) ^ (iz * 19349663) ^ (iy * 83492791)) % 100) / 1000;
                color.setRGB(v, v, v);
                mesh.setColorAt(id, color);
                this.setBlockScale(voxel, arena.states[voxel] === BLOCK_STATE.BROKEN ? 0 : 1);
            });
            mesh.instanceColor.needsUpdate = true;
            this.scene.add(mesh);
            this.meshes.push(mesh);
        }
    }

    setBlockScale(voxel, scale) {
        const entry = this.instances.get(voxel);
        if (!entry) return;
        const { ix, iy, iz } = this.arena.coords(voxel);
        const c = this.arena.blockCenter(ix, iy, iz);
        this.matrix.makeScale(scale, scale, scale);
        this.matrix.setPosition(c.x, c.y, c.z);
        entry.mesh.setMatrixAt(entry.id, this.matrix);
        entry.mesh.instanceMatrix.needsUpdate = true;
    }

    crack(ix, iy, iz) {
        const voxel = this.arena.index(ix, iy, iz);
        if (this.cracking.has(voxel)) return;
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.004, 1.004, 1.004),
            new THREE.MeshBasicMaterial({
                map: this.crackTextures[0],
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -1
            })
        );
        const center = this.arena.blockCenter(ix, iy, iz);
        mesh.position.set(center.x, center.y, center.z);
        this.scene.add(mesh);
        this.cracking.set(voxel, { mesh, startedAt: this.time, center });
    }

    removeCrack(voxel) {
        const entry = this.cracking.get(voxel);
        if (!entry) return;
        this.scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();
        this.cracking.delete(voxel);
    }

    break(ix, iy, iz) {
        const voxel = this.arena.index(ix, iy, iz);
        this.removeCrack(voxel);
        this.regrowing.delete(voxel);
        this.setBlockScale(voxel, 0);
    }

    restore(ix, iy, iz) {
        this.regrowing.set(this.arena.index(ix, iy, iz), 0);
    }

    createHighlight() {
        const box = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)),
            new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.55 })
        );
        box.visible = false;
        this.scene.add(box);
        return box;
    }

    // Outline the block the player is aiming at (null hides it)
    setHighlight(block) {
        this.highlight.visible = !!block;
        if (block) {
            const c = this.arena.blockCenter(block.ix, block.iy, block.iz);
            this.highlight.position.set(c.x, c.y, c.z);
        }
    }

    update(dt) {
        this.time += dt;
        this.sky.update(dt);

        for (const entry of this.cracking.values()) {
            const progress = Math.min(0.999, (this.time - entry.startedAt) / BLOCK.breakDelay);
            entry.mesh.material.map = this.crackTextures[Math.floor(progress * this.crackTextures.length)];
            // Shake slightly while cracking
            entry.mesh.position.x = entry.center.x + (Math.random() - 0.5) * 0.03;
        }

        for (const [voxel, elapsed] of this.regrowing) {
            const t = Math.min(1, (elapsed + dt) / REGROW_TIME);
            // Ease out with a little overshoot
            const s = t < 1 ? 1 + 1.7 * Math.pow(t - 1, 3) + 0.7 * Math.pow(t - 1, 2) : 1;
            this.setBlockScale(voxel, Math.max(0, s));
            if (t >= 1) this.regrowing.delete(voxel);
            else this.regrowing.set(voxel, elapsed + dt);
        }
    }
}
