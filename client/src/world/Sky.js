import * as THREE from 'three';
import { createLavaTexture } from './textures.js';

const SKY_TOP = new THREE.Color('#3f7fd8');
const SKY_HORIZON = new THREE.Color('#bfe0ff');

// Gradient sky dome, square sun, drifting block clouds, lights and the lava sea far below
export class Sky {
    constructor(scene) {
        this.scene = scene;
        scene.fog = new THREE.Fog(SKY_HORIZON, 70, 190);
        scene.background = SKY_HORIZON.clone();

        this.addDome();
        this.addSun();
        this.addLights();
        this.addClouds();
        this.addLava();
    }

    addDome() {
        const geometry = new THREE.SphereGeometry(400, 32, 16);
        const material = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            uniforms: {
                top: { value: SKY_TOP },
                horizon: { value: SKY_HORIZON },
                bottom: { value: new THREE.Color('#ffb37a') }
            },
            vertexShader: `
                varying vec3 vDir;
                void main() {
                    vDir = normalize(position);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: `
                uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom;
                varying vec3 vDir;
                void main() {
                    float h = vDir.y;
                    vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, bottom, min(1.0, -h * 3.0));
                    gl_FragColor = vec4(c, 1.0);
                }`
        });
        this.dome = new THREE.Mesh(geometry, material);
        this.dome.renderOrder = -1;
        this.scene.add(this.dome);
    }

    addSun() {
        const sun = new THREE.Mesh(
            new THREE.PlaneGeometry(30, 30),
            new THREE.MeshBasicMaterial({ color: '#fff6c8', fog: false })
        );
        sun.position.set(120, 160, -200);
        sun.lookAt(0, 0, 0);
        this.scene.add(sun);
    }

    addLights() {
        this.scene.add(new THREE.HemisphereLight('#cfe8ff', '#ff9a5a', 0.9));

        const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
        sun.position.set(30, 50, -20);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const s = sun.shadow.camera;
        s.left = s.bottom = -38;
        s.right = s.top = 38;
        s.near = 1;
        s.far = 120;
        sun.shadow.bias = -0.0005;
        sun.shadow.normalBias = 0.02;
        this.scene.add(sun);
        this.scene.add(sun.target);
    }

    addClouds() {
        this.clouds = new THREE.Group();
        // Unlit so the lava glow below doesn't tint them
        const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        for (let i = 0; i < 40; i++) {
            const cloud = new THREE.Mesh(geometry, material);
            cloud.scale.set(6 + Math.random() * 14, 1.5, 4 + Math.random() * 8);
            cloud.position.set((Math.random() - 0.5) * 300, 36 + Math.random() * 12, (Math.random() - 0.5) * 300);
            this.clouds.add(cloud);
        }
        this.scene.add(this.clouds);
    }

    addLava() {
        this.lavaTexture = createLavaTexture();
        const lava = new THREE.Mesh(
            new THREE.PlaneGeometry(600, 600),
            new THREE.MeshBasicMaterial({ map: this.lavaTexture, color: '#ffffff' })
        );
        lava.rotation.x = -Math.PI / 2;
        lava.position.y = -40;
        this.scene.add(lava);

        // Warm glow from below
        const glow = new THREE.PointLight('#ff6a1a', 60, 60, 1.5);
        glow.position.set(0, -20, 0);
        this.scene.add(glow);
    }

    update(dt) {
        for (const cloud of this.clouds.children) {
            cloud.position.x += dt * 1.5;
            if (cloud.position.x > 150) cloud.position.x -= 300;
        }
        this.lavaTexture.offset.x += dt * 0.02;
        this.lavaTexture.offset.y += dt * 0.013;
    }
}
