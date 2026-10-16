import * as THREE from 'three';
import { PLAYER } from '../../shared/constants.js';
import { createCharacterModel } from '../characters/registry.js';
import { getItemView } from '../items/registry.js';
import { isGun } from '../../shared/config/weapons.js';

export const INTERPOLATION_DELAY = 100; // ms behind the newest snapshot, for smooth remote movement

// Name tags are drawn on a canvas, so they read the UI font (--font in main.css) themselves.
// Canvas text ignores font-size-adjust, so pick the size that gives the same letter height
// (x-height NAME_TAG_X px) in whatever font it is; measured once the font has loaded.
const NAME_TAG_X = 18;
let nameTagFont = null;
function getNameTagFont(ctx) {
    if (nameTagFont) return nameTagFont;
    const family = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'monospace';
    ctx.font = `100px ${family}`;
    const xHeight = ctx.measureText('x').actualBoundingBoxAscent / 100 || 0.5;
    const font = `${Math.round(NAME_TAG_X / xHeight)}px ${family}`;
    if (document.fonts.check(font)) nameTagFont = font; // until the web font arrives, measure again next time
    return font;
}

// A player in the world: character model, held item and name tag. Remote players are driven by
// interpolated snapshots; the local player's avatar (third-person view) is posed directly.
export class PlayerAvatar {
    constructor(scene, info, { isSelf = false } = {}) {
        this.scene = scene;
        this.id = info.id;
        this.isSelf = isSelf;
        this.group = new THREE.Group();
        this.buffer = [];
        this.speed = 0;
        this.onGround = true;
        this.crouching = !!info.crouching;
        this.pitch = 0;
        this.stepTimer = Math.random();
        this.alive = info.alive !== false;
        this.health = info.health ?? PLAYER.maxHealth;
        this.name = info.name;
        this.heldItemId = null;
        this.team = info.team ?? null;
        this.isZombie = !!info.isZombie;
        this.maxHealth = info.maxHealth ?? PLAYER.maxHealth;
        this.scale = info.scale ?? 1;   // giant zombies
        // Zombies go nameless, except giants: their tag carries the boss health bar
        this.nameVisible = !this.isZombie || this.scale > 1;
        this.lastPosition = new THREE.Vector3(info.x || 0, info.y || 0, info.z || 0);

        this.nameTag = this.createNameTag();
        this.nameTag.visible = !isSelf && this.nameVisible;
        this.group.add(this.nameTag);
        this.setCharacter(info.characterId);
        this.setHeldItem(info.item || 'knife');
        this.group.position.copy(this.lastPosition);
        this.group.rotation.y = info.yaw || 0;
        scene.add(this.group);
    }

    setCharacter(characterId) {
        if (this.characterId === characterId && this.model) return;
        this.characterId = characterId;
        if (this.model) {
            this.group.remove(this.model.root);
            this.model.dispose();
        }
        this.model = createCharacterModel(characterId);
        this.group.add(this.model.root);
        this.nameTag.position.y = (this.model.dims.legH + this.model.dims.torsoH + this.model.dims.head) * this.model.root.scale.y + 0.45;
        const held = this.heldItemId;
        this.heldItemId = null;
        if (held) this.setHeldItem(held);
        if (!this.alive) this.model.die();
        if (this.god) {
            this.god = false;
            this.setGod(true);
        }
        if (this.jetpack) {
            this.jetpack = null;
            this.setJetpack(true);
        }
    }

    // Zombies jetpack (GTA San Andreas): a grey pack on the back with two rocket tanks; the
    // flames come out of nozzles() as particles (Game) while jetting
    setJetpack(on) {
        if (on === !!this.jetpack) return;
        if (!on) {
            this.jetpack.parent?.remove(this.jetpack);
            this.jetpack.traverse(o => o.isMesh && o.geometry.dispose());
            this.jetpack = this.nozzleAnchors = null;
            this.jetting = false;
            return;
        }
        const { torsoH, torsoD } = this.model.dims;
        const grey = new THREE.MeshLambertMaterial({ color: '#8a9099' });
        const dark = new THREE.MeshLambertMaterial({ color: '#3a3f46' });
        const red = new THREE.MeshLambertMaterial({ color: '#c8322a' });
        const box = (w, h, d, material, x, y, z, parent) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            parent.add(mesh);
            return mesh;
        };
        const pack = new THREE.Group();
        pack.position.set(0, torsoH * 0.55, torsoD / 2 + 0.07);
        box(0.36, 0.46, 0.12, dark, 0, 0, 0, pack);
        this.nozzleAnchors = [-1, 1].map(side => {
            const x = side * 0.17;
            box(0.15, 0.5, 0.15, grey, x, 0.02, 0.1, pack);
            box(0.16, 0.1, 0.16, red, x, 0.3, 0.1, pack);        // nose cap
            box(0.11, 0.08, 0.11, dark, x, -0.27, 0.1, pack);    // nozzle
            const anchor = new THREE.Object3D();
            anchor.position.set(x, -0.33, 0.1);
            pack.add(anchor);
            return anchor;
        });
        this.model.body.add(pack);
        this.jetpack = pack;
    }

    // World positions of the two jetpack nozzles, written into out (two Vector3s)
    nozzles(out) {
        if (!this.nozzleAnchors) return false;
        this.group.updateWorldMatrix(true, true);
        this.nozzleAnchors[0].getWorldPosition(out[0]);
        this.nozzleAnchors[1].getWorldPosition(out[1]);
        return true;
    }

    // Zombies angel: blocky white wings on the back, a gold halo and a golden shine while it lasts
    setGod(on) {
        if (on === !!this.god) return;
        this.god = on;
        this.model.setGlow(on);
        if (!on) {
            for (const part of [...(this.wings || []), this.halo]) {
                part?.parent?.remove(part);
                part?.traverse(o => o.isMesh && o.geometry.dispose());
            }
            this.wings = this.halo = null;
            return;
        }
        const { torsoH, torsoD, head } = this.model.dims;
        const white = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#d6e2ff', emissiveIntensity: 0.5 });
        const gold = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
        this.wings = [-1, 1].map(side => {
            const wing = new THREE.Group();
            wing.position.set(side * 0.08, torsoH * 0.82, torsoD / 2 + 0.04);
            wing.userData.side = side;
            // Feathers in tiers: long on top, shorter below, all sweeping outwards
            for (let i = 0; i < 4; i++) {
                const length = 0.62 - i * 0.12;
                const feather = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, 0.05), white);
                feather.position.set(side * (length / 2), 0.08 - i * 0.11, 0);
                wing.add(feather);
            }
            this.model.body.add(wing);
            return wing;
        });
        this.halo = new THREE.Group();
        for (const [w, d, x, z] of [[0.4, 0.06, 0, 0.17], [0.4, 0.06, 0, -0.17], [0.06, 0.28, 0.17, 0], [0.06, 0.28, -0.17, 0]]) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), gold);
            bar.position.set(x, 0, z);
            this.halo.add(bar);
        }
        this.halo.position.y = head + 0.16;
        this.model.head.add(this.halo);
    }

    setHeldItem(itemId) {
        if (itemId === this.heldItemId) return;
        if (this.held) this.held.parent?.remove(this.held);
        this.heldItemId = itemId;
        const view = getItemView(itemId);
        this.held = view ? view.createThirdPerson() : null;
        if (this.held) this.model.handAnchor.add(this.held);
    }

    setName(name) {
        this.name = name;
        this.drawNameTag();
    }

    setHealth(health) {
        this.health = health;
        this.drawNameTag();
    }

    // Team modes: coloured name tags (T orange, CT blue)
    setTeam(team) {
        if (team === this.team) return;
        this.team = team;
        this.drawNameTag();
    }

    // Enemies' names are hidden in team modes, like CS
    setNameVisible(visible) {
        this.nameVisible = visible;
        this.nameTag.visible = visible && this.alive && !this.isSelf;
    }

    createNameTag() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 72;
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
        sprite.scale.set(1.5, 0.42, 1);
        sprite.userData = { canvas, texture };
        this.nameTagSprite = sprite;
        queueMicrotask(() => this.drawNameTag());
        return sprite;
    }

    drawNameTag() {
        const { canvas, texture } = this.nameTagSprite.userData;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = getNameTagFont(ctx);
        const width = Math.min(250, ctx.measureText(this.name).width + 20);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect((256 - width) / 2, 0, width, 40);
        ctx.fillStyle = this.team === 't' ? '#ffb06a' : this.team === 'ct' ? '#8ec9ff' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.name, 128, 22, 240);
        // Health bar
        const ratio = Math.max(0, Math.min(1, this.health / this.maxHealth));
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(48, 50, 160, 14);
        ctx.fillStyle = ratio > 0.5 ? '#4cd964' : ratio > 0.25 ? '#ffcc00' : '#ff3b30';
        ctx.fillRect(50, 52, 156 * ratio, 10);
        texture.needsUpdate = true;
    }

    pushSnapshot(state) {
        const now = performance.now();
        this.buffer.push({ t: now, state });
        while (this.buffer.length > 2 && this.buffer[1].t < now - 1000) this.buffer.shift();
        this.onGround = state.onGround;
        this.crouching = !!state.crouching;
        if (state.item !== undefined) this.setHeldItem(state.item);
        if (state.health !== this.health) this.setHealth(state.health);
    }

    // Snap to a position (respawn / teleport)
    snapTo(x, y, z, yaw = this.group.rotation.y) {
        this.buffer = [];
        this.group.position.set(x, y, z);
        this.lastPosition.set(x, y, z);
        this.group.rotation.y = yaw;
    }

    // Direct pose for the local player's own body
    setPose(x, y, z, yaw, pitch, onGround, crouching = false) {
        this.group.position.set(x, y, z);
        this.group.rotation.y = yaw;
        this.pitch = pitch;
        this.onGround = onGround;
        this.crouching = crouching;
    }

    // Roughly where this player's gun barrel is, for remote muzzle flashes and tracers
    muzzlePosition(out = new THREE.Vector3()) {
        const yaw = this.group.rotation.y;
        const p = this.group.position;
        const eye = this.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
        const fx = -Math.sin(yaw) * Math.cos(this.pitch);
        const fz = -Math.cos(yaw) * Math.cos(this.pitch);
        return out.set(
            p.x + fx * 0.9 + Math.cos(yaw) * 0.22,
            p.y + eye - 0.25 + Math.sin(this.pitch) * 0.9,
            p.z + fz * 0.9 - Math.sin(yaw) * 0.22
        );
    }

    interpolate(now) {
        if (this.buffer.length === 0) return;
        const renderTime = now - INTERPOLATION_DELAY;
        let i = this.buffer.length - 1;
        while (i > 0 && this.buffer[i - 1].t > renderTime) i--;
        const b = this.buffer[i];
        const a = this.buffer[i - 1];
        if (!a || renderTime >= b.t) {
            this.applyState(b.state, b.state, 1);
            return;
        }
        const t = THREE.MathUtils.clamp((renderTime - a.t) / (b.t - a.t), 0, 1);
        this.applyState(a.state, b.state, t);
    }

    applyState(a, b, t) {
        this.group.position.set(
            THREE.MathUtils.lerp(a.x, b.x, t),
            THREE.MathUtils.lerp(a.y, b.y, t),
            THREE.MathUtils.lerp(a.z, b.z, t)
        );
        let turn = b.yaw - a.yaw;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        this.group.rotation.y = a.yaw + turn * t;
        this.pitch = THREE.MathUtils.lerp(a.pitch ?? 0, b.pitch ?? 0, t); // monsters don't send pitch
    }

    playAction(action) {
        this.model.playAction(action);
    }

    hurt(strength, headshot) {
        this.model.hurt(strength, headshot);
    }

    die() {
        this.alive = false;
        this.model.die();
        this.nameTag.visible = false;
    }

    respawn(x, y, z, yaw) {
        this.alive = true;
        this.model.revive();
        this.snapTo(x, y, z, yaw);
        this.nameTag.visible = !this.isSelf && this.nameVisible;
        this.setHealth(this.maxHealth);
    }

    setVisible(visible) {
        this.group.visible = visible;
    }

    update(dt, now) {
        if (!this.isSelf) this.interpolate(now);
        const pos = this.group.position;
        const moved = Math.hypot(pos.x - this.lastPosition.x, pos.z - this.lastPosition.z);
        const instant = dt > 0 ? moved / dt : 0;
        this.speed += (instant - this.speed) * Math.min(1, dt * 12);
        this.lastPosition.copy(pos);

        if (this.wings) {
            // Slow beat, the wings swing back and forth around the spine
            const beat = Math.sin(now / 1000 * 7);
            for (const wing of this.wings) wing.rotation.y = wing.userData.side * (-0.5 + beat * 0.35);
            this.halo.position.y = this.model.dims.head + 0.16 + Math.sin(now / 1000 * 3) * 0.03;
        }
        this.model.animate(dt, {
            speed: this.alive ? this.speed : 0,
            onGround: this.onGround,
            aiming: this.alive && isGun(this.heldItemId),
            crouching: this.alive && this.crouching,
            pitch: this.pitch
        });
    }

    dispose() {
        this.scene.remove(this.group);
        this.model.dispose();
        this.nameTagSprite.userData.texture.dispose();
    }
}
