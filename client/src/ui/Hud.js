import { PLAYER } from '../../shared/constants.js';
import { weaponSpec } from '../../shared/config/weapons.js';
import { getItem } from '../../shared/items/ItemRegistry.js';
import { getItemView } from '../items/registry.js';
import { el, flash } from './dom.js';

const SLOT_SHOW_MS = 2500;
const MAX_DAMAGE_ARCS = 4;

// Heads-up display, laid out like CS 1.6: health and armor bottom left, ammo bottom right,
// a crosshair that opens up with inaccuracy, weapon slots on switching, kill feed top right.
export class Hud {
    constructor(root) {
        this.crosshair = el('div.crosshair', {}, ['t', 'b', 'l', 'r'].map(side => el(`div.ch.ch-${side}`)));
        this.hitmarker = el('div.hitmarker');
        this.scope = el('div.scope.hidden', {}, [el('div.scope-h'), el('div.scope-v')]);
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
        this.vignettes = {
            damage: el('div.vignette.damage'),
            danger: el('div.vignette.danger'),
            heal: el('div.vignette.heal')
        };
        this.underwater = el('div.underwater.hidden');
        this.helpHint = el('div.help-hint', {
            text: 'WASD move · Shift walk · C crouch · Space jump · Click fire · Right click scope/stab · R reload · 1-4 / Q / wheel weapons · B buy · V camera · Tab scores · Esc menu'
        });
        setTimeout(() => {
            this.helpHint.style.opacity = '0';
        }, 14000);

        this.root = el('div.hud', {}, [
            this.underwater, this.scope, this.crosshair, this.hitmarker, this.damageLayer, this.protection,
            ...Object.values(this.vignettes),
            el('div.hud-left', {}, [this.health, this.armor]),
            this.ammoBox, this.slotList, this.banner,
            this.netStats, this.killfeed, this.toasts, this.modeBadge, this.helpHint
        ]);
        root.append(this.root);
        this.slots = [];
        this.inventory = null;
        this.crosshairGap = -1;
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

    // inventory: { hotbar: [itemId|null], ammo, counts, selected }
    setInventory(inventory) {
        const layoutChanged = !this.inventory || this.inventory.hotbar.join() !== inventory.hotbar.join();
        this.inventory = inventory;
        this.inventoryId = inventory.hotbar[inventory.selected];
        if (layoutChanged) this.buildSlots();
        this.slots.forEach((slot, i) => {
            const id = inventory.hotbar[i];
            if (id === 'health_potion') {
                const n = inventory.counts.health_potion || 0;
                slot.count.textContent = String(n);
                slot.node.classList.toggle('empty', n === 0);
            }
        });
        this.setSelected(inventory.selected);
    }

    buildSlots() {
        this.slotList.replaceChildren();
        this.slots = this.inventory.hotbar.map((itemId, i) => {
            const icon = el('canvas', { width: 64, height: 32 });
            const ctx = icon.getContext('2d');
            if (!weaponSpec(itemId)?.mag) ctx.translate(16, 0); // square pixel icons, centred
            if (itemId) getItemView(itemId)?.drawIcon(ctx, 32);
            const count = el('div.count');
            const name = el('div.name', { text: itemId ? (weaponSpec(itemId)?.short || getItem(itemId)?.name || '') : '' });
            const node = el(`div.slot${itemId ? '' : '.empty'}`, {}, [el('div.key', { text: String(i + 1) }), icon, name, count]);
            this.slotList.append(node);
            return { node, count, itemId };
        });
    }

    setSelected(index) {
        this.slots.forEach((slot, i) => slot.node.classList.toggle('selected', i === index));
        if (this.selected !== index) {
            this.selected = index;
            this.inventoryId = this.inventory?.hotbar[index];
            this.showSlots();
        }
    }

    showSlots() {
        this.slotList.classList.add('show');
        clearTimeout(this.slotTimer);
        this.slotTimer = setTimeout(() => this.slotList.classList.remove('show'), SLOT_SHOW_MS);
    }

    // gap in pixels from the centre to each crosshair line
    setCrosshair(gap, visible = true) {
        this.crosshair.classList.toggle('hidden', !visible);
        const g = Math.round(Math.min(120, gap));
        if (g === this.crosshairGap) return;
        this.crosshairGap = g;
        this.crosshair.style.setProperty('--gap', `${g}px`);
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

    // Big centre message: "Counter-Terrorists Win!"
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

    setProtected(on) {
        this.protection.classList.toggle('hidden', !on);
    }

    hit(head = false, kill = false) {
        this.hitmarker.classList.toggle('head', head);
        this.hitmarker.classList.toggle('kill', kill);
        flash(this.hitmarker, 'show', kill ? 350 : head ? 250 : 120);
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
        const label = weapon === 'fall' ? 'FELL' : weaponSpec(weapon)?.short || weapon?.toUpperCase() || '';
        const tag = el('span.weapon', {}, [label, headshot ? el('span.hs', { text: ' ◎' }) : null]);
        const node = el(`div.kill${mine ? '.mine' : ''}`, {}, killer
            ? [el('span.killer', { text: killer }), tag, el('span.victim', { text: victim })]
            : [el('span.victim', { text: victim }), tag]);
        this.killfeed.append(node);
        while (this.killfeed.children.length > 5) this.killfeed.firstChild.remove();
        setTimeout(() => node.remove(), 6000);
    }
}
