import * as THREE from 'three';
import { GUN, NET, PLAYER } from '../shared/constants.js';
import { KNIFE, WEAPON_KIND, isGun, weaponSpec } from '../shared/config/weapons.js';
import { getModeInfo } from '../shared/config/modes.js';
import { C2S, S2C } from '../shared/protocol.js';
import { directionFromAngles, normalize } from '../shared/math.js';
import { Arena, BLOCK_STATE } from '../shared/world/Arena.js';
import { blockProps } from '../shared/world/blocks.js';
import { hitTest } from '../shared/game/BodyZones.js';
import { DEBRIS_COLORS, WorldRenderer } from './world/WorldRenderer.js';
import { Particles } from './effects/Particles.js';
import { GunEffects } from './effects/GunEffects.js';
import { INTERPOLATION_DELAY, PlayerAvatar } from './entities/PlayerAvatar.js';
import { ProjectileView } from './entities/ProjectileView.js';
import { PickupView } from './entities/PickupView.js';
import { CameraController } from './camera/CameraViews.js';
import { ViewModel } from './camera/ViewModel.js';
import { InputManager } from './input/InputManager.js';
import { LocalPlayerController } from './player/LocalPlayerController.js';
import { WeaponController } from './weapons/WeaponController.js';
import { Hud } from './ui/Hud.js';
import { Scoreboard } from './ui/Scoreboard.js';
import { RespawnOverlay } from './ui/RespawnOverlay.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { ModePanel } from './ui/ModePanel.js';
import { MatchEndOverlay } from './ui/MatchEndOverlay.js';
import { BuyMenu } from './ui/BuyMenu.js';
import { TEAM_BUY } from '../shared/config/modes.js';
import { el } from './ui/dom.js';
import { roomErrorText } from './ui/RoomBrowser.js';

const PICKUP_NAMES = { ammo: 'Ammo', health_potion: 'Health Potion', armor: 'Kevlar + Helmet' };
const STATS_INTERVAL_MS = 500;
const BASE_FOV = 75;
const STEP_SPEED = 3.3;          // slower than this (walking with Shift, crouching) is silent, like CS
const WHIZ_DISTANCE = 1.6;       // bullets passing this close to your head crack past your ears
const BLOOD = ['#9c0a0a', '#6e0606', '#c21a1a'];
// Sounds by block surface (see shared/world/blocks.js)
const IMPACT_SOUND = { grass: 'impactDirt', sand: 'impactDirt', snow: 'impactDirt', stone: 'impactStone', ice: 'impactStone', wood: 'impactWood' };
const STEP_SOUND = { grass: 'step', sand: 'stepSand', snow: 'stepSnow', stone: 'stepStone', ice: 'stepIce', wood: 'stepWood' };
const ZONE_HEIGHT = { head: 1.62, body: 1.15, legs: 0.5 };
const FIRE = ['#fff3b0', '#ffc23a', '#ff7a1a', '#e2401a'];
const SMOKE = ['#4a4a4a', '#6b6b6b', '#8a8580'];
// Mode-specific player fields copied from snapshots (see GameMode.playerJSON)
const MODE_FIELDS = ['score', 'level', 'levelKills', 'team', 'money', 'isZombie', 'maxHealth'];
const SCORE_LABEL = { ffa: 'KILLS', gungame: 'PTS', teambuy: 'KILLS', zombies: 'KILLS' };

// Client game: renders the arena, predicts the local player and its gunfire, sends inputs and
// reacts to the authoritative room's events. Works the same with a LocalConnection or an
// OnlineConnection.
export class Game {
    constructor({ container, ui, connection, profile, sound, onEditProfile, onLeave }) {
        this.connection = connection;
        this.profile = profile;
        this.sound = sound;
        this.onEditProfile = onEditProfile;
        // Ctrl crouches, and Ctrl+W (crouch + forward) would close the tab: ask first while playing
        this.leaveGuard = e => {
            e.preventDefault();
            e.returnValue = '';
        };
        this.onLeave = () => {
            window.removeEventListener('beforeunload', this.leaveGuard);
            onLeave();
        };

        this.renderer = new THREE.WebGLRenderer({ antialias: profile.graphics !== 'low', powerPreference: 'high-performance' });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.autoClear = false;
        container.append(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 1000);
        this.scene.add(this.camera);
        this.world = new WorldRenderer(this.scene);
        this.particles = new Particles(this.scene);
        this.effects = new GunEffects(this.scene);
        this.viewModel = new ViewModel();
        this.cameraController = new CameraController(this.camera, profile.cameraMode);
        this.input = new InputManager(this.renderer.domElement);
        this.local = new LocalPlayerController();
        this.weapons = new WeaponController(this);

        this.hud = new Hud(ui);
        this.hud.setMode(connection.isOnline ? 'ONLINE' : 'OFFLINE · BOTS');
        this.hud.setStatsVisible(profile.showStats);
        this.scoreboard = new Scoreboard(ui);
        this.modePanel = new ModePanel(this.hud.root);
        this.matchEnd = new MatchEndOverlay(ui);
        this.buyMenu = new BuyMenu(ui, {
            sound,
            onBuy: item => this.connection.send(C2S.BUY, { item }),
            onToggleRandom: () => this.setRandomGuns(!this.profile.randomGuns, true)
        });
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
            onShowStats: v => {
                profile.showStats = v;
                profile.save();
                this.hud.setStatsVisible(v);
            },
            onGraphics: v => {
                profile.graphics = v;
                profile.save();
                this.applyGraphics();
            },
            onLeave: () => this.onLeave()
        });
        this.pauseMenu.setCameraLabel(this.cameraController.view.label);
        this.clickToPlay = el('div.overlay.hidden', {}, el('div.click-to-play', { text: 'Click to play', onclick: () => this.resume() }));
        ui.append(this.clickToPlay);

        this.players = new Map();       // id -> { id, name, characterId, isBot, alive, health, kills, deaths, avatar, stepTimer }
        this.projectiles = new Map();
        this.pickups = new Map();
        this.selfId = null;
        this.arena = null;
        this.nextUseAt = 0;
        this.sendTimer = 0;
        this.stepTimer = 0;
        this.heartbeatTimer = 0;
        this.protectedUntil = 0;
        this.buyClosedAt = -Infinity;
        this.deathCam = null;
        this.editingProfile = false;
        this.serverOffset = null;       // server time - local time, smoothed
        this.modeId = 'ffa';
        this.modeState = null;
        this.zoom = 1;
        this.armor = 0;
        this.helmet = false;
        this.look = { dx: 0, dy: 0 };
        this.tmpVec = new THREE.Vector3();

        this.bindInput();
        this.bindNetwork();
        this.applyGraphics();
        window.addEventListener('resize', () => this.resize());
        this.resize();
    }

    // Low: no shadows and native-pixel rendering, for slow computers. High: shadows, sharper.
    applyGraphics() {
        const high = this.profile.graphics !== 'low';
        this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 1.5) : 1);
        if (this.renderer.shadowMap.enabled !== high) {
            this.renderer.shadowMap.enabled = high;
            this.world.sky.sunLight.castShadow = high;
            // Materials must recompile for the shadow change
            this.scene.traverse(o => {
                if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
            });
        }
        this.resize();
    }

    // request: {} for quick play, or { roomId, password }
    start(request = {}) {
        this.input.enabled = true;
        window.addEventListener('beforeunload', this.leaveGuard);
        this.connection.join(this.profile, request);
        this.clickToPlay.classList.remove('hidden');
        let last = performance.now();
        let frames = 0;
        let statsSince = last;
        const frame = now => {
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            this.update(dt, now);
            // Refresh the FPS / ping readout twice a second
            frames++;
            if (now - statsSince >= STATS_INTERVAL_MS) {
                this.updateStats(frames * 1000 / (now - statsSince));
                frames = 0;
                statsSince = now;
            }
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    // Latency = how far behind the other players you see are: one-way trip + interpolation buffer
    updateStats(fps) {
        const { ping, isOnline } = this.connection;
        this.hud.setStats({ fps, ping, online: isOnline, latency: (ping ?? 0) / 2 + INTERPOLATION_DELAY });
    }

    // The server time of the remote player positions currently on screen (for lag compensation)
    serverRenderTime() {
        if (this.serverOffset === null) return undefined;
        return performance.now() / 1000 + this.serverOffset - INTERPOLATION_DELAY / 1000;
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
        this.weapons.setTrigger(false);
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
        if (this.connection.isOnline) {
            this.connection.onStatus(status => {
                if (status !== 'online' && this.selfId) this.hud.toast('Connection lost: reconnecting...');
            });
        }
        this.input.onLockChange = locked => {
            if (locked) {
                this.pauseMenu.hide();
                this.clickToPlay.classList.add('hidden');
                return;
            }
            // Esc with the buy menu open only closes the buy menu (the browser frees the mouse
            // anyway, so one click gets back in); otherwise losing the mouse opens the game menu
            if (this.buyMenu.visible || performance.now() - this.buyClosedAt < 300) {
                this.buyMenu.hide();
                this.weapons.setTrigger(false);
                this.clickToPlay.classList.remove('hidden');
                return;
            }
            this.pause();
        };
        this.input.onAction = (action, value) => {
            if (!this.selfId) return;
            const w = this.weapons;
            // The buy menu takes the number keys while it's open
            if (action === 'slot' && this.buyMenu.visible) return this.buyMenu.key(value + 1);
            switch (action) {
                case 'buy': return this.toggleBuyMenu();
                case 'slot': return this.local.alive && w.select(value);
                case 'last': return this.local.alive && w.selectLast();
                case 'camera': return this.toggleCamera();
                case 'scoreboard': return value ? this.scoreboard.show(this.players, this.selfId, this.modeId, this.modeState) : this.scoreboard.hide();
                case 'primary': return w.setTrigger(value && !!this.canShoot);
                case 'secondary': return this.canAct && w.secondary();
                case 'reload': return this.canAct && w.startReload();
                case 'pause': return this.escape();
            }
        };
    }

    // Esc, step by step: close the buy menu, else open the game menu, else close the game menu
    escape() {
        if (this.buyMenu.visible) {
            this.buyMenu.hide();
            this.buyClosedAt = performance.now();
            return;
        }
        if (this.pauseMenu.visible && !this.editingProfile) {
            this.pauseMenu.hide();
            this.clickToPlay.classList.remove('hidden');
            return;
        }
        this.input.exitLock();
    }

    get canAct() {
        return this.selfId && this.local.alive && this.input.locked && this.weapons.inventory && !this.pauseMenu.visible;
    }

    // Shooting and knifing: not during freeze time (the server refuses those shots anyway)
    get canShoot() {
        return this.canAct && !this.frozen;
    }

    // Team Buy: in buy time. Zombies and Deathmatch: any time you're alive.
    get canBuy() {
        if (!this.local.alive) return false;
        if (this.modeId === 'zombies' || this.modeId === 'ffa') return true;
        const s = this.modeState;
        return this.modeId === 'teambuy' && s && (s.phase === 'freeze' || (s.phase === 'live' && s.buyLeft > 0));
    }

    get frozen() {
        return this.modeId === 'teambuy' && this.modeState?.phase === 'freeze';
    }

    toggleBuyMenu() {
        if (this.buyMenu.visible) return this.buyMenu.hide();
        if (this.modeId !== 'teambuy' && this.modeId !== 'zombies' && this.modeId !== 'ffa') return;
        if (!this.canBuy) {
            this.hud.toast('Buy time is over');
            return;
        }
        const free = this.modeId === 'ffa';
        this.buyMenu.show(this.self?.money ?? 0, this.self?.team, { free, randomGuns: free ? this.profile.randomGuns : null });
    }

    // Deathmatch: random guns every life, or keep the ones picked in the buy menu
    setRandomGuns(on, announce = false) {
        this.profile.randomGuns = on;
        this.profile.save();
        this.buyMenu.setRandomGuns(on);
        this.connection.send(C2S.PREFS, { randomGuns: on });
        if (announce) this.hud.toast(on ? 'Random guns ON: new guns every life' : 'Random guns OFF: you keep your guns');
    }

    useConsumable() {
        const now = performance.now();
        if (now < this.nextUseAt) return;
        const inv = this.weapons.inventory;
        if (!(inv.counts.health_potion > 0)) {
            this.sound.play('empty');
            this.hud.toast('No potions! Get a kill or find one');
            this.nextUseAt = now + 600;
            return;
        }
        if (this.self.health >= PLAYER.maxHealth) {
            this.hud.toast('Already at full health');
            this.nextUseAt = now + 600;
            return;
        }
        this.connection.send(C2S.USE, { slot: inv.selected, dir: this.aimDirection() });
        this.nextUseAt = now + 600;
        this.viewModel.play('drink');
        this.self.avatar.playAction('drink');
        this.sound.play('drink');
    }

    // Where the crosshair points, as a direction from the player's eye
    aimDirection() {
        const punch = this.weapons.punch;
        const forward = directionFromAngles(this.local.yaw + punch.yaw, this.local.pitch + punch.pitch);
        if (this.cameraController.view.id === 'first') return forward;
        const cam = this.camera.position;
        const hit = this.arena.raycast(cam, forward, 80);
        const target = hit ? hit.point : { x: cam.x + forward.x * 80, y: cam.y + forward.y * 80, z: cam.z + forward.z * 80 };
        const eye = this.local.eye;
        return normalize({ x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z });
    }

    // ---- weapon callbacks (from WeaponController) -------------------------------------------

    onWeaponChanged() {
        const w = this.weapons;
        if (!w.inventory) return;
        this.hud.setInventory(w.inventory);
        this.hud.setAmmo(isGun(w.id) ? w.ammo : null, weaponSpec(w.id)?.name || (w.id === 'health_potion' ? 'Health Potion' : ''), w.reloading);
        this.viewModel.setItem(w.id);
        this.self?.avatar.setHeldItem(w.id);
    }

    onScopeChanged(zoom) {
        this.zoom = zoom;
        this.camera.fov = BASE_FOV / zoom;
        this.camera.updateProjectionMatrix();
        this.hud.setScope(zoom > 1);
    }

    onReload() {
        this.self?.avatar.playAction('reload');
        this.onWeaponChanged();
    }

    // Our own shot: everything we can show without waiting for the server
    onLocalShot(spec, dirs) {
        this.protectedUntil = 0;
        if (spec.kind === WEAPON_KIND.LAUNCHER) return this.onLocalRocket(spec);
        this.sound.playShot(spec.id, null, { self: true });
        this.viewModel.fire({ shell: spec.kind !== WEAPON_KIND.SHOTGUN });
        this.self?.avatar.playAction('shoot');
        const eye = this.local.eye;
        const yaw = this.local.yaw;
        const forward = directionFromAngles(yaw, this.local.pitch);
        // Tracers start at the barrel, low and to the right of the eye
        const muzzle = {
            x: eye.x + forward.x * 0.7 + Math.cos(yaw) * 0.14,
            y: eye.y + forward.y * 0.7 - 0.14,
            z: eye.z + forward.z * 0.7 - Math.sin(yaw) * 0.14
        };
        this.effects.lightAt(muzzle);
        const tracerEvery = spec.pellets > 1 ? 3 : 1;
        dirs.forEach((dir, i) => {
            const distance = this.traceLocal(eye, dir, spec);
            if (i % tracerEvery === 0 && Math.random() < 0.7) {
                this.effects.tracer(muzzle, { x: eye.x + dir.x * distance, y: eye.y + dir.y * distance, z: eye.z + dir.z * distance });
            }
        });
        if (spec.kind !== WEAPON_KIND.SHOTGUN && spec.kind !== WEAPON_KIND.SNIPER) {
            setTimeout(() => this.sound.play('shell', { volume: 0.5 }), 380 + Math.random() * 200);
        }
        this.onWeaponChanged();
    }

    // Our own RPG shot: the server spawns the rocket, we show the launch and the backblast
    onLocalRocket(spec) {
        this.sound.playShot(spec.id, null, { self: true });
        this.viewModel.fire({ shell: false });
        this.self?.avatar.playAction('shoot');
        const eye = this.local.eye;
        const forward = directionFromAngles(this.local.yaw, this.local.pitch);
        const muzzle = { x: eye.x + forward.x * 1.1, y: eye.y + forward.y * 1.1 - 0.1, z: eye.z + forward.z * 1.1 };
        const back = { x: -forward.x, y: -forward.y, z: -forward.z };
        this.effects.lightAt(muzzle);
        this.particles.burst({ x: eye.x - forward.x * 0.8, y: eye.y - 0.1, z: eye.z - forward.z * 0.8 },
            { count: 26, colors: SMOKE, speed: 2, up: 1.2, gravity: -0.6, life: 1.4, size: 0.3, spread: 0.4, dir: back, dirSpeed: 6 });
        this.onWeaponChanged();
    }

    // A rocket landed: fireball, smoke, debris, the blast sound, and a shake when it's close
    explosion(at, radius) {
        this.effects.flash(at, radius * 1.2);
        this.particles.burst(at, { count: 60, colors: FIRE, speed: 9, up: 6, gravity: 4, life: 0.6, size: 0.3, spread: 1, glow: true });
        this.particles.burst(at, { count: 40, colors: SMOKE, speed: 4, up: 3, gravity: -1.2, life: 2.2, size: 0.55, spread: 1.6 });
        this.particles.burst(at, { count: 30, colors: ['#5b4632', '#7a7a7a', '#3e6b2a'], speed: 10, up: 9, gravity: 22, life: 1.2, size: 0.12, spread: 0.6 });
        this.sound.play('explosion', { at, range: 140, reverb: 0.4 });
        if (!this.local?.alive) return;
        const d = this.sound.distanceTo(at);
        if (d < radius * 3) this.weapons.flinch(60 * (1 - d / (radius * 3)));
    }

    onKnife(stab, dir) {
        this.protectedUntil = 0;
        this.viewModel.play(stab ? 'stab' : 'swing');
        this.self?.avatar.playAction(stab ? 'stab' : 'swing');
        this.sound.play(stab ? 'knifeStab' : 'knifeSlash');
        // Predict hitting a wall (the server's crack/damage events confirm the rest)
        const eye = this.local.eye;
        const block = this.arena.raycast(eye, dir, KNIFE.reach);
        if (block && !this.avatarHit(eye, dir, block.distance)) this.sound.play('knifeWall', { at: block.point });
    }

    // Predicted bullet path for our own shot, through penetrable blocks: marks every block hit
    // (hole, chips, sound) and returns how far the tracer should go.
    traceLocal(origin, dir, spec) {
        const playerDist = this.avatarHit(origin, dir, GUN.maxRange);
        let penetration = spec.penetration;
        let travelled = 0;
        let remaining = GUN.maxRange;
        const o = { x: origin.x, y: origin.y, z: origin.z };
        for (;;) {
            const block = this.arena.raycast(o, dir, remaining);
            const blockAt = block ? travelled + block.distance : Infinity;
            if (playerDist !== null && playerDist <= blockAt) return playerDist;
            if (!block) return travelled + remaining;
            this.impact(block, dir);
            if (penetration-- <= 0) return blockAt;
            const exit = this.arena.cellExit(block.ix, block.iy, block.iz, o, dir) + 0.01;
            o.x += dir.x * exit;
            o.y += dir.y * exit;
            o.z += dir.z * exit;
            travelled += exit;
            remaining -= exit;
            if (remaining <= 0) return travelled;
        }
    }

    // Distance to the nearest other player's hitbox as we see them, or null
    avatarHit(origin, dir, maxDist) {
        let best = null;
        for (const info of this.players.values()) {
            if (info.id === this.selfId || !info.alive) continue;
            const p = info.avatar.group.position;
            const hit = hitTest(origin, dir, maxDist, { x: p.x, y: p.y, z: p.z, crouching: info.avatar.crouching });
            if (hit && (best === null || hit.distance < best)) best = hit.distance;
        }
        return best;
    }

    // Bullet hits a block: hole, chips and the sound of the material
    impact(block, dir) {
        const { ix, iy, iz, point } = block;
        const kind = this.arena.kindAt(ix, iy, iz);
        const c = this.arena.blockCenter(ix, iy, iz);
        const dx = point.x - c.x;
        const dy = point.y - c.y;
        const dz = point.z - c.z;
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        const az = Math.abs(dz);
        const normal = ax >= ay && ax >= az ? { x: Math.sign(dx), y: 0, z: 0 }
            : ay >= az ? { x: 0, y: Math.sign(dy), z: 0 } : { x: 0, y: 0, z: Math.sign(dz) };
        this.effects.decal(point, normal, this.arena.index(ix, iy, iz));
        if (!blockProps(kind).solid) return;
        const colors = DEBRIS_COLORS[kind] || DEBRIS_COLORS[1];
        this.particles.burst(point, { count: 5, colors, speed: 2.5, up: 2.5, size: 0.06, spread: 0.05, life: 0.5, dir: normal, dirSpeed: 3 });
        this.particles.burst(point, { count: 2, colors: ['#d9d2c0', '#bdb5a3'], speed: 1, up: 1.2, gravity: 1, size: 0.12, spread: 0.05, life: 0.6, glow: true, dir: normal, dirSpeed: 1 });
        this.sound.play(IMPACT_SOUND[blockProps(kind).surface] || 'impactStone', { at: point, range: 40, volume: 0.8 });
    }

    // ---- network ----------------------------------------------------------------------------

    get self() {
        return this.players.get(this.selfId);
    }

    bindNetwork() {
        const on = (type, handler) => this.connection.on(type, data => handler.call(this, data));
        on(S2C.WELCOME, this.onWelcome);
        on(S2C.JOIN_ERROR, ({ error }) => {
            // e.g. the room closed while we were reconnecting
            this.hud.toast(`${roomErrorText(error)}: back to the menu`);
            setTimeout(() => this.onLeave(), 2500);
        });
        on(S2C.SNAPSHOT, this.onSnapshot);
        on(S2C.PLAYER_JOINED, p => {
            if (!this.players.has(p.id)) {
                this.addPlayer(p);
                if (this.selfId && p.id !== this.selfId && !p.isBot) this.hud.toast(`${p.name} joined`);
            }
        });
        on(S2C.PLAYER_LEFT, ({ id }) => {
            const info = this.players.get(id);
            if (!info) return;
            info.avatar.dispose();
            this.players.delete(id);
            this.updateModeBadge();
            if (!info.isBot) this.hud.toast(`${info.name} left`);
        });
        on(S2C.PLAYER_UPDATED, ({ id, name, characterId }) => {
            const info = this.players.get(id);
            if (!info) return;
            Object.assign(info, { name, characterId });
            info.avatar.setName(name);
            info.avatar.setCharacter(characterId);
        });
        on(S2C.INVENTORY, this.onInventory);
        on(S2C.ACTION, ({ id, action, item }) => {
            if (id === this.selfId) return; // already played locally
            const info = this.players.get(id);
            if (!info) return;
            info.avatar.playAction(action);
            const at = info.avatar.group.position;
            if (item === 'claws') this.sound.play('zombieAttack', { at, range: 25 });
            else if (action === 'swing') this.sound.play('knifeSlash', { at });
            if (action === 'stab') this.sound.play('knifeStab', { at });
            if (action === 'drink') this.sound.play('drink', { at });
            if (action === 'reload') this.sound.play(weaponSpec(item)?.reloadStyle === 'shell' ? 'pump' : 'clipout', { at, range: 25 });
        });
        on(S2C.SHOT, this.onShot);
        on(S2C.BLOCK_CRACKING, this.onBlockCracking);
        on(S2C.BLOCK_BROKEN, ({ ix, iy, iz }) => {
            this.arena.setState(ix, iy, iz, BLOCK_STATE.BROKEN);
            this.world.break(ix, iy, iz);
            this.effects.clearBlock(this.arena.index(ix, iy, iz));
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
            if (data.itemId === 'rpg' && data.ownerId !== this.selfId) {
                const at = { x: data.x, y: data.y, z: data.z };
                this.sound.playShot('rpg', at);
                this.effects.flash(at, 0.9);
            }
        });
        on(S2C.PROJECTILE_END, data => {
            const view = this.projectiles.get(data.id);
            if (view) view.end(data);
            if (data.explode) this.explosion({ x: data.x, y: data.y, z: data.z }, data.explode);
        });
        on(S2C.KNOCKBACK, ({ id, knockback }) => {
            if (id === this.selfId && this.local.alive) this.local.applyKnockback(knockback);
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
        on(S2C.MODE_STATE, state => {
            this.modeState = state;
            this.modePanel.render(state, this.players, this.selfId);
        });
        on(S2C.MATCH_END, data => {
            this.respawnOverlay.hide();
            this.buyMenu.hide();
            this.matchEnd.show(data, this.selfId, SCORE_LABEL[this.modeId]);
            this.sound.play(data.winnerId === this.selfId || (data.winnerTeam && data.winnerTeam === this.self?.team) ? 'win' : 'lose');
        });
        on(S2C.MATCH_START, () => {
            this.matchEnd.hide();
            for (const info of this.players.values()) Object.assign(info, { kills: 0, deaths: 0, score: 0 });
            this.hud.toast('New match!');
        });
        on(S2C.WAVE_START, ({ wave, count }) => {
            this.hud.showBanner(`Wave ${wave} · ${count} zombies`, 'wave', 3000);
            this.sound.play('roundStart');
            setTimeout(() => this.sound.play('zombieGroan', { volume: 0.8, pitch: 0.8 }), 400);
        });
        on(S2C.WAVE_END, ({ wave, breakTime }) => {
            this.hud.showBanner(`Wave ${wave} cleared! Next in ${breakTime}s`, 'team-ct', 3500);
            this.sound.play('win');
        });
        on(S2C.ROUND_START, ({ round }) => {
            this.hud.showBanner(`Round ${round} · Buy now (B)`, 'round', 2500);
            this.sound.play('roundStart');
        });
        on(S2C.ROUND_END, ({ winner }) => {
            const text = winner ? `${TEAM_BUY.teamNames[winner]} Win!` : 'Round Draw';
            this.hud.showBanner(text, winner ? `team-${winner}` : '', 4000);
            this.sound.play(winner && winner === this.self?.team ? 'win' : 'lose');
            this.buyMenu.hide();
        });
        on(S2C.BUY_RESULT, ({ ok, item, error }) => {
            // Deathmatch: picking a gun turns random guns off (the server did the same)
            if (ok && this.modeId === 'ffa' && isGun(item) && this.profile.randomGuns) this.setRandomGuns(false, true);
            if (ok) {
                this.sound.play(item === 'kevlar' || item === 'kevlar_helmet' ? 'armorUp' : item === 'ammo' ? 'ammoPickup' : item === 'health_potion' ? 'pickup' : 'deploy');
                return;
            }
            this.sound.play('empty');
            this.hud.toast(error === 'money' ? 'Not enough money' : error === 'owned' ? 'You already have that'
                : error === 'not-now' ? 'Buy in your base during buy time' : 'Can\'t buy that');
        });
        on(S2C.LEVEL_UP, ({ id, level, weapon }) => {
            if (id !== this.selfId) return;
            this.sound.play('levelUp');
            this.hud.toast(`Level ${level + 1}: ${weaponSpec(weapon)?.name || weapon}`);
        });
        on(S2C.PICKUP_SPAWNED, data => {
            this.pickups.set(data.id, new PickupView(this.scene, data));
            if (data.type === 'rpg') {
                this.sound.play('rpgSpawn');
                this.hud.toast(`An RPG appeared on the ${data.spot || ''} tower!`);
                return;
            }
            this.sound.play('spawnPickup', { at: { x: data.x, y: data.y, z: data.z } });
            if (data.type === 'health_potion') this.hud.toast('A health potion appeared!');
        });
        on(S2C.PICKUP_TAKEN, ({ id, by, type, amount, weapon }) => {
            const view = this.pickups.get(id);
            if (view) {
                const p = view.group.position;
                this.particles.burst({ x: p.x, y: p.y + 0.8, z: p.z }, { count: 12, colors: ['#ffd23f', '#ffffff'], up: 2, speed: 2, gravity: 2, glow: true, size: 0.07 });
                view.dispose();
                this.pickups.delete(id);
            }
            if (type === 'rpg') {
                if (by === this.selfId) this.sound.play('deploy');
                this.hud.toast(by === this.selfId ? 'You have the RPG! One shot, make it count'
                    : `${this.players.get(by)?.name || 'Someone'} has the RPG!`);
                return;
            }
            if (by && by === this.selfId) {
                this.sound.play(type === 'ammo' ? 'ammoPickup' : type === 'armor' ? 'armorUp' : type === 'weapon' ? 'deploy' : 'pickup');
                this.hud.toast(type === 'ammo' ? 'Ammo!' : type === 'weapon' ? `Picked up the ${weaponSpec(weapon)?.name || weapon}`
                    : `+${amount} ${PICKUP_NAMES[type] || type}`);
            }
        });
    }

    onWelcome(data) {
        this.resetWorld(); // a second welcome means we rejoined after a disconnect
        this.selfId = data.selfId;
        this.room = data.room || null;
        this.modeId = data.mode || 'ffa';
        this.modeState = data.modeState || null;
        this.matchEnd.hide();
        if (this.room) this.pauseMenu.setTitle(this.room.kind === 'quick' ? 'QUICK PLAY' : this.room.name);
        this.arena = Arena.fromJSON(data.arena);
        this.world.setArena(this.arena);
        this.serverOffset = data.time - performance.now() / 1000;
        for (const p of data.players) this.addPlayer(p);
        this.modePanel.render(this.modeState, this.players, this.selfId);
        const me = this.self;
        this.local.teleport(me.x, me.y, me.z, me.yaw);
        this.local.alive = me.alive;
        this.weapons.resetLife();
        this.protectedUntil = performance.now() + PLAYER.spawnProtection * 1000;
        for (const pickup of data.pickups) this.pickups.set(pickup.id, new PickupView(this.scene, pickup));
        for (const projectile of data.projectiles) this.projectiles.set(projectile.id, new ProjectileView(this.scene, projectile));
        if (this.modeId === 'ffa') this.connection.send(C2S.PREFS, { randomGuns: this.profile.randomGuns });
    }

    // "GUN GAME · FRIENDS · 2 players + 2 bots"
    updateModeBadge() {
        const mode = getModeInfo(this.modeId)?.name.toUpperCase() || '';
        if (!this.connection.isOnline) {
            this.hud.setMode(`${mode} · OFFLINE · BOTS`);
            return;
        }
        const all = [...this.players.values()].filter(p => !p.isZombie);
        const bots = all.filter(p => p.isBot).length;
        const people = all.length - bots;
        const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
        const label = !this.room || this.room.kind === 'quick' ? 'QUICK PLAY' : this.room.name.toUpperCase();
        this.hud.setMode(`${mode} · ${label} · ${plural(people, 'player')}${bots ? ` + ${plural(bots, 'bot')}` : ''}`);
    }

    resetWorld() {
        for (const info of this.players.values()) info.avatar.dispose();
        for (const view of this.pickups.values()) view.dispose();
        for (const view of this.projectiles.values()) view.dispose();
        this.players.clear();
        this.pickups.clear();
        this.projectiles.clear();
        this.deathCam = null;
        this.respawnOverlay.hide();
    }

    addPlayer(p) {
        const isSelf = p.id === this.selfId;
        const avatar = new PlayerAvatar(this.scene, p, { isSelf });
        const info = {
            id: p.id, name: p.name, characterId: p.characterId, isBot: p.isBot,
            alive: p.alive, health: p.health, kills: p.kills, deaths: p.deaths,
            x: p.x, y: p.y, z: p.z, yaw: p.yaw, avatar, stepTimer: Math.random()
        };
        for (const field of MODE_FIELDS) if (p[field] !== undefined) info[field] = p[field];
        this.players.set(p.id, info);
        if (!p.alive) avatar.die();
        this.updateModeBadge();
    }

    onSnapshot({ time, players }) {
        // Track the server clock (smoothed) for lag compensation
        const offset = time - performance.now() / 1000;
        this.serverOffset = this.serverOffset === null ? offset : this.serverOffset + (offset - this.serverOffset) * 0.1;
        for (const p of players) {
            const info = this.players.get(p.id);
            if (!info) continue;
            info.kills = p.kills;
            info.deaths = p.deaths;
            info.health = p.health;
            for (const field of MODE_FIELDS) if (p[field] !== undefined) info[field] = p[field];
            if (p.id === this.selfId) {
                this.hud.setHealth(p.health);
                if (p.money !== undefined) {
                    this.hud.setMoney(p.money);
                    this.buyMenu.setMoney(p.money);
                }
                this.armor = p.armor;
                this.hud.setArmor(p.armor, this.helmet);
            } else {
                info.avatar.pushSnapshot(p);
                if (p.team !== undefined) {
                    info.avatar.setTeam(p.team);
                    info.avatar.setNameVisible(!p.team || p.team === this.self?.team);
                }
            }
        }
        if (this.buyMenu.visible && !this.canBuy) this.buyMenu.hide();
        this.modePanel.render(this.modeState, this.players, this.selfId);
    }

    onInventory(data) {
        if (data.money !== undefined) {
            this.hud.setMoney(data.money);
            this.buyMenu.setMoney(data.money);
            if (this.self) this.self.money = data.money;
        }
        this.helmet = !!data.helmet;
        this.armor = data.armor ?? this.armor;
        this.hud.setArmor(this.armor, this.helmet);
        this.weapons.setInventory(data);
    }

    // Someone else fired: flash, sound, tracers, impacts, and a whizz if it flew past our head
    onShot({ id, w, o, p }) {
        if (id === this.selfId || !this.arena) return;
        const info = this.players.get(id);
        const spec = weaponSpec(w);
        const muzzle = info ? info.avatar.muzzlePosition(this.tmpVec) : new THREE.Vector3(o[0], o[1], o[2]);
        const at = { x: muzzle.x, y: muzzle.y, z: muzzle.z };
        this.effects.flash(at, spec?.kind === WEAPON_KIND.SHOTGUN || w === 'awp' ? 0.9 : 0.6);
        this.sound.playShot(w, at);
        info?.avatar.playAction('shoot');

        const origin = { x: o[0], y: o[1], z: o[2] };
        const head = this.local.alive ? this.local.eye : null;
        let whizzed = false;
        for (let i = 0; i < p.length; i += 5) {
            const dir = { x: p[i], y: p[i + 1], z: p[i + 2] };
            const dist = p[i + 3];
            const end = { x: origin.x + dir.x * dist, y: origin.y + dir.y * dist, z: origin.z + dir.z * dist };
            if (i % 15 === 0) this.effects.tracer(at, end);
            if (p[i + 4] === 1) this.impactsAlong(origin, dir, dist + 0.05);
            if (head && !whizzed) whizzed = this.whiz(origin, dir, dist, head);
        }
    }

    // Marks for a remote bullet, including any blocks it punched through
    impactsAlong(origin, dir, maxDist) {
        const o = { x: origin.x, y: origin.y, z: origin.z };
        let remaining = maxDist;
        for (let n = 0; n < 4 && remaining > 0; n++) {
            const block = this.arena.raycast(o, dir, remaining);
            if (!block) return;
            this.impact(block, dir);
            const exit = this.arena.cellExit(block.ix, block.iy, block.iz, o, dir) + 0.01;
            o.x += dir.x * exit;
            o.y += dir.y * exit;
            o.z += dir.z * exit;
            remaining -= exit;
        }
    }

    whiz(origin, dir, dist, head) {
        const t = (head.x - origin.x) * dir.x + (head.y - origin.y) * dir.y + (head.z - origin.z) * dir.z;
        if (t < 2 || t > dist) return false;
        const px = origin.x + dir.x * t;
        const py = origin.y + dir.y * t;
        const pz = origin.z + dir.z * t;
        if (Math.hypot(px - head.x, py - head.y, pz - head.z) > WHIZ_DISTANCE) return false;
        this.sound.play('whiz', { at: { x: px, y: py, z: pz }, range: 12, volume: 1.2 });
        return true;
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

    onDamage({ victimId, attackerId, amount, health, armor, knockback, weapon, zone, headshot, armorHit, from }) {
        const victim = this.players.get(victimId);
        if (!victim) return;
        victim.health = health;
        victim.avatar.setHealth(health);
        victim.avatar.hurt();
        const self = victimId === this.selfId;
        const pos = self ? this.local.body : victim.avatar.group.position;
        const hitPoint = { x: pos.x, y: pos.y + (ZONE_HEIGHT[zone] ?? 1.1) * (victim.avatar.crouching ? 0.72 : 1), z: pos.z };

        // Blood sprays away from the shooter (our own would spawn inside the camera)
        if (!self) {
            const away = from ? normalize({ x: pos.x - from.x, y: 0.15, z: pos.z - from.z }) : null;
            this.particles.burst(hitPoint, { count: 6 + Math.min(14, Math.round(amount / 6)), colors: BLOOD, speed: 1.5, up: 1.5, size: 0.06, spread: 0.15, life: 0.6, dir: away, dirSpeed: 4 });
        }

        // The hit sound everyone nearby hears: dink for helmets, thud for kevlar, flesh otherwise
        const knife = weapon === 'knife';
        const hitSound = knife ? 'knifeHit' : headshot ? (armorHit ? 'headshotHelmet' : 'headshotFlesh') : armorHit ? 'hitKevlar' : 'hitFlesh';
        this.sound.play(hitSound, { at: self ? null : hitPoint, range: 30, volume: self ? 0.8 : 1 });

        if (self) {
            this.hud.setHealth(health);
            this.armor = armor ?? this.armor;
            this.hud.setArmor(this.armor, this.helmet);
            this.hud.flash('damage');
            this.sound.play('hurt', { volume: 0.7 });
            if (knockback) this.local.applyKnockback(knockback);
            this.local.tag();
            this.weapons.flinch(amount);
            if (from) {
                // 0 = straight ahead, clockwise positive
                const angle = Math.atan2(from.x - pos.x, from.z - pos.z) - (this.local.yaw + Math.PI);
                this.hud.damageFrom(-angle);
            }
            if (headshot && health > 0) {
                this.hud.toast('◎ Headshot!');
                this.sound.play('tinnitus');
            }
        }
        if (attackerId === this.selfId && !self) {
            this.hud.hit(zone === 'head', health <= 0);
            this.sound.play('hitmarker');
        }
    }

    onDeath({ victimId, killerId, cause, headshot }) {
        const victim = this.players.get(victimId);
        const killer = this.players.get(killerId);
        if (!victim) return;
        victim.alive = false;
        victim.avatar.die();
        if (victim.isZombie) {
            // Zombie deaths stay out of the kill feed unless they're yours
            const pos = victim.avatar.group.position;
            this.sound.play('zombieDeath', { at: { x: pos.x, y: pos.y + 1, z: pos.z }, range: 30 });
            if (killerId === this.selfId) {
                this.hud.hit(!!headshot, true);
                this.sound.play('kill');
            }
            return;
        }
        this.hud.kill({
            killer: killer?.name,
            victim: victim.name,
            weapon: cause,
            headshot,
            mine: victimId === this.selfId || killerId === this.selfId
        });
        const pos = victimId === this.selfId ? this.local.body : victim.avatar.group.position;
        this.sound.play('death', { at: { x: pos.x, y: pos.y + 1, z: pos.z } });

        if (victimId === this.selfId) {
            this.local.alive = false;
            this.weapons.setTrigger(false);
            this.weapons.setScope(0);
            this.deathCam = { x: this.local.body.x, y: Math.max(this.local.body.y, -2), z: this.local.body.z, yaw: this.local.yaw, t: 0 };
            this.buyMenu.hide();
            const gun = weaponSpec(cause)?.name;
            const reason = killer
                ? (cause === 'fall' ? `${killer.name} made you fall`
                    : `${killer.name} killed you${gun ? ` with the ${gun}` : ''}${headshot ? ' (headshot)' : ''}`)
                : (cause === 'fall' ? 'You fell into the void' : 'You died');
            this.respawnOverlay.waitText = this.modeId === 'zombies' ? 'Back when this wave is cleared...' : null;
            this.respawnOverlay.show(reason, this.modeId === 'teambuy' || this.modeId === 'zombies' ? null : PLAYER.respawnDelay);
        }
        if (killerId === this.selfId && victimId !== this.selfId) {
            this.sound.play('kill');
            this.hud.hit(!!headshot, true);
            this.hud.toast(`You killed ${victim.name}${headshot ? ' ◎' : ''}${this.modeId === 'ffa' ? ' · +1 Health Potion' : ''}`);
        }
    }

    onRespawn({ id, x, y, z, yaw, health, armor }) {
        const info = this.players.get(id);
        if (!info) return;
        info.alive = true;
        info.health = health;
        info.avatar.respawn(x, y, z, yaw);
        if (id === this.selfId) {
            this.local.teleport(x, y, z, yaw);
            this.local.alive = true;
            this.weapons.resetLife();
            this.deathCam = null;
            this.respawnOverlay.hide();
            this.hud.setHealth(health);
            this.armor = armor ?? 0;
            this.hud.setArmor(this.armor, this.helmet);
            this.protectedUntil = performance.now() + PLAYER.spawnProtection * 1000;
            this.sound.play('respawn');
        }
    }

    // ---- frame ------------------------------------------------------------------------------

    update(dt, now) {
        if (this.selfId && this.arena) {
            this.updateLocalPlayer(dt, now);
            this.updateRemoteFootsteps(dt);
        }

        for (const info of this.players.values()) info.avatar.update(dt, now);
        for (const [id, view] of this.projectiles) {
            if (!view.update(dt)) this.projectiles.delete(id);
            else if (view.itemId === 'rpg' && (view.trail += dt) >= 0.02) {
                view.trail = 0;
                this.particles.burst(view.position, { count: 2, colors: SMOKE, speed: 0.4, up: 0.5, gravity: -0.8, life: 1.1, size: 0.22, spread: 0.1 });
                this.particles.burst(view.position, { count: 1, colors: FIRE, speed: 0.3, up: 0.2, gravity: 0, life: 0.12, size: 0.14, spread: 0.05, glow: true });
            }
        }
        for (const view of this.pickups.values()) view.update(dt);
        this.particles.update(dt);
        this.effects.update(dt);
        this.world.update(dt, this.camera);

        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        if (this.cameraController.view.showsViewModel && this.local.alive && this.zoom === 1) this.viewModel.render(this.renderer);
    }

    updateLocalPlayer(dt, now) {
        const active = this.input.locked && !this.pauseMenu.visible;
        const { dx, dy } = this.input.consumeMouse();
        // Scoped: slower mouse so aiming stays precise
        if (active) this.local.look(dx, dy, this.profile.sensitivity / this.zoom);
        // Freeze time: look around, buy, but don't move
        const canMove = active && !this.frozen;
        const move = canMove ? this.input.movement : { forward: 0, strafe: 0 };
        this.local.update(dt, {
            ...move,
            jump: this.input.consumeJump() && canMove,
            crouch: active && this.input.crouch,
            walk: active && this.input.walk
        }, this.arena, this.weapons.speedMul);
        this.weapons.update(dt);

        const body = this.local.body;
        const speed = this.local.horizontalSpeed;
        this.sound.setListener(body.x, body.y + this.local.eyeHeight, body.z, this.local.yaw);

        // Footsteps (silent when walking or crouching, like CS), jump and landing sounds
        if (this.local.alive && body.onGround && speed > STEP_SPEED) {
            this.stepTimer -= dt * speed;
            if (this.stepTimer <= 0) {
                this.stepTimer = 2.1;
                this.sound.play(this.stepSound(body), { pitch: 0.85 + Math.random() * 0.3, volume: 0.7 });
            }
        }
        if (this.local.events.jumped) this.sound.play('jump');
        if (this.local.events.landed) this.sound.play('land', { volume: Math.min(1, 0.3 + this.local.events.fallSpeed / 14) });
        // Into the water: splash; head under: everything goes blue
        if (body.inWater !== this.wasInWater) {
            if (body.inWater && this.local.alive) this.sound.play('splash');
            this.wasInWater = body.inWater;
        }
        const eye = this.local.eye;
        this.hud.setUnderwater(this.arena.isWaterAt(eye.x, eye.y, eye.z));

        // Send our state ~20 times a second
        this.sendTimer -= dt;
        if (this.local.alive && this.sendTimer <= 0) {
            this.sendTimer = 1 / NET.clientSendRate;
            this.connection.send(C2S.STATE, this.local.networkState);
        }

        // Low health: heartbeat
        if (this.local.alive && this.self && this.self.health <= 25) {
            this.heartbeatTimer -= dt;
            if (this.heartbeatTimer <= 0) {
                this.heartbeatTimer = 0.55 + this.self.health / 40;
                this.sound.play('heartbeat', { volume: 0.8 });
            }
        }

        const self = this.self;
        if (self) {
            self.avatar.setPose(body.x, body.y, body.z, this.local.yaw, this.local.pitch, body.onGround, body.crouching);
            const view = this.cameraController.view;
            self.avatar.setVisible((view.showsOwnBody && !view.closeToEye) || !this.local.alive);
        }
        this.look.dx = active ? dx : 0;
        this.look.dy = active ? dy : 0;
        this.viewModel.setReload(this.weapons.reloadProgress());
        this.viewModel.setBolt(this.weapons.boltProgress());
        this.viewModel.update(dt, { speed, onGround: body.onGround, crouching: body.crouching, lookX: this.look.dx, lookY: this.look.dy });
        this.hud.setProtected(this.local.alive && now < this.protectedUntil);
        if (this.weapons.inventory) {
            const w = this.weapons;
            this.hud.setAmmo(isGun(w.id) ? w.ammo : null, weaponSpec(w.id)?.name || (w.id === 'health_potion' ? 'Health Potion' : ''), w.reloading);
        }

        // Crosshair opens up with the current inaccuracy
        const halfFov = (this.camera.fov * Math.PI) / 360;
        const gap = 4 + (Math.tan(this.weapons.currentCone()) / Math.tan(halfFov)) * (window.innerHeight / 2);
        this.hud.setCrosshair(gap, this.local.alive && this.zoom === 1, this.weapons.canFireNow);
        this.hud.update();

        // Outline the block the knife would chop
        const aimBlock = this.local.alive && this.weapons.id === KNIFE.id
            ? this.arena.raycast(this.local.eye, this.aimDirection(), KNIFE.blockReach)
            : null;
        this.world.setHighlight(aimBlock);

        this.updateCamera(dt);
    }

    stepSound(body) {
        if (this.arena.isWaterAt(body.x, body.y + 0.4, body.z)) return 'swim';
        const under = this.arena.supportBlock(body.x, body.y, body.z, 0);
        return STEP_SOUND[under ? blockProps(this.arena.kindAt(under.ix, under.iy, under.iz)).surface : 'grass'] || 'step';
    }

    // Hearing enemies run is half of CS: other players' footsteps, unless they walk or crouch.
    // Zombies moan now and then instead.
    updateRemoteFootsteps(dt) {
        for (const info of this.players.values()) {
            if (info.id === this.selfId || !info.alive) continue;
            const avatar = info.avatar;
            if (info.isZombie) {
                info.groanTimer = (info.groanTimer ?? 2 + Math.random() * 6) - dt;
                if (info.groanTimer <= 0) {
                    info.groanTimer = 4 + Math.random() * 7;
                    const p = avatar.group.position;
                    this.sound.play('zombieGroan', { at: { x: p.x, y: p.y + 1.5, z: p.z }, range: 26, pitch: 0.8 + Math.random() * 0.4 });
                }
                continue;
            }
            if (!avatar.onGround || avatar.speed < STEP_SPEED || avatar.crouching) continue;
            info.stepTimer -= dt * avatar.speed;
            if (info.stepTimer > 0) continue;
            info.stepTimer = 2.1;
            const p = avatar.group.position;
            this.sound.play(this.stepSound(p), { at: { x: p.x, y: p.y, z: p.z }, range: 28, pitch: 0.85 + Math.random() * 0.3 });
        }
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
        const punch = this.weapons.punch;
        this.cameraController.update({
            eye: this.local.eye,
            yaw: this.local.yaw + punch.yaw,
            pitch: this.local.pitch + punch.pitch,
            arena: this.arena
        });
    }
}
