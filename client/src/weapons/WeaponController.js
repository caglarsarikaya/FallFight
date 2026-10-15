import { KNIFE, WEAPON_KIND, isGun, weaponSpec } from '../../shared/config/weapons.js';
import { C2S } from '../../shared/protocol.js';
import { directionFromAngles } from '../../shared/math.js';
import { heatAfter, inaccuracy, pelletDirections, recoilKick, shotSeed } from '../../shared/spread.js';

const DEG = Math.PI / 180;
const BOLT_TIME = 0.55;      // bolt / pump animation after a sniper or shotgun shot
const HIT_PUNCH = 2.6;       // degrees the view flinches when we get shot
const GRENADES = { hegrenade: 'HE grenades', smokegrenade: 'smoke grenades' };

// The local player's weapon handling, predicted on the client so shooting feels instant:
// rate of fire, magazine and reload, deploy time, recoil (view punch), spread and scopes.
// The server runs the same rules (shared/items/Gun.js) and stays the judge of hits.
export class WeaponController {
    constructor(game) {
        this.game = game;
        this.inventory = null;     // { hotbar, ammo, counts, selected } as last known
        this.trigger = false;
        this.triggerUsed = false;  // semi-auto: one shot per click
        this.seq = 0;
        this.nextFireAt = 0;
        this.readyAt = 0;
        this.heat = 0;
        this.lastShotAt = -Infinity;
        this.reload = null;        // { id, start, end, shell }
        this.boltUntil = 0;
        this.scope = 0;
        this.resumeScope = null;   // { level, at } snipers re-zoom after the bolt cycles
        this.punch = { pitch: 0, yaw: 0 }; // radians, added to the view
        this.lastSlot = 2;
        this.dirs = [];
    }

    get now() {
        return performance.now() / 1000;
    }

    get id() {
        return this.inventory ? this.inventory.hotbar[this.inventory.selected] : null;
    }

    get spec() {
        return weaponSpec(this.id);
    }

    get ammo() {
        return this.inventory?.ammo[this.id] || null;
    }

    get reloading() {
        return !!this.reload;
    }

    // Would a shot go off right now? (for the crosshair: grey while reloading, switching, cycling
    // the bolt or empty). Fast automatic gaps between shots don't count, or it would flicker.
    get canFireNow() {
        const spec = this.spec;
        if (!isGun(this.id)) return true;
        const now = this.now;
        const ammo = this.ammo;
        if (now < this.readyAt || !ammo || ammo.mag <= 0) return false;
        if (this.reload && !(this.reload.shell && ammo.mag > 0)) return false;
        return spec.interval < 0.3 || now >= this.nextFireAt;
    }

    // ---- server state -------------------------------------------------------------------

    setInventory(data) {
        const previous = this.inventory;
        // A gun just given to us (bought, picked up, levelled up) and selected by the server: take it
        const gained = previous && previous.hotbar[data.selected] !== data.hotbar[data.selected];
        // ...and an empty grenade slot isn't kept either: the server already switched back to a gun
        const kept = previous && data.hotbar[previous.selected];
        const keepSelection = !gained && kept && !(GRENADES[kept] && !(data.counts[kept] > 0));
        const selected = keepSelection ? this.inventory.selected : data.selected;
        // Shots still in flight: keep our own (lower) magazine count for the gun we're firing
        if (previous && this.now - this.lastShotAt < 0.35 && data.ammo[this.id] && previous.ammo[this.id]) {
            data.ammo[this.id].mag = Math.min(data.ammo[this.id].mag, previous.ammo[this.id].mag);
        }
        this.inventory = { ...data, selected };
        // Our selection wins (it may have changed while this message was on its way)
        if (selected !== data.selected) this.game.connection.send(C2S.SELECT, { slot: selected });
        if (!previous || previous.hotbar[selected] !== data.hotbar[selected]) this.onDeployed(false);
        this.game.onWeaponChanged();
    }

    // Respawn / new life: forget timers, spray and scope; the server sends the new loadout next
    resetLife() {
        this.inventory = null;
        this.reload = null;
        this.heat = 0;
        this.nextFireAt = 0;
        this.readyAt = 0;
        this.boltUntil = 0;
        this.setScope(0);
        this.punch.pitch = this.punch.yaw = 0;
        this.trigger = false;
    }

    // ---- input ---------------------------------------------------------------------------

    select(slot) {
        const inv = this.inventory;
        if (!inv || slot === inv.selected || !inv.hotbar[slot]) return false;
        const id = inv.hotbar[slot];
        if (id === 'health_potion' && !(inv.counts.health_potion > 0)) {
            this.game.hud.toast('No health potions');
            return false;
        }
        if (GRENADES[id] && !(inv.counts[id] > 0)) {
            this.game.hud.toast(`No ${GRENADES[id]}: buy one (B 8)`);
            return false;
        }
        this.lastSlot = inv.selected;
        inv.selected = slot;
        this.game.connection.send(C2S.SELECT, { slot });
        this.onDeployed(true);
        this.game.onWeaponChanged();
        return true;
    }

    selectLast() {
        if (!this.select(this.lastSlot)) this.select(this.inventory?.selected === 2 ? 0 : 2);
    }

    onDeployed(sound) {
        const spec = this.spec;
        this.reload = null;
        this.setScope(0);
        this.resumeScope = null;
        this.readyAt = this.now + (spec?.deploy ?? 0.3);
        this.triggerUsed = this.trigger;
        if (sound) this.game.sound.play(isGun(this.id) ? 'deploy' : 'select');
    }

    setTrigger(down) {
        this.trigger = down;
        if (!down) this.triggerUsed = false;
        if (down) this.tryFire();
    }

    // Right mouse: scope (snipers), stab (knife)
    secondary() {
        const spec = this.spec;
        if (!spec) return;
        if (spec.kind === WEAPON_KIND.KNIFE) {
            this.knife(true);
        } else if (spec.scope && !this.reload && this.now >= this.readyAt) {
            this.resumeScope = null;
            this.setScope((this.scope + 1) % (spec.scope.zooms.length + 1));
            this.game.sound.play('zoom');
        }
    }

    setScope(level) {
        if (level === this.scope) return;
        this.scope = level;
        this.game.connection.send(C2S.SCOPE, { level });
        this.game.onScopeChanged(level ? this.spec.scope.zooms[level - 1] : 1);
    }

    startReload() {
        const spec = this.spec;
        const ammo = this.ammo;
        if (!isGun(this.id) || this.reload || !ammo || ammo.mag >= spec.mag || ammo.reserve <= 0) return false;
        if (this.now < this.readyAt) return false;
        const now = this.now;
        const shell = spec.reloadStyle === 'shell';
        const first = shell ? spec.reloadTime + 0.35 : spec.reloadTime;
        this.reload = { id: this.id, start: now, end: now + first, shell };
        this.setScope(0);
        this.resumeScope = null;
        this.game.connection.send(C2S.RELOAD, {});
        this.game.sound.play(shell ? 'pump' : 'clipout');
        if (!shell) {
            // On the beats of the reload animation (GunView.animateReload): mag in, then the bolt
            const still = () => this.reload?.id === this.id;
            setTimeout(() => still() && this.game.sound.play('clipin'), first * 680);
            if (spec.kind !== WEAPON_KIND.PISTOL) setTimeout(() => still() && this.game.sound.play('boltpull'), first * 800);
        }
        this.game.onReload(this.id);
        return true;
    }

    // ---- firing -------------------------------------------------------------------------

    tryFire() {
        const id = this.id;
        if (!id || !this.game.canShoot) return;
        if (id === KNIFE.id) return this.knife(false);
        if (id === 'health_potion' || GRENADES[id]) {
            if (!this.triggerUsed) {
                this.triggerUsed = true;
                if (GRENADES[id]) this.game.throwGrenade(id);
                else this.game.useConsumable();
            }
            return;
        }
        const spec = this.spec;
        const now = this.now;
        if (now < this.readyAt || now < this.nextFireAt) return;
        if (!spec.auto && this.triggerUsed) return;
        const ammo = this.ammo;
        if (this.reload && !(this.reload.shell && ammo.mag > 0)) return;
        if (ammo.mag <= 0) {
            this.triggerUsed = true;
            this.game.sound.play('dryfire');
            this.nextFireAt = now + 0.25;
            if (ammo.reserve > 0) this.startReload();
            else this.game.hud.toast('Out of ammo');
            return;
        }
        this.shoot(spec, now);
        // Automatic fire keeps its rate even when frames are slower than the gun: catch up on
        // the shots due since the last frame (a few at most)
        for (let n = 0; n < 3 && spec.auto && this.trigger && now >= this.nextFireAt && ammo.mag > 0; n++) {
            this.shoot(spec, now);
        }
    }

    shoot(spec, now) {
        const game = this.game;
        const local = game.local;
        this.triggerUsed = true;
        this.reload = null;
        this.ammo.mag--;
        // Holding the trigger: shots follow each other exactly one interval apart
        const base = now - this.nextFireAt < spec.interval ? this.nextFireAt : now;
        this.nextFireAt = base + spec.interval;

        // Same spread maths as the server
        const heatBefore = Math.max(0, heatAfter(spec, this.heat, now - this.lastShotAt) - 1);
        const cone = inaccuracy(spec, {
            speed: local.horizontalSpeed,
            onGround: local.body.onGround,
            crouching: local.body.crouching,
            scoped: this.scope > 0,
            heat: heatBefore
        });
        this.heat = heatBefore + 1;
        this.lastShotAt = now;
        const seq = ++this.seq;
        const aim = this.aimDirection();
        const dirs = pelletDirections(aim, cone, spec.pellets, shotSeed(game.selfId, seq), this.dirs);
        game.connection.send(C2S.FIRE, {
            slot: this.inventory.selected, seq,
            dir: { x: aim.x, y: aim.y, z: aim.z },
            t: game.serverRenderTime()
        });

        // Recoil: the view kicks; the next bullet goes where the kicked crosshair points
        const kick = recoilKick(spec, Math.floor(heatBefore) + 1);
        const scale = local.body.crouching ? 0.8 : 1;
        this.punch.pitch = Math.min(spec.recoil.upMax * DEG, this.punch.pitch + kick.pitch * DEG * scale);
        this.punch.yaw += kick.yaw * DEG * scale;

        if (spec.scope) {
            // Bolt action: drop the scope, cycle the bolt, then zoom back in
            if (this.scope) this.resumeScope = { level: this.scope, at: now + spec.interval * 0.85 };
            this.setScope(0);
            this.boltUntil = now + Math.min(BOLT_TIME, spec.interval * 0.8);
            setTimeout(() => game.sound.play('boltpull'), 260);
        } else if (spec.kind === WEAPON_KIND.SHOTGUN) {
            this.boltUntil = now + Math.min(BOLT_TIME, spec.interval * 0.8);
            setTimeout(() => game.sound.play('pump'), 300);
        }
        game.onLocalShot(spec, dirs);
        if (this.ammo.mag === 0 && this.ammo.reserve > 0 && !spec.auto) {
            // Pistols and snipers: reload as soon as the last round is gone
            setTimeout(() => this.id === spec.id && this.ammo?.mag === 0 && this.startReload(), spec.interval * 1000);
        }
    }

    knife(stab) {
        const now = this.now;
        if (!this.game.canShoot || now < this.readyAt || now < this.nextFireAt) return;
        if (!stab && this.triggerUsed && !this.trigger) return;
        const mode = stab ? KNIFE.stab : KNIFE.slash;
        this.nextFireAt = now + mode.interval;
        const dir = this.aimDirection();
        this.game.connection.send(C2S.FIRE, { slot: this.inventory.selected, seq: ++this.seq, dir, t: this.game.serverRenderTime(), alt: stab });
        this.game.onKnife(stab, dir);
    }

    // Where the (kicked) crosshair points
    aimDirection() {
        const local = this.game.local;
        if (this.game.cameraController.view.id !== 'first') return this.game.aimDirection();
        return directionFromAngles(local.yaw + this.punch.yaw, local.pitch + this.punch.pitch);
    }

    // A bullet hit us: the view flinches (CS aim punch)
    flinch(amount) {
        const k = Math.min(1.5, amount / 30);
        this.punch.pitch += HIT_PUNCH * DEG * k;
        this.punch.yaw += (Math.random() - 0.5) * HIT_PUNCH * DEG * k;
    }

    // ---- per frame ------------------------------------------------------------------------

    update(dt) {
        const now = this.now;
        const spec = this.spec;
        if (this.trigger && this.game.canShoot) this.tryFire();

        // Reload progress (predicted; the server's inventory confirms it)
        const r = this.reload;
        if (r && (this.id !== r.id || !this.game.local.alive)) this.reload = null;
        else if (r && now >= r.end) {
            const ammo = this.ammo;
            const s = weaponSpec(r.id);
            if (r.shell) {
                if (ammo.reserve > 0 && ammo.mag < s.mag) {
                    ammo.mag++;
                    ammo.reserve--;
                    this.game.sound.play('shellIn');
                }
                if (ammo.mag < s.mag && ammo.reserve > 0) {
                    r.start = now;
                    r.end = now + s.reloadTime;
                } else {
                    this.reload = null;
                    this.game.sound.play('pump');
                }
            } else {
                const take = Math.min(s.mag - ammo.mag, ammo.reserve);
                ammo.mag += take;
                ammo.reserve -= take;
                this.reload = null;
            }
            this.game.onWeaponChanged();
        }

        if (this.resumeScope && now >= this.resumeScope.at) {
            if (this.trigger === false && this.id && this.spec?.scope && !this.reload) this.setScope(this.resumeScope.level);
            this.resumeScope = null;
        }

        // The view punch recovers, slowly while still spraying
        const recover = (spec?.recoil?.recover ?? 10) * DEG;
        const spraying = spec?.interval && now - this.lastShotAt < spec.interval * 1.6;
        const rate = spraying ? recover * 0.2 : recover;
        this.punch.pitch = approach(this.punch.pitch, 0, rate * dt * (1 + Math.abs(this.punch.pitch) / (4 * DEG)));
        this.punch.yaw = approach(this.punch.yaw, 0, rate * dt * (1 + Math.abs(this.punch.yaw) / (4 * DEG)));
    }

    // Current inaccuracy cone (for the crosshair)
    currentCone() {
        const spec = this.spec;
        if (!isGun(this.id)) return 0.012;
        const local = this.game.local;
        const heat = Math.max(0, this.heat - (this.now - this.lastShotAt) * spec.spread.recover);
        return inaccuracy(spec, {
            speed: local.horizontalSpeed,
            onGround: local.body.onGround,
            crouching: local.body.crouching,
            scoped: this.scope > 0,
            heat
        });
    }

    reloadProgress() {
        const r = this.reload;
        if (!r) return null;
        if (r.shell) return null;
        return Math.min(1, (this.now - r.start) / (r.end - r.start));
    }

    // For the crosshair: { progress 0..1, left seconds } of the whole reload, or null.
    // Shotguns load shell by shell, so the end is estimated from the shells still to go.
    reloadStatus() {
        const r = this.reload;
        if (!r) return null;
        const now = this.now;
        if (!r.shell) return { progress: Math.min(1, (now - r.start) / (r.end - r.start)), left: Math.max(0, r.end - now) };
        const spec = this.spec;
        const ammo = this.ammo;
        if (!spec || !ammo) return null;
        const needed = Math.max(1, Math.min(spec.mag - ammo.mag, ammo.reserve));
        const total = r.total ??= needed;
        const shellLeft = Math.max(0, r.end - now);
        const shellDone = 1 - shellLeft / (r.end - r.start);
        return { progress: Math.min(1, (total - needed + shellDone) / total), left: shellLeft + (needed - 1) * spec.reloadTime };
    }

    boltProgress() {
        const spec = this.spec;
        if (this.reload?.shell) return ((this.now - this.reload.start) / (this.reload.end - this.reload.start)) % 1;
        if (!spec || this.now >= this.boltUntil) return null;
        const length = Math.min(BOLT_TIME, spec.interval * 0.8);
        return 1 - (this.boltUntil - this.now) / length;
    }

    // Movement speed multiplier for the gun in hand
    get speedMul() {
        return this.spec?.moveSpeed ?? 1;
    }
}

function approach(value, target, step) {
    if (value > target) return Math.max(target, value - step);
    return Math.min(target, value + step);
}
