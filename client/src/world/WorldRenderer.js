import * as THREE from 'three';
import { BLOCK } from '../../shared/constants.js';
import { TILE } from '../../shared/world/Arena.js';
import { createBlockTextures, createCrackTextures } from './textures.js';
import { Sky } from './Sky.js';

const REGROW_TIME = 0.35;

// Draws the arena floor as one instanced mesh and animates cracking, breaking and regrowing.
export class WorldRenderer {
    constructor(scene) {
        this.scene = scene;
        this.sky = new Sky(scene);
        this.textures = createBlockTextures();
        this.crackTextures = createCrackTextures();
        this.cracking = new Map();   // tile index -> { mesh, startedAt }
        this.regrowing = new Map();  // tile index -> elapsed
        this.time = 0;
        this.matrix = new THREE.Matrix4();
        this.highlight = this.createHighlight();
    }

    setArena(arena) {
        this.arena = arena;
        if (this.floor) {
            this.scene.remove(this.floor);
            this.floor.dispose();
        }
        const { grassTop, grassSide, dirt } = this.textures;
        const side = new THREE.MeshLambertMaterial({ map: grassSide });
        const materials = [side, side, new THREE.MeshLambertMaterial({ map: grassTop }), new THREE.MeshLambertMaterial({ map: dirt }), side, side];
        const count = arena.size * arena.size;
        this.floor = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials, count);
        this.floor.receiveShadow = true;
        this.floor.castShadow = true;

        const color = new THREE.Color();
        for (let iz = 0; iz < arena.size; iz++) {
            for (let ix = 0; ix < arena.size; ix++) {
                const i = arena.index(ix, iz);
                // Subtle per-block brightness variation
                const v = 0.9 + (Math.abs((ix * 73856093) ^ (iz * 19349663)) % 100) / 1000;
                color.setRGB(v, v, v);
                this.floor.setColorAt(i, color);
                this.setBlockScale(ix, iz, arena.getTile(ix, iz) === TILE.BROKEN ? 0 : 1);
            }
        }
        this.floor.instanceColor.needsUpdate = true;
        this.scene.add(this.floor);
    }

    setBlockScale(ix, iz, scale) {
        const { x, z } = this.arena.tileCenter(ix, iz);
        this.matrix.makeScale(scale, scale, scale);
        this.matrix.setPosition(x, -0.5, z);
        this.floor.setMatrixAt(this.arena.index(ix, iz), this.matrix);
        this.floor.instanceMatrix.needsUpdate = true;
    }

    crack(ix, iz) {
        const i = this.arena.index(ix, iz);
        if (this.cracking.has(i)) return;
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.004, 1.004, 1.004),
            new THREE.MeshBasicMaterial({
                map: this.crackTextures[0],
                transparent: true,
                depthWrite: false,
                color: '#ffffff',
                polygonOffset: true,
                polygonOffsetFactor: -1
            })
        );
        const { x, z } = this.arena.tileCenter(ix, iz);
        mesh.position.set(x, -0.5, z);
        this.scene.add(mesh);
        this.cracking.set(i, { mesh, startedAt: this.time });
    }

    removeCrack(i) {
        const entry = this.cracking.get(i);
        if (!entry) return;
        this.scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();
        this.cracking.delete(i);
    }

    break(ix, iz) {
        this.removeCrack(this.arena.index(ix, iz));
        this.regrowing.delete(this.arena.index(ix, iz));
        this.setBlockScale(ix, iz, 0);
    }

    restore(ix, iz) {
        this.regrowing.set(this.arena.index(ix, iz), 0);
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
    setHighlight(tile) {
        this.highlight.visible = !!tile;
        if (tile) {
            const { x, z } = this.arena.tileCenter(tile.ix, tile.iz);
            this.highlight.position.set(x, -0.5, z);
        }
    }

    update(dt) {
        this.time += dt;
        this.sky.update(dt);

        for (const [i, entry] of this.cracking) {
            const progress = Math.min(0.999, (this.time - entry.startedAt) / BLOCK.breakDelay);
            entry.mesh.material.map = this.crackTextures[Math.floor(progress * this.crackTextures.length)];
            // Shake slightly while cracking
            entry.mesh.position.x = this.arena.tileCenter(i % this.arena.size, 0).x + (Math.random() - 0.5) * 0.03;
        }

        for (const [i, elapsed] of this.regrowing) {
            const t = Math.min(1, (elapsed + dt) / REGROW_TIME);
            // Ease out with a little overshoot
            const s = t < 1 ? 1 + 1.7 * Math.pow(t - 1, 3) + 0.7 * Math.pow(t - 1, 2) : 1;
            this.setBlockScale(i % this.arena.size, Math.floor(i / this.arena.size), Math.max(0, s));
            if (t >= 1) this.regrowing.delete(i);
            else this.regrowing.set(i, elapsed + dt);
        }
    }
}
