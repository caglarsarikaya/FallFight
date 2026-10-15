import * as THREE from 'three';
import { createLavaTexture } from './textures.js';

const DEFAULT_THEME = { sky: '#3f7fd8', horizon: '#bfe0ff', fog: '#bfe0ff', fogNear: 70, fogFar: 190, void: 'lava', weather: null, sun: 2.2 };
const SNOW_FLAKES = 1500;
const SNOW_BOX = 40;        // flakes fill a box this wide around the camera

// Gradient sky dome, square sun, drifting block clouds, lights, what lies below the map (a lava
// sea, a dark abyss or nothing) and optional snowfall. Each map picks its look with a theme.
export class Sky {
    constructor(scene) {
        this.scene = scene;
        scene.fog = new THREE.Fog(DEFAULT_THEME.fog, DEFAULT_THEME.fogNear, DEFAULT_THEME.fogFar);
        scene.background = new THREE.Color(DEFAULT_THEME.horizon);

        this.addDome();
        this.addSun();
        this.addLights();
        this.addClouds();
        this.addLava();
        this.addAbyss();
        this.addSnow();
        this.setTheme(DEFAULT_THEME);
    }

    setTheme(theme) {
        const t = { ...DEFAULT_THEME, ...theme };
        this.scene.fog.color.set(t.fog);
        this.scene.fog.near = t.fogNear;
        this.scene.fog.far = t.fogFar;
        this.scene.background.set(t.horizon);
        this.dome.material.uniforms.top.value.set(t.sky);
        this.dome.material.uniforms.horizon.value.set(t.horizon);
        this.sunLight.intensity = t.sun;
        // Light bouncing up from below: warm over lava, neutral elsewhere
        this.hemi.groundColor.set(t.void === 'lava' ? '#ff9a5a' : '#9a9690');
        this.lava.visible = t.void === 'lava';
        // The glow light stays in the scene (changing the light count recompiles shaders)
        this.lavaGlow.intensity = t.void === 'lava' ? 60 : 0;
        this.abyss.visible = t.void === 'abyss';
        this.snow.visible = t.weather === 'snow';
        this.clouds.visible = t.weather !== 'snow';
    }

    addDome() {
        const geometry = new THREE.SphereGeometry(400, 32, 16);
        const material = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            uniforms: {
                top: { value: new THREE.Color(DEFAULT_THEME.sky) },
                horizon: { value: new THREE.Color(DEFAULT_THEME.horizon) },
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
        this.hemi = new THREE.HemisphereLight('#cfe8ff', '#ff9a5a', 0.9);
        this.scene.add(this.hemi);

        const sun = new THREE.DirectionalLight('#fff1d6', DEFAULT_THEME.sun);
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
        this.sunLight = sun;
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
        this.lava = new THREE.Mesh(
            new THREE.PlaneGeometry(600, 600),
            new THREE.MeshBasicMaterial({ map: this.lavaTexture, color: '#ffffff' })
        );
        this.lava.rotation.x = -Math.PI / 2;
        this.lava.position.y = -40;
        this.scene.add(this.lava);

        // Warm glow from below
        this.lavaGlow = new THREE.PointLight('#ff6a1a', 60, 60, 1.5);
        this.lavaGlow.position.set(0, -20, 0);
        this.scene.add(this.lavaGlow);
    }

    // A dark, icy chasm under maps that float over nothing
    addAbyss() {
        this.abyss = new THREE.Mesh(
            new THREE.PlaneGeometry(600, 600),
            new THREE.MeshBasicMaterial({ color: '#0b1a2c', fog: false })
        );
        this.abyss.rotation.x = -Math.PI / 2;
        this.abyss.position.y = -30;
        this.scene.add(this.abyss);
    }

    // Snowflakes: one Points object that follows the camera, flakes wrap around inside a box
    addSnow() {
        const positions = new Float32Array(SNOW_FLAKES * 3);
        for (let i = 0; i < SNOW_FLAKES; i++) {
            positions[i * 3] = (Math.random() - 0.5) * SNOW_BOX;
            positions[i * 3 + 1] = Math.random() * 20;
            positions[i * 3 + 2] = (Math.random() - 0.5) * SNOW_BOX;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.snow = new THREE.Points(geometry, new THREE.PointsMaterial({
            color: '#ffffff', size: 0.09, transparent: true, opacity: 0.85, depthWrite: false
        }));
        this.snow.frustumCulled = false;
        this.snowTime = 0;
        this.scene.add(this.snow);
    }

    update(dt, camera = null) {
        if (this.clouds.visible) {
            for (const cloud of this.clouds.children) {
                cloud.position.x += dt * 1.5;
                if (cloud.position.x > 150) cloud.position.x -= 300;
            }
        }
        if (this.lava.visible) {
            this.lavaTexture.offset.x += dt * 0.02;
            this.lavaTexture.offset.y += dt * 0.013;
        }
        if (this.snow.visible && camera) {
            this.snowTime += dt;
            const p = this.snow.geometry.attributes.position;
            const a = p.array;
            const cx = camera.position.x;
            const cz = camera.position.z;
            const base = camera.position.y - 6;
            const half = SNOW_BOX / 2;
            for (let i = 0; i < SNOW_FLAKES; i++) {
                const o = i * 3;
                a[o + 1] -= dt * (1.2 + (i % 7) * 0.12);
                a[o] += Math.sin(this.snowTime * 0.7 + i) * dt * 0.3;
                // Keep every flake within a box around the camera
                if (a[o + 1] < base) a[o + 1] += 20;
                if (a[o + 1] > base + 20) a[o + 1] -= 20;
                if (a[o] < cx - half) a[o] += SNOW_BOX;
                else if (a[o] > cx + half) a[o] -= SNOW_BOX;
                if (a[o + 2] < cz - half) a[o + 2] += SNOW_BOX;
                else if (a[o + 2] > cz + half) a[o + 2] -= SNOW_BOX;
            }
            p.needsUpdate = true;
        }
    }
}
