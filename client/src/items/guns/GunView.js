import * as THREE from 'three';
import { WEAPON_KIND, WEAPONS } from '../../../shared/config/weapons.js';
import { ItemView } from '../ItemView.js';
import { FLASH_TEXTURE } from '../../effects/GunEffects.js';
import { GUN_MODELS, MATERIALS } from './specs.js';

const GLOVE = '#2a2522';
const SLEEVE = '#3b4756';

// Shared materials and geometry so every copy of a gun reuses the same GPU resources
const materialCache = new Map();
function material(key) {
    if (!materialCache.has(key)) {
        const m = MATERIALS[key] || { color: key };
        materialCache.set(key, m.metal
            ? new THREE.MeshStandardMaterial({ color: m.color, metalness: 0.6, roughness: 0.45 })
            : new THREE.MeshLambertMaterial({ color: m.color, emissive: m.emissive || '#000000' }));
    }
    return materialCache.get(key);
}
const unitBox = new THREE.BoxGeometry(1, 1, 1);

function addBox(group, w, h, d, x, y, z, mat, rx = 0) {
    const mesh = new THREE.Mesh(unitBox, material(mat));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    mesh.userData.shared = true; // geometry and material are shared: never dispose them
    group.add(mesh);
    return mesh;
}

// First-person gun or knife: model, hands, muzzle flash, and the kick / reload / swing animations
export class GunView extends ItemView {
    constructor(id) {
        super(id);
        this.spec = WEAPONS[id];
        this.model = GUN_MODELS[id];
    }

    get isPistol() {
        return this.spec.kind === WEAPON_KIND.PISTOL;
    }

    createModel() {
        const group = new THREE.Group();
        const tags = {};
        for (const [w, h, d, x, y, z, mat, o] of this.model.parts) {
            const mesh = addBox(group, w, h, d, x, y, z, mat, o.rx || 0);
            if (o.tag) {
                tags[o.tag] = mesh;
                mesh.userData.rest = mesh.position.clone();
                mesh.userData.restRotX = mesh.rotation.x;
            }
        }
        group.userData.tags = tags;
        group.userData.muzzle = new THREE.Vector3(...this.model.muzzle);
        group.userData.eject = new THREE.Vector3(...this.model.eject);
        return group;
    }

    get firstPersonPose() {
        return this.isPistol
            ? { position: [0.13, -0.135, -0.3], rotation: [0.02, 0.07, 0], scale: 0.62 }
            : { position: [0.12, -0.125, -0.24], rotation: [0.02, 0.06, 0], scale: 0.5 };
    }

    // Arm raised forward (see CharacterModel aiming): the barrel points down the arm
    get thirdPersonPose() {
        return { position: [0, 0.04, 0.02], rotation: [-Math.PI / 2, 0, 0], scale: 0.9 };
    }

    createFirstPerson() {
        const holder = super.createFirstPerson();
        const model = holder.userData.model;
        // Gloved hands and sleeves: right on the grip, left on the handguard (or the right hand)
        const hands = new THREE.Group();
        addBox(hands, 0.05, 0.06, 0.07, 0, -0.03, 0.03, GLOVE);
        addBox(hands, 0.075, 0.075, 0.3, 0.02, -0.06, 0.2, SLEEVE, 0.35);
        const front = this.isPistol ? [-0.01, -0.02, 0.02] : [0, 0.03, -0.3];
        addBox(hands, 0.06, 0.05, 0.08, front[0] - 0.02, front[1], front[2], GLOVE);
        addBox(hands, 0.075, 0.075, 0.32, front[0] - 0.12, front[1] - 0.06, front[2] + 0.18, SLEEVE, 0.3);
        hands.children[3].rotation.y = -0.5;
        model.add(hands);

        // Muzzle flash sprite at the barrel tip, hidden until a shot
        const flash = new THREE.Sprite(new THREE.SpriteMaterial({
            map: FLASH_TEXTURE(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
        }));
        flash.position.copy(model.userData.muzzle).add(new THREE.Vector3(0, 0, -0.04));
        flash.scale.setScalar(this.spec.kind === WEAPON_KIND.SHOTGUN || this.id === 'awp' ? 0.3 : 0.2);
        flash.visible = false;
        model.add(flash);
        holder.userData.flash = flash;
        return holder;
    }

    // state: { action, t, kick, reload (0..1 or null), pump (0..1 or null) }
    applyFirstPersonAnimation(model, { kick = 0, reload = null, bolt = null }) {
        const tags = model.userData.tags;
        // Recoil: back and up, more for heavy guns
        const heavy = this.spec.damage / 40;
        model.position.z += kick * 0.05 * (0.6 + heavy * 0.6);
        model.position.y += kick * 0.012;
        model.rotation.x += kick * 0.09 * (0.5 + heavy * 0.7);
        if (tags.bolt) tags.bolt.position.z = tags.bolt.userData.rest.z + Math.min(1, kick * 2) * 0.04;

        if (reload !== null) {
            this.animateReload(model, tags, reload);
        } else if (tags.mag) {
            tags.mag.position.y = tags.mag.userData.rest.y;
            tags.mag.rotation.x = tags.mag.userData.restRotX;
            tags.mag.visible = true;
        }
        if (tags.pump) {
            const p = bolt === null ? 0 : Math.sin(bolt * Math.PI);
            tags.pump.position.z = tags.pump.userData.rest.z + p * 0.09;
        }
        if (bolt !== null && tags.bolt && !tags.pump) {
            tags.bolt.position.z = tags.bolt.userData.rest.z + Math.sin(bolt * Math.PI) * 0.07;
            model.rotation.z += Math.sin(bolt * Math.PI) * 0.12;
        }
    }

    // Magazine reload over progress r (0..1), in beats you can read:
    //   0-0.15 dip and tilt the gun toward you        0.12-0.38 old mag slides out and falls away
    //   0.45-0.68 new mag rises into the gun          0.66-0.78 slap it home (a small jolt)
    //   0.76-0.9 rack the bolt / slide                0.85-1 back on target
    // The clip-in sound plays at 68% and the bolt sound at 80% (WeaponController).
    animateReload(model, tags, r) {
        const tilt = smooth(r / 0.15) * (1 - smooth((r - 0.85) / 0.15));
        model.rotation.z += tilt * 0.6;
        model.rotation.x += tilt * 0.3;
        model.position.y -= tilt * 0.06;
        model.position.x -= tilt * 0.02;
        const slap = r > 0.66 && r < 0.78 ? Math.sin(((r - 0.66) / 0.12) * Math.PI) : 0;
        model.position.y += slap * 0.025;
        model.rotation.x -= slap * 0.1;

        const mag = tags.mag;
        if (mag) {
            const rest = mag.userData.rest;
            const dir = rest.y > 0.1 ? 1 : -1;    // top-loaded (P90) mags come off upward
            let offset = 0;
            let spin = 0;
            if (r >= 0.12 && r < 0.38) {
                // Slides out, then drops with gravity and tumbles
                const u = (r - 0.12) / 0.26;
                offset = 0.04 * smooth(u / 0.3) + 0.6 * u * u;
                spin = u * 1.4;
            } else if (r >= 0.45 && r < 0.68) {
                offset = (1 - smooth((r - 0.45) / 0.23)) * 0.22;
            }
            mag.visible = r < 0.38 || r >= 0.45;
            mag.position.y = rest.y + dir * offset;
            mag.rotation.x = mag.userData.restRotX + spin;
        }
        if (tags.bolt) {
            const rack = r > 0.76 && r < 0.9 ? Math.sin(((r - 0.76) / 0.14) * Math.PI) : 0;
            tags.bolt.position.z = tags.bolt.userData.rest.z + rack * 0.07;
        }
        if (tags.pump) tags.pump.position.z = tags.pump.userData.rest.z;
    }

    // Fills the whole canvas (wide icons look best for guns)
    drawIcon(ctx) {
        drawGunIcon(ctx, this.model);
    }
}

function smooth(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
}

// Side-on silhouette of the model (muzzle to the right), filling the canvas
export function drawGunIcon(ctx, model) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, h, d, , y, z] of model.parts) {
        minZ = Math.min(minZ, z - d / 2);
        maxZ = Math.max(maxZ, z + d / 2);
        minY = Math.min(minY, y - h / 2);
        maxY = Math.max(maxY, y + h / 2);
    }
    const scale = Math.min((width * 0.92) / (maxZ - minZ), (height * 0.85) / (maxY - minY));
    const cx = width / 2 + ((minZ + maxZ) / 2) * scale;
    const cy = height / 2 + ((minY + maxY) / 2) * scale;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f2f2f2';
    for (const [, h, d, , y, z, , o] of model.parts) {
        ctx.save();
        ctx.translate(cx - z * scale, cy - y * scale);
        ctx.rotate(o.rx || 0);
        ctx.fillRect((-d / 2) * scale, (-h / 2) * scale, d * scale, h * scale);
        ctx.restore();
    }
}
