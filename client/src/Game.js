import * as THREE from 'three';
import { AXE, BOW, NET, PLAYER } from '../shared/constants.js';
import { C2S, S2C } from '../shared/protocol.js';
import { directionFromAngles, normalize } from '../shared/math.js';
import { Arena, BLOCK_STATE } from '../shared/world/Arena.js';
import { getItem } from '../shared/items/ItemRegistry.js';
import { Bow } from '../shared/items/Bow.js';
import { DEBRIS_COLORS, WorldRenderer } from './world/WorldRenderer.js';
import { Particles } from './effects/Particles.js';
import { PlayerAvatar } from './entities/PlayerAvatar.js';
import { ProjectileView } from './entities/ProjectileView.js';
import { PickupView } from './entities/PickupView.js';
import { CameraController } from './camera/CameraViews.js';
import { ViewModel } from './camera/ViewModel.js';
import { InputManager } from './input/InputManager.js';
import { LocalPlayerController } from './player/LocalPlayerController.js';
import { Hud } from './ui/Hud.js';
import { Scoreboard } from './ui/Scoreboard.js';
import { RespawnOverlay } from './ui/RespawnOverlay.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { el } from './ui/dom.js';

const PICKUP_NAMES = { arrow: 'Arrows', health_potion: 'Health Potion' };

// Client game: renders the arena, predicts the local player, sends inputs and reacts to the
// authoritative room's events. Works the same with a LocalConnection or an OnlineConnection.
export class Game {
    constructor({ container, ui, connection, profile, sound, onEditProfile, onLeave }) {
        this.connection = connection;
        this.profile = profile;
        this.sound = sound;
        this.onEditProfile = onEditProfile;
        this.onLeave = onLeave;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.autoClear = false;
        container.append(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 1000);
        this.scene.add(this.camera);
        this.world = new WorldRenderer(this.scene);
        this.particles = new Particles(this.scene);
        this.viewModel = new ViewModel();
        this.cameraController = new CameraController(this.camera, profile.cameraMode);
        this.input = new InputManager(this.renderer.domElement);
        this.local = new LocalPlayerController();

        this.hud = new Hud(ui);
        this.hud.setMode(connection.isOnline ? 'ONLINE' : 'OFFLINE · VS BOTS');
        this.scoreboard = new Scoreboard(ui);
        this.respawnOverlay = new RespawnOverlay(ui);
        this.pauseMenu = new PauseMenu(ui, {
            profile,
            onResume: () => this.resume(),
            onEditProfile: () => {
                this.pauseMenu.hide();
                this.onEditProfile();
            },
            onToggleCamera: () => this.toggleCamera(),
            onVolume: v => {
                profile.volume = v;
                sound.setVolume(v);
                profile.save();
            },
            onSensitivity: v => {
                profile.sensitivity = v;
                profile.save();
            },
            onLeave: () => this.onLeave()
        });
        this.pauseMenu.setCameraLabel(this.cameraController.view.label);
        this.clickToPlay = el('div.overlay.hidden', {}, el('div.click-to-play', { text: 'Click to play', onclick: () => this.resume() }));
        ui.append(this.clickToPlay);

        this.players = new Map();       // id -> { id, name, characterId, isBot, alive, health, kills, deaths, avatar }
        this.projectiles = new Map();
        this.pickups = new Map();
        this.selfId = null;
        this.arena = null;
        this.inventory = null;
        this.drawStartedAt = null;
        this.nextUseAt = 0;
        this.sendTimer = 0;
        this.stepTimer = 0;
        this.protectedUntil = 0;
        this.deathCam = null;
        this.editingProfile = false;

        this.bindInput();
        this.bindNetwork();
        window.addEventListener('resize', () => this.resize());
        this.resize();
    }

    start() {
        this.input.enabled = true;
        this.connection.join(this.profile);
        this.clickToPlay.classList.remove('hidden');
        let last = performance.now();
        const frame = now => {
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            this.update(dt, now);
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    // ---- menus and pointer lock -------------------------------------------------------------

    resume() {
        this.sound.unlock();
        this.pauseMenu.hide();
        this.clickToPlay.classList.add('hidden');
        this.input.requestLock();
    }

    pause() {
        if (this.editingProfile) return;
        this.cancelDraw();
        this.scoreboard.hide();
        this.clickToPlay.classList.add('hidden');
        this.pauseMenu.show();
    }

    // Called by main.js around the character/name editor
    setEditingProfile(editing) {
        this.editingProfile = editing;
        if (!editing) this.pauseMenu.show();
    }

    applyProfile() {
        this.connection.send(C2S.PROFILE, { name: this.profile.name, characterId: this.profile.characterId });
    }

    toggleCamera() {
        const view = this.cameraController.toggle();
        this.profile.cameraMode = view.id;
        this.profile.save();
        this.pauseMenu.setCameraLabel(view.label);
        this.hud.toast(view.label);
    }

    resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.viewModel.setAspect(w / h);
    }

    // ---- input ------------------------------------------------------------------------------

    bindInput() {
        this.input.onLockChange = locked => {
            if (locked) {
                this.pauseMenu.hide();
                this.clickToPlay.classList.add('hidden');
            } else {
                this.pause();
            }
        };
        this.input.onAction = (action, value) => {
            if (!this.selfId) return;
            switch (action) {
                case 'slot': return this.selectSlot(value);
                case 'cycle': return this.inventory && this.selectSlot((this.inventory.selected + value + this.inventory.hotbar.length) % this.inventory.hotbar.length);
                case 'camera': return this.toggleCamera();
                case 'scoreboard': return value ? this.scoreboard.show(this.players, this.selfId) : this.scoreboard.hide();
                case 'primary': return this.onPrimary(value);
                case 'pause': return this.input.exitLock();
            }
        };
    }

    get canAct() {
        return this.selfId && this.local.alive && this.input.locked && this.inventory;
    }

    get selectedItem() {
        return this.inventory ? getItem(this.inventory.hotbar[this.inventory.selected]) : null;
    }

    selectSlot(slot) {
        if (!this.inventory || slot < 0 || slot >= this.inventory.hotbar.length || slot === this.inventory.selected) return;
        this.cancelDraw();
        this.inventory.selected = slot;
        this.hud.setSelected(slot);
        this.viewModel.setItem(this.inventory.hotbar[slot]);
        this.self?.avatar.setHeldItem(this.inventory.hotbar[slot]);
        this.connection.send(C2S.SELECT, { slot });
        this.sound.play('select');
    }

    onPrimary(down) {
        const item = this.selectedItem;
        if (!this.canAct || !item) return;
        if (item.chargeable) {
            if (down) this.startDraw(item);
            else this.releaseDraw();
        } else if (down) {
            this.useHeldItem();
        }
    }

    startDraw(item) {
        if (this.inventory.counts[item.countKey] <= 0) {
            this.sound.play('empty');
            this.hud.toast('No arrows! Grab the yellow pickups');
            return;
        }
        this.drawStartedAt = performance.now();
        this.connection.send(C2S.DRAW, { drawing: true });
        this.self.avatar.drawing = true;
        this.sound.play('bowDraw');
    }

    releaseDraw() {
        if (this.drawStartedAt === null) return;
        const charge = (performance.now() - this.drawStartedAt) / 1000;
        this.drawStartedAt = null;
        this.self.avatar.drawing = false;
        if (charge < BOW.minDraw) {
            this.connection.send(C2S.DRAW, { drawing: false });
            return;
        }
        this.connection.send(C2S.USE, { slot: this.inventory.selected, dir: this.aimDirection(), charge });
        this.viewModel.play('shoot');
        this.self.avatar.playAction('shoot');
        this.sound.play('bowShoot');
        this.protectedUntil = 0;
    }

    cancelDraw() {
        if (this.drawStartedAt === null) return;
        this.drawStartedAt = null;
        if (this.self) this.self.avatar.drawing = false;
        this.connection.send(C2S.DRAW, { drawing: false });
    }

    useHeldItem() {
        const now = performance.now();
        const item = this.selectedItem;
        if (!item || now < this.nextUseAt) return;
        if (item.countKey && (this.inventory.counts[item.countKey] || 0) <= 0) {
            this.sound.play('empty');
            this.hud.toast(item.id === 'health_potion' ? 'No potions! Get a kill or find one' : `No ${item.name}`);
            this.nextUseAt = now + 600;
            return;
        }
        if (item.id === 'health_potion' && this.self.health >= PLAYER.maxHealth) {
            this.hud.toast('Already at full health');
            this.nextUseAt = now + 600;
            return;
        }
        this.connection.send(C2S.USE, { slot: this.inventory.selected, dir: this.aimDirection() });
        this.nextUseAt = now + item.cooldown * 1000;
        this.viewModel.play(item.action);
        this.self.avatar.playAction(item.action);
        this.sound.play(item.action === 'drink' ? 'drink' : 'swing', { pitch: 0.9 + Math.random() * 0.2 });
        if (item.action === 'swing') this.protectedUntil = 0;
    }

    // Where the crosshair points, as a direction from the player's eye
    aimDirection() {
        const forward = directionFromAngles(this.local.yaw, this.local.pitch);
        if (this.cameraController.view.id === 'first') return forward;
        const cam = this.camera.position;
        const hit = this.arena.raycast(cam, forward, 60);
        const target = hit ? hit.point : { x: cam.x + forward.x * 60, y: cam.y + forward.y * 60, z: cam.z + forward.z * 60 };
        const eye = this.local.eye;
        return normalize({ x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z });
    }

    // ---- network ----------------------------------------------------------------------------

    get self() {
        return this.players.get(this.selfId);
    }

    bindNetwork() {
        const on = (type, handler) => this.connection.on(type, data => handler.call(this, data));
        on(S2C.WELCOME, this.onWelcome);
        on(S2C.SNAPSHOT, this.onSnapshot);
        on(S2C.PLAYER_JOINED, p => {
            if (!this.players.has(p.id)) {
                this.addPlayer(p);
                if (this.selfId && p.id !== this.selfId) this.hud.toast(`${p.name} joined`);
            }
        });
        on(S2C.PLAYER_LEFT, ({ id }) => {
            const info = this.players.get(id);
            if (!info) return;
            info.avatar.dispose();
            this.players.delete(id);
            this.hud.toast(`${info.name} left`);
        });
        on(S2C.PLAYER_UPDATED, ({ id, name, characterId }) => {
            const info = this.players.get(id);
            if (!info) return;
            Object.assign(info, { name, characterId });
            info.avatar.setName(name);
            info.avatar.setCharacter(characterId);
        });
        on(S2C.INVENTORY, this.onInventory);
        on(S2C.ACTION, ({ id, action }) => {
            if (id === this.selfId) return; // already played locally
            const info = this.players.get(id);
            if (!info) return;
            info.avatar.playAction(action);
            const at = info.avatar.group.position;
            if (action === 'swing') this.sound.play('swing', { at });
            if (action === 'drink') this.sound.play('drink', { at });
        });
        on(S2C.BLOCK_CRACKING, this.onBlockCracking);
        on(S2C.BLOCK_BROKEN, ({ ix, iy, iz }) => {
            this.arena.setState(ix, iy, iz, BLOCK_STATE.BROKEN);
            this.world.break(ix, iy, iz);
            const c = this.arena.blockCenter(ix, iy, iz);
            const colors = DEBRIS_COLORS[this.arena.kindAt(ix, iy, iz)] || DEBRIS_COLORS[1];
            this.particles.burst(c, { count: 22, colors, speed: 4, up: 3, size: 0.14, spread: 0.8 });
            this.sound.play('break', { at: c });
        });
        on(S2C.BLOCK_RESTORED, ({ ix, iy, iz }) => {
            this.arena.setState(ix, iy, iz, BLOCK_STATE.SOLID);
            this.world.restore(ix, iy, iz);
            this.sound.play('restore', { at: this.arena.blockCenter(ix, iy, iz), volume: 0.6 });
        });
        on(S2C.PROJECTILE, data => {
            this.projectiles.set(data.id, new ProjectileView(this.scene, data));
            if (data.ownerId !== this.selfId) this.sound.play('bowShoot', { at: data });
        });
        on(S2C.PROJECTILE_END, data => {
            const view = this.projectiles.get(data.id);
            if (view) view.end(data);
            if (data.stuck) this.sound.play('arrowStick', { at: data });
        });
        on(S2C.DAMAGE, this.onDamage);
        on(S2C.HEAL, ({ id, health }) => {
            const info = this.players.get(id);
            if (!info) return;
            info.health = health;
            info.avatar.setHealth(health);
            const pos = info.avatar.group.position;
            this.particles.burst({ x: pos.x, y: pos.y + 1.2, z: pos.z }, { count: 14, colors: ['#ff6fa8', '#ffc2db'], up: 3, speed: 1.5, gravity: -2, glow: true, size: 0.08 });
            if (id === this.selfId) {
                this.hud.setHealth(health);
                this.hud.flash('heal');
                this.sound.play('heal');
            }
        });
        on(S2C.DEATH, this.onDeath);
        on(S2C.RESPAWN, this.onRespawn);
        on(S2C.PICKUP_SPAWNED, data => {
            this.pickups.set(data.id, new PickupView(this.scene, data));
            this.sound.play('spawnPickup', { at: { x: data.x, y: data.y, z: data.z } });
            if (data.type === 'health_potion') this.hud.toast('A health potion appeared!');
        });
        on(S2C.PICKUP_TAKEN, ({ id, by, type, amount }) => {
            const view = this.pickups.get(id);
            if (view) {
                const p = view.group.position;
                this.particles.burst({ x: p.x, y: p.y + 0.8, z: p.z }, { count: 12, colors: ['#ffd23f', '#ffffff'], up: 2, speed: 2, gravity: 2, glow: true, size: 0.07 });
                view.dispose();
                this.pickups.delete(id);
            }
            if (by && by === this.selfId) {
                this.sound.play('pickup');
                this.hud.toast(`+${amount} ${PICKUP_NAMES[type] || type}`);
            }
        });
    }

    onWelcome(data) {
        this.selfId = data.selfId;
        this.arena = Arena.fromJSON(data.arena);
        this.world.setArena(this.arena);
        for (const p of data.players) this.addPlayer(p);
        const me = this.self;
        this.local.teleport(me.x, me.y, me.z, me.yaw);
        this.local.alive = me.alive;
        this.protectedUntil = performance.now() + PLAYER.spawnProtection * 1000;
        for (const pickup of data.pickups) this.pickups.set(pickup.id, new PickupView(this.scene, pickup));
        for (const projectile of data.projectiles) this.projectiles.set(projectile.id, new ProjectileView(this.scene, projectile));
    }

    addPlayer(p) {
        const isSelf = p.id === this.selfId;
        const avatar = new PlayerAvatar(this.scene, p, { isSelf });
        this.players.set(p.id, {
            id: p.id, name: p.name, characterId: p.characterId, isBot: p.isBot,
            alive: p.alive, health: p.health, kills: p.kills, deaths: p.deaths,
            x: p.x, y: p.y, z: p.z, yaw: p.yaw, avatar
        });
        if (!p.alive) avatar.die();
    }

    onSnapshot({ players }) {
        for (const p of players) {
            const info = this.players.get(p.id);
            if (!info) continue;
            info.kills = p.kills;
            info.deaths = p.deaths;
            info.health = p.health;
            if (p.id === this.selfId) this.hud.setHealth(p.health);
            else info.avatar.pushSnapshot(p);
        }
    }

    onInventory(data) {
        // The local hotbar selection wins; it's sent to the server whenever it changes
        const selected = this.inventory ? Math.min(this.inventory.selected, data.hotbar.length - 1) : data.selected;
        this.inventory = { ...data, selected };
        this.hud.setInventory(this.inventory);
        const itemId = this.inventory.hotbar[selected];
        this.viewModel.setItem(itemId);
        this.self?.avatar.setHeldItem(itemId);
    }

    onBlockCracking({ ix, iy, iz }) {
        this.arena.setState(ix, iy, iz, BLOCK_STATE.CRACKING);
        this.world.crack(ix, iy, iz);
        this.sound.play('crack', { at: this.arena.blockCenter(ix, iy, iz) });
        // Warn if it's the block under our feet
        const { x, y, z, onGround } = this.local.body;
        const under = this.arena.supportBlock(x, y, z, PLAYER.radius);
        if (this.local.alive && onGround && under && under.ix === ix && under.iy === iy && under.iz === iz) this.hud.flash('danger');
    }

    onDamage({ victimId, attackerId, health, knockback, weapon, zone, headshot }) {
        const victim = this.players.get(victimId);
        if (!victim) return;
        victim.health = health;
        victim.avatar.setHealth(health);
        victim.avatar.hurt();
        const pos = victimId === this.selfId ? this.local.body : victim.avatar.group.position;
        // Our own hit particles would spawn inside the camera; the red vignette shows it instead
        if (victimId !== this.selfId) {
            this.particles.burst({ x: pos.x, y: pos.y + 1.1, z: pos.z }, { count: 10, colors: ['#ff2a2a', '#a30000'], speed: 3, up: 2.5, size: 0.08 });
        }
        this.sound.play(weapon === 'bow' ? 'arrowHit' : 'hit', { at: { x: pos.x, y: pos.y + 1, z: pos.z } });

        if (victimId === this.selfId) {
            this.hud.setHealth(health);
            this.hud.flash('damage');
            this.sound.play('hurt');
            if (knockback) this.local.applyKnockback(knockback);
            this.shake = 0.25;
        }
        if (attackerId === this.selfId && victimId !== this.selfId) {
            this.hud.hit(zone === 'head');
            this.sound.play(zone === 'head' ? 'headshot' : 'hitmarker');
            if (headshot) this.hud.toast('🎯 HEADSHOT!');
        }
        if (victimId === this.selfId && headshot) this.hud.toast('🎯 Headshot!');
    }

    onDeath({ victimId, killerId, cause }) {
        const victim = this.players.get(victimId);
        const killer = this.players.get(killerId);
        if (!victim) return;
        victim.alive = false;
        victim.avatar.die();
        this.hud.kill({
            killer: killer?.name,
            victim: victim.name,
            weapon: cause,
            mine: victimId === this.selfId || killerId === this.selfId
        });
        const pos = victimId === this.selfId ? this.local.body : victim.avatar.group.position;
        this.sound.play('death', { at: { x: pos.x, y: pos.y + 1, z: pos.z } });

        if (victimId === this.selfId) {
            this.local.alive = false;
            this.cancelDraw();
            this.deathCam = { x: this.local.body.x, y: Math.max(this.local.body.y, -2), z: this.local.body.z, yaw: this.local.yaw, t: 0 };
            const reason = killer
                ? (cause === 'fall' ? `${killer.name} made you fall`
                    : cause === 'headshot' ? `${killer.name} got you with a headshot` : `Killed by ${killer.name}`)
                : (cause === 'fall' ? 'You fell into the void' : 'You died');
            this.respawnOverlay.show(reason, PLAYER.respawnDelay);
        }
        if (killerId === this.selfId && victimId !== this.selfId) {
            this.sound.play('kill');
            this.hud.toast(`You got ${victim.name}! +1 Health Potion`);
        }
    }

    onRespawn({ id, x, y, z, yaw, health }) {
        const info = this.players.get(id);
        if (!info) return;
        info.alive = true;
        info.health = health;
        info.avatar.respawn(x, y, z, yaw);
        if (id === this.selfId) {
            this.local.teleport(x, y, z, yaw);
            this.local.alive = true;
            this.deathCam = null;
            this.respawnOverlay.hide();
            this.hud.setHealth(health);
            this.protectedUntil = performance.now() + PLAYER.spawnProtection * 1000;
            this.sound.play('respawn');
        }
    }

    // ---- frame ------------------------------------------------------------------------------

    update(dt, now) {
        if (this.selfId && this.arena) this.updateLocalPlayer(dt, now);

        for (const info of this.players.values()) info.avatar.update(dt, now);
        for (const [id, view] of this.projectiles) {
            if (!view.update(dt)) this.projectiles.delete(id);
        }
        for (const view of this.pickups.values()) view.update(dt);
        this.particles.update(dt);
        this.world.update(dt);

        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        if (this.cameraController.view.showsViewModel && this.local.alive) this.viewModel.render(this.renderer);
    }

    updateLocalPlayer(dt, now) {
        const active = this.input.locked && !this.pauseMenu.visible;
        const { dx, dy } = this.input.consumeMouse();
        if (active) this.local.look(dx, dy, this.profile.sensitivity);
        const move = active ? this.input.movement : { forward: 0, strafe: 0 };
        this.local.update(dt, { ...move, jump: active && this.input.jump }, this.arena);

        const body = this.local.body;
        const speed = this.local.horizontalSpeed;
        this.sound.setListener(body.x, body.y + PLAYER.eyeHeight, body.z, this.local.yaw);

        // Footsteps, jump and landing sounds
        if (this.local.alive && body.onGround && speed > 1) {
            this.stepTimer -= dt * speed;
            if (this.stepTimer <= 0) {
                this.stepTimer = 1.7;
                this.sound.play('step', { pitch: 0.85 + Math.random() * 0.3 });
            }
        }
        if (this.local.events.jumped) this.sound.play('jump');
        if (this.local.events.landed) this.sound.play('land');

        // Send our state ~20 times a second
        this.sendTimer -= dt;
        if (this.local.alive && this.sendTimer <= 0) {
            this.sendTimer = 1 / NET.clientSendRate;
            this.connection.send(C2S.STATE, this.local.networkState);
        }

        // Hold the mouse to keep chopping
        const item = this.selectedItem;
        if (active && this.input.primaryDown && item && !item.chargeable && item.id !== 'health_potion') this.useHeldItem();

        // Bow draw UI
        const drawing = this.drawStartedAt !== null;
        const draw = drawing ? Bow.drawProgress((now - this.drawStartedAt) / 1000) : 0;
        this.hud.setCharge(drawing ? draw : null);
        this.viewModel.setDraw(draw);

        const self = this.self;
        if (self) {
            self.avatar.setPose(body.x, body.y, body.z, this.local.yaw, this.local.pitch, body.onGround);
            const view = this.cameraController.view;
            self.avatar.setVisible((view.showsOwnBody && !view.closeToEye) || !this.local.alive);
        }
        this.viewModel.update(dt, { speed, onGround: body.onGround });
        this.hud.setProtected(this.local.alive && now < this.protectedUntil);

        // Outline the block the axe would chop
        const aimBlock = this.local.alive && item?.id === 'axe'
            ? this.arena.raycast(this.local.eye, this.aimDirection(), AXE.reach)
            : null;
        this.world.setHighlight(aimBlock);

        this.updateCamera(dt);
    }

    updateCamera(dt) {
        if (this.deathCam) {
            // Slowly circle above where we died
            const c = this.deathCam;
            c.t += dt;
            const angle = c.yaw + c.t * 0.3;
            this.camera.position.set(c.x + Math.sin(angle) * 6, c.y + 4 + c.t * 0.3, c.z + Math.cos(angle) * 6);
            this.camera.lookAt(c.x, c.y, c.z);
            return;
        }
        this.cameraController.update({ eye: this.local.eye, yaw: this.local.yaw, pitch: this.local.pitch, arena: this.arena });
        if (this.shake > 0) {
            this.shake = Math.max(0, this.shake - dt);
            this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.3;
            this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
        }
    }
}
