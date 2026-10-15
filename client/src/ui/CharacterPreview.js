import * as THREE from 'three';
import { createCharacterModel } from '../characters/registry.js';
import { getItemView } from '../items/registry.js';
import { createBlockTextures } from '../world/textures.js';

// Rotating 3D preview of a character standing on a grass block, for the character select screen
export class CharacterPreview {
    constructor(container) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.prepend(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
        this.camera.position.set(0, 1.6, 5.2);
        this.camera.lookAt(0, 0.95, 0);
        this.scene.add(new THREE.HemisphereLight('#dceeff', '#6a4a30', 1.6));
        const key = new THREE.DirectionalLight('#ffffff', 1.8);
        key.position.set(3, 5, 4);
        this.scene.add(key);

        const { grassTop, grassSide, dirt } = createBlockTextures();
        const side = new THREE.MeshLambertMaterial({ map: grassSide });
        const block = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), [
            side, side, new THREE.MeshLambertMaterial({ map: grassTop }), new THREE.MeshLambertMaterial({ map: dirt }), side, side
        ]);
        block.position.y = -0.25;
        this.scene.add(block);

        this.turntable = new THREE.Group();
        this.scene.add(this.turntable);
        this.model = null;
        this.time = 0;
        this.running = false;

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
        this.resize();
    }

    setCharacter(characterId) {
        if (this.model) {
            this.turntable.remove(this.model.root);
            this.model.dispose();
        }
        this.model = createCharacterModel(characterId);
        this.model.handAnchor.add(getItemView('ak47').createThirdPerson());
        this.turntable.add(this.model.root);
        this.model.playAction('reload');
    }

    resize() {
        const { clientWidth: w, clientHeight: h } = this.container;
        if (!w || !h) return;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    start() {
        if (this.running) return;
        this.running = true;
        let last = performance.now();
        const loop = now => {
            if (!this.running) return;
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            this.time += dt;
            this.turntable.rotation.y = Math.PI + Math.sin(this.time * 0.6) * 0.9;
            if (this.model) {
                if (Math.floor(this.time / 3.5) !== Math.floor((this.time - dt) / 3.5)) this.model.playAction('reload');
                this.model.animate(dt, { speed: 0, onGround: true, aiming: true });
            }
            this.renderer.render(this.scene, this.camera);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    stop() {
        this.running = false;
    }
}
