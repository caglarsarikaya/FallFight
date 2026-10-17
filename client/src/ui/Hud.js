import { PLAYER } from '../../shared/constants.js';
import { weaponSpec } from '../../shared/config/weapons.js';
import { getItem } from '../../shared/items/ItemRegistry.js';
import { getItemView } from '../items/registry.js';
import { el, flash } from './dom.js';

const MAX_DAMAGE_ARCS = 4;
const STACKED = ['health_potion', 'hegrenade', 'smokegrenade'];   // counted items: shown even when out

// Heads-up display, laid out like CS 1.6: health and armor bottom left, ammo bottom right,
// a crosshair that opens up with inaccuracy, kill feed top right, and a weapon bar bottom centre
// with everything carried (key, icon, name, rounds or how many).
export class Hud {
    constructor(root) {
        this.reloadText = el('span');
        this.reloadRing = el('div.reload-ring', {}, [this.reloadText]);
        this.crosshair = el('div.crosshair', {}, [...['t', 'b', 'l', 'r'].map(side => el(`div.ch.ch-${side}`)), this.reloadRing]);
        this.hitmarker = el('div.hitmarker');
        this.scope = el('div.scope.hidden', {}, [el('div.scope-h'), el('div.scope-v')]);
        // Aiming down an optic: its reticle on the screen centre (iron sights need none)
        this.reticle = el('div.reticle.hidden', {}, [el('i'), el('i'), el('i')]);
        this.reticleShown = null;
        this.damageArcs = [];
        this.damageLayer = el('div.damage-layer');
        for (let i = 0; i < MAX_DAMAGE_ARCS; i++) {
            const arc = el('div.damage-arc');
            this.damageLayer.append(arc);
            this.damageArcs.push(arc);
        }
        this.nextArc = 0;

        this.healthValue = el('span.value');
        this.health = el('div.cs-stat.health', {}, [el('span.icon', { text: '✚' }), this.healthValue]);
        this.armorValue = el('span.value');
        this.armorIcon = el('span.icon', { text: '⛉' });
        this.armor = el('div.cs-stat.armor', {}, [this.armorIcon, this.armorValue]);
        this.ammoMag = el('span.value');
        this.ammoReserve = el('span.reserve');
        this.weaponName = el('div.weapon-name');
        this.ammo = el('div.cs-stat.ammo', {}, [this.ammoMag, el('span.sep', { text: '|' }), this.ammoReserve]);
        this.money = el('div.money.hidden');
        this.moneyDelta = el('div.money-delta');
        this.ammoBox = el('div.ammo-box', {}, [this.moneyDelta, this.money, this.weaponName, this.ammo]);
        this.banner = el('div.round-banner.hidden');

        this.slotList = el('div.slots');
        this.killfeed = el('div.killfeed');
        this.toasts = el('div.toasts');
        this.modeBadge = el('div.mode-badge');
        this.fpsText = el('span');
        this.pingText = el('span');
        this.latencyText = el('span');
        this.netStats = el('div.net-stats', {}, [this.fpsText, this.pingText, this.latencyText]);
        this.protection = el('div.protection.hidden', { text: 'SPAWN PROTECTION' });
        this.badge = el('div.status-badge.hidden');
        this.glow = el('div.vignette.glow');
        this.useHint = el('div.use-hint.hidden');
        this.progressFill = el('div.progress-fill');
        this.progressLabel = el('span');
        this.progressBar = el('div.progress-bar.hidden', {}, [this.progressFill, this.progressLabel]);
        this.vignettes = {
            damage: el('div.vignette.damage'),
            danger: el('div.vignette.danger'),
            heal: el('div.vignette.heal')
        };
        this.underwater = el('div.underwater.hidden');
        this.smoke = el('div.smoke-screen');
        this.smokeShown = 0;
        this.helpHint = el('div.help-hint');
        this.setHelp([]);
        setTimeout(() => {
            this.helpHint.style.opacity = '0';
        }, 14000);

        this.root = el('div.hud', {}, [
            this.underwater, this.smoke, this.scope, this.reticle, this.crosshair, this.hitmarker, this.damageLayer, this.protection,
            this.useHint, this.progressBar,
            ...Object.values(this.vignettes), this.glow,
            el('div.hud-left', {}, [this.badge, this.health, this.armor]),
            this.ammoBox, this.slotList, this.banner,
            this.netStats, this.killfeed, this.toasts, this.modeBadge, this.helpHint
        ]);
        root.append(this.root);
        this.slots = [];
        this.inventory = null;
        this.crosshairGap = -1;
        this.crosshairReady = true;
        this.reloadShown = null;
        this.hitUntil = 0;
        this.hitLength = 1;
        this.hitOpacity = 0;
        this.setHealth(PLAYER.maxHealth);
        this.setArmor(0, false);
    }

    setMode(text) {
        this.modeBadge.textContent = text;
    }

    setVisible(visible) {
        this.root.classList.toggle('hidden', !visible);
    }

    setStatsVisible(visible) {
        this.netStats.classList.toggle('hidden', !visible);
    }

    // fps per second; ping and latency in ms (ping null = not measured yet, or offline)
    setStats({ fps, ping, latency, online }) {
        this.fpsText.textContent = `FPS ${Math.round(fps)}`;
        this.fpsText.className = fps >= 50 ? 'good' : fps >= 30 ? 'ok' : 'bad';
        this.pingText.textContent = ping === null ? `PING ${online ? '—' : 'LOCAL'}` : `PING ${Math.round(ping)}ms`;
        this.pingText.className = ping === null ? '' : ping < 80 ? 'good' : ping < 150 ? 'ok' : 'bad';
        this.latencyText.textContent = `LAT ${Math.round(latency)}ms`;
    }

    setHealth(health) {
        const hp = Math.max(0, Math.ceil(health));
        if (hp === this.hp) return;
        this.hp = hp;
        this.healthValue.textContent = String(hp);
        this.health.classList.toggle('low', hp > 0 && hp <= 25);
    }

    setArmor(armor, helmet) {
        const value = Math.max(0, Math.round(armor));
        if (value === this.armorShown && helmet === this.helmetShown) return;
        this.armorShown = value;
        this.helmetShown = helmet;
        this.armorValue.textContent = String(value);
        this.armorIcon.textContent = helmet ? '⛑' : '⛉';
        this.armor.classList.toggle('none', value <= 0);
    }

    // ammo: { mag, reserve } or null (knife / potion); name of the weapon in hand
    setAmmo(ammo, name, reloading = false) {
        const key = `${name}|${ammo ? `${ammo.mag}/${ammo.reserve}` : '-'}|${reloading}`;
        if (key === this.ammoKey) return;
        this.ammoKey = key;
        this.weaponName.textContent = name || '';
        this.ammo.classList.toggle('hidden', !ammo);
        if (ammo) {
            this.ammoMag.textContent = String(ammo.mag);
            this.ammoReserve.textContent = String(ammo.reserve);
            const spec = weaponSpec(name ? this.inventoryId : null);
            this.ammo.classList.toggle('low', ammo.mag <= Math.max(1, Math.floor((spec?.mag ?? 30) * 0.2)));
        }
        this.ammoBox.classList.toggle('reloading', reloading);
    }

    // inventory: { hotbar: [itemId|null], ammo, counts, selected }. Called on every change of
    // ammo or selection, so it only touches the text that changed.
    setInventory(inventory) {
        const layoutChanged = !this.inventory || this.inventory.hotbar.join() !== inventory.hotbar.join();
        this.inventory = inventory;
        this.inventoryId = inventory.hotbar[inventory.selected];
        if (layoutChanged) this.buildSlots();
        for (const slot of this.slots) {
            if (!slot) continue;
            const id = slot.itemId;
            let text = '';
            let out = false;
            if (STACKED.includes(id)) {
                const n = inventory.counts[id] || 0;
                text = `×${n}`;
                out = n === 0;
            } else if (inventory.ammo[id]) {
                const a = inventory.ammo[id];
                text = `${a.mag}/${a.reserve}`;
                out = a.mag + a.reserve === 0;
            }
            if (text !== slot.text) {
                slot.text = text;
                slot.count.textContent = text;
            }
            if (out !== slot.out) {
                slot.out = out;
                slot.node.classList.toggle('empty', out);
            }
        }
        this.setSelected(inventory.selected);
    }

    // One cell per slot that holds something; empty gun slots and the RPG slot (unless carried) are left out
    buildSlots() {
        this.slotList.replaceChildren();
        this.slots = this.inventory.hotbar.map((itemId, i) => {
            if (!itemId) return null;
            const icon = el('canvas', { width: 64, height: 32 });
            const ctx = icon.getContext('2d');
            if (!weaponSpec(itemId)?.mag) ctx.translate(16, 0); // square pixel icons, centred
            getItemView(itemId)?.drawIcon(ctx, 32);
            const count = el('div.count');
            const name = el('div.name', { text: weaponSpec(itemId)?.short || getItem(itemId)?.short || getItem(itemId)?.name || '' });
            const node = el('div.slot', {}, [el('div.key', { text: String(i + 1) }), icon, name, count]);
            this.slotList.append(node);
            return { node, count, itemId, text: null, out: false };
        });
        this.selected = null;
    }

    setSelected(index) {
        if (this.selected === index) return;
        this.selected = index;
        this.inventoryId = this.inventory?.hotbar[index];
        this.slots.forEach((slot, i) => slot?.node.classList.toggle('selected', i === index));
    }

    // 0..1: how deep in a smoke cloud the camera is (the screen greys out)
    setSmoke(amount) {
        const v = Math.round(amount * 20) / 20;
        if (v === this.smokeShown) return;
        this.smokeShown = v;
        this.smoke.style.opacity = String(v * 0.92);
    }

    // gap in pixels from the centre to each crosshair line; ready: the gun can shoot right now
    setCrosshair(gap, visible = true, ready = true) {
        this.crosshair.classList.toggle('hidden', !visible);
        if (ready !== this.crosshairReady) {
            this.crosshairReady = ready;
            this.crosshair.classList.toggle('busy', !ready);
        }
        const g = Math.round(Math.min(120, gap));
        if (g === this.crosshairGap) return;
        this.crosshairGap = g;
        this.crosshair.style.setProperty('--gap', `${g}px`);
    }

    // Reloading: the crosshair turns into a ring that fills up, with the seconds left inside.
    // status: { progress 0..1, left seconds } or null
    setReload(status) {
        const key = status ? `${Math.round(status.progress * 60)}|${status.left.toFixed(1)}` : null;
        if (key === this.reloadShown) return;
        if (!status !== !this.reloadShown) this.crosshair.classList.toggle('reloading', !!status);
        this.reloadShown = key;
        if (!status) return;
        this.reloadRing.style.setProperty('--p', `${(status.progress * 360).toFixed(0)}deg`);
        this.reloadText.textContent = status.left.toFixed(1);
    }

    // Team Buy money, with a +$300 / -$2500 flash on changes
    setMoney(money) {
        if (money === undefined || money === null) return;
        this.money.classList.remove('hidden');
        if (money === this.moneyShown) return;
        if (this.moneyShown !== undefined) {
            const delta = money - this.moneyShown;
            this.moneyDelta.textContent = `${delta > 0 ? '+' : '-'}$${Math.abs(delta)}`;
            this.moneyDelta.classList.toggle('spent', delta < 0);
            flash(this.moneyDelta, 'show', 1500);
        }
        this.moneyShown = money;
        this.money.textContent = `$ ${money}`;
    }

    // Big centre message: "Blue Brick Win!"
    showBanner(text, kind = '', ms = 3000) {
        this.banner.textContent = text;
        this.banner.className = `round-banner ${kind}`;
        clearTimeout(this.bannerTimer);
        this.bannerTimer = setTimeout(() => this.banner.classList.add('hidden'), ms);
    }

    setUnderwater(on) {
        if (on === this.isUnderwater) return;
        this.isUnderwater = on;
        this.underwater.classList.toggle('hidden', !on);
    }

    setScope(on) {
        this.scope.classList.toggle('hidden', !on);
    }

    // 'reddot' | 'reflex' | 'holo' or null
    setReticle(sightId) {
        if (sightId === this.reticleShown) return;
        this.reticleShown = sightId;
        this.reticle.className = sightId ? `reticle ${sightId}` : 'reticle hidden';
    }

    setProtected(on) {
        this.protection.classList.toggle('hidden', !on);
    }

    // "Hold E to ..." under the crosshair, or null
    setUseHint(text) {
        if (text === this.useHintShown) return;
        this.useHintShown = text;
        this.useHint.classList.toggle('hidden', !text);
        if (text) this.useHint.textContent = text;
    }

    // A timed action in progress (helping someone up...): { label, progress 0..1 } or null
    setProgress(status) {
        this.progressBar.classList.toggle('hidden', !status);
        if (!status) return;
        if (status.label !== this.progressLabel.textContent) this.progressLabel.textContent = status.label;
        this.progressFill.style.width = `${(Math.min(1, status.progress) * 100).toFixed(1)}%`;
    }

    // The controls line shown for a while at the start: the core keys plus the mode's and the
    // features' own (["E use", ...])
    setHelp(extra) {
        this.helpHint.textContent = [
            'WASD move · Shift walk · C / Ctrl crouch · Space / wheel jump · Click fire · Right click scope/stab/hold to aim · R reload · 1-5 / Q weapons · 6 / 7 grenades',
            ...extra,
            'V camera · Tab scores · Esc menu'
        ].join(' · ');
    }

    // Hit confirmation: a small white X, shown at full strength, then faded by update() every frame
    hit() {
        this.hitLength = 0.2;
        this.hitUntil = performance.now() / 1000 + this.hitLength;
    }

    // Per frame: fade the hit marker, which pops in a little big and shrinks back; always ends at
    // 0, whatever happened in between
    update(now = performance.now() / 1000) {
        const left = this.hitUntil - now;
        const k = left > 0 ? left / this.hitLength : 0;
        const opacity = Math.min(0.95, k * 1.6);
        if (opacity === this.hitOpacity) return;
        this.hitOpacity = opacity;
        this.hitmarker.style.opacity = opacity.toFixed(2);
        this.hitmarker.style.transform = `translate(-50%, -50%) rotate(45deg) scale(${(1 + 0.4 * k * k).toFixed(3)})`;
    }

    // A badge over the health (null hides it); ending: it blinks
    setBadge(text, ending = false) {
        this.badge.classList.toggle('hidden', !text);
        this.badge.classList.toggle('ending', !!text && ending);
        if (text) this.badge.textContent = text;
    }

    // A soft gold edge round the screen
    setGlow(on) {
        this.glow.classList.toggle('on', !!on);
    }

    flash(kind) {
        flash(this.vignettes[kind], 'show', kind === 'danger' ? 250 : 150);
    }

    // A red arc around the crosshair pointing at where the damage came from (radians, 0 = ahead)
    damageFrom(angle) {
        const arc = this.damageArcs[this.nextArc];
        this.nextArc = (this.nextArc + 1) % MAX_DAMAGE_ARCS;
        arc.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
        flash(arc, 'show', 900);
    }

    toast(text) {
        const node = el('div.toast', { text });
        this.toasts.append(node);
        while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
        setTimeout(() => node.remove(), 2300);
    }

    // entry: { killer, victim, weapon, headshot, mine }
    kill({ killer, victim, weapon, headshot, mine }) {
        const label = weapon === 'fall' || weapon === 'landing' ? 'FELL' : weaponSpec(weapon)?.short || getItem(weapon)?.short || weapon?.toUpperCase() || '';
        const tag = el('span.weapon', {}, [label, headshot ? el('span.hs', { text: ' ◎' }) : null]);
        const node = el(`div.kill${mine ? '.mine' : ''}`, {}, killer
            ? [el('span.killer', { text: killer }), tag, el('span.victim', { text: victim })]
            : [el('span.victim', { text: victim }), tag]);
        this.killfeed.append(node);
        while (this.killfeed.children.length > 5) this.killfeed.firstChild.remove();
        setTimeout(() => node.remove(), 6000);
    }
}
