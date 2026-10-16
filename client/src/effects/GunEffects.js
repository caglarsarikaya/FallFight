import * as THREE from 'three';

// World-space gunfire effects, all pooled and instanced: bullet tracers, bullet holes on blocks,
// blood pools under kills, smoke grenade clouds, and muzzle flashes (a sprite plus one shared
// light that is always in the scene, so firing never changes the light count and forces a shader
// recompile).

const MAX_TRACERS = 64;
const MAX_DECALS = 256;
const MAX_FLASHES = 8;
const TRACER_SPEED = 260;   // blocks per second, a visible streak rather than a laser
const TRACER_LENGTH = 2.6;
const DECAL_LIFE = 30;      // seconds before a bullet hole fades
const MAX_BLOOD = 48;
const BLOOD_LIFE = 20;      // seconds before a blood pool is cleared
const SMOKE_PUFFS = 16;     // sprites per smoke cloud
const MAX_SMOKES = 3;       // clouds at once (a fourth replaces the oldest)
const SMOKE_GROW = 1.5;     // seconds for a cloud to billow out
const SMOKE_FADE = 3;       // seconds it thins out at the end

function radialTexture(stops, size = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// A four-pointed muzzle flash star
function flashTexture(size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,230,1)');
    g.addColorStop(0.25, 'rgba(255,210,90,0.9)');
    g.addColorStop(0.6, 'rgba(255,120,20,0.35)');
    g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 === 0 ? c : c * 0.38;
        ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// A blocky splat drawn as pixel art (16x16 cells, nearest filtering) to match the block world:
// a ragged core and a few loose square drops around it
const BLOOD_REDS = ['#6e0606', '#5a0303', '#860a0a'];
function bloodTexture(cells = 16) {
    const px = 8;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = cells * px;
    const ctx = canvas.getContext('2d');
    const c = (cells - 1) / 2;
    // Fixed pseudo-random pattern, the same splat every time
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cell = (x, y) => {
        ctx.fillStyle = BLOOD_REDS[Math.floor(rand() * BLOOD_REDS.length)];
        ctx.fillRect(x * px, y * px, px, px);
    };
    for (let y = 0; y < cells; y++) {
        for (let x = 0; x < cells; x++) {
            const d = Math.hypot(x - c, y - c);
            if (d < 3.6 || (d < 5.6 && rand() < 0.62)) cell(x, y);
        }
    }
    for (let i = 0; i < 8; i++) {
        const a = rand() * Math.PI * 2;
        const d = 5.8 + rand() * 1.6;
        cell(Math.round(c + Math.cos(a) * d), Math.round(c + Math.sin(a) * d));
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    return texture;
}

export const FLASH_TEXTURE = (() => {
    let texture = null;
    return () => texture || (texture = flashTexture());
})();

export class GunEffects {
    constructor(scene) {
        this.scene = scene;
        this.dummy = new THREE.Object3D();
        this.zAxis = new THREE.Vector3(0, 0, 1);
        this.tmp = new THREE.Vector3();

        // Tracers: thin glowing boxes stretched along +Z
        const tracerGeometry = new THREE.BoxGeometry(0.025, 0.025, 1);
        tracerGeometry.translate(0, 0, -0.5);
        this.tracerMesh = new THREE.InstancedMesh(tracerGeometry, new THREE.MeshBasicMaterial({
            color: '#ffe9a8', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
        }), MAX_TRACERS);
        this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.tracerMesh.frustumCulled = false;
        this.tracerMesh.count = 0;
        scene.add(this.tracerMesh);
        this.tracers = [];
        for (let i = 0; i < MAX_TRACERS; i++) {
            this.tracers.push({ active: false, start: new THREE.Vector3(), dir: new THREE.Vector3(), length: 0, travelled: 0 });
        }

        // Bullet holes: dark scorched squares on block faces
        const decalGeometry = new THREE.PlaneGeometry(1, 1);
        this.decalMesh = new THREE.InstancedMesh(decalGeometry, new THREE.MeshBasicMaterial({
            map: radialTexture([[0, 'rgba(10,8,6,1)'], [0.35, 'rgba(20,16,12,0.95)'], [0.55, 'rgba(40,32,24,0.5)'], [1, 'rgba(40,32,24,0)']]),
            transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
        }), MAX_DECALS);
        this.decalMesh.frustumCulled = false;
        this.decalMesh.count = 0;
        scene.add(this.decalMesh);
        this.decals = new Array(MAX_DECALS).fill(null);    // { block: key, born }
        this.nextDecal = 0;
        this.decalsDirty = false;

        // Blood pools: flat splats on the ground where someone died
        const bloodGeometry = new THREE.PlaneGeometry(1, 1);
        bloodGeometry.rotateX(-Math.PI / 2);
        this.bloodMesh = new THREE.InstancedMesh(bloodGeometry, new THREE.MeshBasicMaterial({
            map: bloodTexture(), transparent: true, depthWrite: false,
            polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
        }), MAX_BLOOD);
        this.bloodMesh.frustumCulled = false;
        this.bloodMesh.count = 0;
        scene.add(this.bloodMesh);
        this.blood = new Array(MAX_BLOOD).fill(null);       // { block: key, born }
        this.nextBlood = 0;

        // Muzzle flashes: pooled sprites and one shared light
        this.flashes = [];
        for (let i = 0; i < MAX_FLASHES; i++) {
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: FLASH_TEXTURE(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
            }));
            sprite.visible = false;
            scene.add(sprite);
            this.flashes.push({ sprite, life: 0 });
        }
        this.nextFlash = 0;
        // Smoke clouds: pooled soft grey sprites, SMOKE_PUFFS per cloud
        const smokeMap = radialTexture([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]);
        this.smokes = [];
        for (let c = 0; c < MAX_SMOKES; c++) {
            const puffs = [];
            for (let i = 0; i < SMOKE_PUFFS; i++) {
                const shade = 0.62 + Math.random() * 0.18;
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: smokeMap, color: new THREE.Color(shade, shade, shade * 0.97), transparent: true, depthWrite: false, opacity: 0
                }));
                sprite.visible = false;
                scene.add(sprite);
                puffs.push({ sprite, ox: 0, oy: 0, oz: 0, size: 1, drift: 0, phase: 0 });
            }
            this.smokes.push({ puffs, active: false, x: 0, y: 0, z: 0, radius: 0, born: 0, until: 0 });
        }
        this.nextSmoke = 0;
        this.light = new THREE.PointLight('#ffb050', 0, 9, 2);
        scene.add(this.light);
        this.lightLife = 0;
        this.time = 0;
    }

    tracer(start, end) {
        const t = this.tracers.find(x => !x.active);
        if (!t) return;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dz = end.z - start.z;
        const length = Math.hypot(dx, dy, dz);
        if (length < 1.5) return;
        t.active = true;
        t.start.set(start.x, start.y, start.z);
        t.dir.set(dx / length, dy / length, dz / length);
        t.length = length;
        t.travelled = 0;
    }

    // A bullet hole on the face of block (ix, iy, iz) hit at `point`, facing `normal`
    decal(point, normal, blockKey) {
        const i = this.nextDecal;
        this.nextDecal = (this.nextDecal + 1) % MAX_DECALS;
        this.decals[i] = { block: blockKey, born: this.time };
        const d = this.dummy;
        d.position.set(point.x + normal.x * 0.005, point.y + normal.y * 0.005, point.z + normal.z * 0.005);
        this.tmp.set(point.x + normal.x, point.y + normal.y, point.z + normal.z);
        d.lookAt(this.tmp);
        d.rotateZ(Math.random() * Math.PI * 2);
        d.scale.setScalar(0.09 + Math.random() * 0.05);
        d.updateMatrix();
        this.decalMesh.setMatrixAt(i, d.matrix);
        this.decalMesh.count = Math.max(this.decalMesh.count, i + 1);
        this.decalsDirty = true;
    }

    // A pool of blood on the floor at feet height y (on top of block blockKey), size in blocks
    bloodPool(x, y, z, size, blockKey) {
        const i = this.nextBlood;
        this.nextBlood = (this.nextBlood + 1) % MAX_BLOOD;
        this.blood[i] = { block: blockKey, born: this.time };
        const d = this.dummy;
        d.position.set(x, y + 0.01 + i * 0.0002, z);   // a hair apart so overlapping pools don't flicker
        d.rotation.set(0, Math.floor(Math.random() * 4) * Math.PI / 2, 0);   // square to the block grid
        d.scale.setScalar(size * (0.85 + Math.random() * 0.3));
        d.updateMatrix();
        this.bloodMesh.setMatrixAt(i, d.matrix);
        this.bloodMesh.count = Math.max(this.bloodMesh.count, i + 1);
        this.bloodMesh.instanceMatrix.needsUpdate = true;
    }

    // A block broke: its bullet holes and blood go with it
    clearBlock(blockKey) {
        for (let i = 0; i < MAX_DECALS; i++) {
            if (this.decals[i]?.block === blockKey) this.hideDecal(i);
        }
        for (let i = 0; i < MAX_BLOOD; i++) {
            if (this.blood[i]?.block === blockKey) this.hideBlood(i);
        }
    }

    hideBlood(i) {
        this.blood[i] = null;
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.bloodMesh.setMatrixAt(i, this.dummy.matrix);
        this.bloodMesh.instanceMatrix.needsUpdate = true;
    }

    hideDecal(i) {
        this.decals[i] = null;
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.decalMesh.setMatrixAt(i, this.dummy.matrix);
        this.decalsDirty = true;
    }

    flash(position, size = 0.5, light = true) {
        const f = this.flashes[this.nextFlash];
        this.nextFlash = (this.nextFlash + 1) % MAX_FLASHES;
        f.sprite.position.set(position.x, position.y, position.z);
        f.sprite.scale.setScalar(size * (0.8 + Math.random() * 0.4));
        f.sprite.material.rotation = Math.random() * Math.PI;
        f.sprite.visible = true;
        f.life = 0.045;
        if (light) {
            this.light.position.set(position.x, position.y, position.z);
            this.light.intensity = 6;
            this.lightLife = 0.05;
        }
    }

    // Light only (the local player's own shots: the flash sprite lives in the view model)
    lightAt(position) {
        this.light.position.set(position.x, position.y, position.z);
        this.light.intensity = 5;
        this.lightLife = 0.05;
    }

    // A smoke grenade went off at `at`: a cloud of `radius` blocks for `duration` seconds
    smokeCloud(at, radius, duration) {
        const cloud = this.smokes[this.nextSmoke];
        this.nextSmoke = (this.nextSmoke + 1) % MAX_SMOKES;
        Object.assign(cloud, { active: true, x: at.x, y: at.y + radius * 0.35, z: at.z, radius, born: this.time, until: this.time + duration });
        for (const p of cloud.puffs) {
            // Spread through a squashed sphere, denser near the middle
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * radius * 0.75;
            p.ox = Math.cos(a) * r;
            p.oz = Math.sin(a) * r;
            p.oy = (Math.random() - 0.3) * radius * 0.5;
            p.size = radius * (0.9 + Math.random() * 0.6);
            p.drift = 0.15 + Math.random() * 0.25;
            p.phase = Math.random() * Math.PI * 2;
            p.sprite.material.rotation = Math.random() * Math.PI * 2;
            p.sprite.visible = true;
        }
    }

    // How deep in smoke a point is: 0 outside every cloud, 1 at the heart of a thick one
    smokeAt(pos) {
        let best = 0;
        for (const c of this.smokes) {
            if (!c.active) continue;
            const d = Math.hypot(pos.x - c.x, pos.y - c.y, pos.z - c.z) / c.radius;
            if (d < 1) best = Math.max(best, (1 - d) * 2 * this.smokeDensity(c));
        }
        return Math.min(1, best);
    }

    smokeDensity(c) {
        const age = this.time - c.born;
        return Math.min(1, age / SMOKE_GROW, (c.until - this.time) / SMOKE_FADE);
    }

    updateSmokes() {
        for (const c of this.smokes) {
            if (!c.active) continue;
            if (this.time >= c.until) {
                c.active = false;
                for (const p of c.puffs) p.sprite.visible = false;
                continue;
            }
            const density = this.smokeDensity(c);
            const grow = 0.35 + 0.65 * Math.min(1, (this.time - c.born) / SMOKE_GROW);
            for (const p of c.puffs) {
                const t = this.time + p.phase;
                p.sprite.position.set(
                    c.x + p.ox * grow + Math.sin(t * p.drift) * 0.3,
                    c.y + p.oy * grow + Math.sin(t * p.drift * 0.7) * 0.15,
                    c.z + p.oz * grow + Math.cos(t * p.drift) * 0.3);
                p.sprite.scale.setScalar(p.size * grow);
                p.sprite.material.opacity = 0.82 * density;
            }
        }
    }

    update(dt) {
        this.time += dt;
        this.updateSmokes();
        let n = 0;
        const d = this.dummy;
        for (const t of this.tracers) {
            if (!t.active) continue;
            t.travelled += TRACER_SPEED * dt;
            if (t.travelled - TRACER_LENGTH >= t.length) {
                t.active = false;
                continue;
            }
            const head = Math.min(t.travelled, t.length);
            const tail = Math.max(0, t.travelled - TRACER_LENGTH);
            d.position.set(t.start.x + t.dir.x * head, t.start.y + t.dir.y * head, t.start.z + t.dir.z * head);
            d.quaternion.setFromUnitVectors(this.zAxis, t.dir);
            d.scale.set(1, 1, Math.max(0.01, head - tail));
            d.updateMatrix();
            this.tracerMesh.setMatrixAt(n++, d.matrix);
        }
        this.tracerMesh.count = n;
        this.tracerMesh.instanceMatrix.needsUpdate = true;

        // Old bullet holes fade away (checked a few at a time)
        for (let k = 0; k < 4; k++) {
            const i = Math.floor(Math.random() * MAX_DECALS);
            if (this.decals[i] && this.time - this.decals[i].born > DECAL_LIFE) this.hideDecal(i);
        }
        const b = Math.floor(Math.random() * MAX_BLOOD);
        if (this.blood[b] && this.time - this.blood[b].born > BLOOD_LIFE) this.hideBlood(b);
        if (this.decalsDirty) {
            this.decalMesh.instanceMatrix.needsUpdate = true;
            this.decalsDirty = false;
        }

        for (const f of this.flashes) {
            if (!f.sprite.visible) continue;
            f.life -= dt;
            if (f.life <= 0) f.sprite.visible = false;
        }
        if (this.lightLife > 0) {
            this.lightLife -= dt;
            if (this.lightLife <= 0) this.light.intensity = 0;
        }
    }
}
