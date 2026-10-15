import * as THREE from 'three';
import { PLAYER } from '../../shared/constants.js';
import { createCharacterModel } from '../characters/registry.js';
import { getItemView } from '../items/registry.js';
import { isGun } from '../../shared/config/weapons.js';

export const INTERPOLATION_DELAY = 100; // ms behind the newest snapshot, for smooth remote movement

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
        this.nameVisible = true;
        this.lastPosition = new THREE.Vector3(info.x || 0, info.y || 0, info.z || 0);

        this.nameTag = this.createNameTag();
        this.nameTag.visible = !isSelf;
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
        this.nameTag.position.y = this.model.dims.legH + this.model.dims.torsoH + this.model.dims.head + 0.45;
        const held = this.heldItemId;
        this.heldItemId = null;
        if (held) this.setHeldItem(held);
        if (!this.alive) this.model.die();
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
        ctx.font = '28px "Press Start 2P", monospace';
        const width = Math.min(250, ctx.measureText(this.name).width + 20);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect((256 - width) / 2, 0, width, 40);
        ctx.fillStyle = this.team === 't' ? '#ffb06a' : this.team === 'ct' ? '#8ec9ff' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.name, 128, 22, 240);
        // Health bar
        const ratio = Math.max(0, this.health / PLAYER.maxHealth);
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
        this.setHeldItem(state.item);
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
        this.pitch = THREE.MathUtils.lerp(a.pitch, b.pitch, t);
    }

    playAction(action) {
        this.model.playAction(action);
    }

    hurt() {
        this.model.hurt();
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
        this.setHealth(PLAYER.maxHealth);
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
