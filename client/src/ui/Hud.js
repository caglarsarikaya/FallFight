import { BOW, PLAYER } from '../../shared/constants.js';
import { getItem } from '../../shared/items/ItemRegistry.js';
import { getItemView } from '../items/registry.js';
import { drawPixelArt } from '../world/textures.js';
import { el, flash } from './dom.js';

const HEART = [
    '.bb.bb.',
    'brrbrrb',
    'brwrrrb',
    'brrrrrb',
    '.brrrb.',
    '..brb..',
    '...b...'
];
const HEART_PALETTES = {
    full: { b: '#1a0000', r: '#e01e1e', w: '#ffb3b3' },
    empty: { b: '#1a0000', r: '#3a1414', w: '#3a1414' }
};

function heartCanvas(kind) {
    const canvas = el('canvas', { width: 14, height: 14 });
    const ctx = canvas.getContext('2d');
    if (kind === 'half') {
        drawPixelArt(ctx, HEART, HEART_PALETTES.empty, 14);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, 7, 14);
        ctx.clip();
        drawPixelArt(ctx, HEART, HEART_PALETTES.full, 14);
        ctx.restore();
    } else {
        drawPixelArt(ctx, HEART, HEART_PALETTES[kind], 14);
    }
    return canvas;
}

const KILL_ICONS = { axe: '🪓', bow: '🏹', headshot: '🎯', fall: '⬇', default: '⚔' };

// Heads-up display: hearts, hotbar, crosshair, bow charge, kill feed, toasts and screen flashes
export class Hud {
    constructor(root) {
        this.crosshair = el('div.crosshair');
        this.hitmarker = el('div.hitmarker');
        this.chargeFill = el('div.charge-fill');
        this.charge = el('div.charge.hidden', {}, this.chargeFill);
        this.itemName = el('div.item-name');
        this.hearts = el('div.hearts');
        this.hpNumber = el('div.hp-number');
        this.hotbar = el('div.hotbar');
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
        this.helpHint = el('div.help-hint', {
            text: 'WASD move · Space jump · Click use · 1 Bow · 2 Axe · 3 Potion · V camera · Tab scores · Esc menu'
        });
        setTimeout(() => {
            this.helpHint.style.opacity = '0';
        }, 12000);

        this.root = el('div.hud', {}, [
            this.crosshair, this.hitmarker, this.charge, this.protection,
            ...Object.values(this.vignettes),
            el('div.hud-bottom', {}, [
                this.itemName,
                el('div.status-row', {}, [this.hearts, this.hpNumber]),
                this.hotbar
            ]),
            this.netStats, this.killfeed, this.toasts, this.modeBadge, this.helpHint
        ]);
        root.append(this.root);
        this.slots = [];
        this.inventory = null;
        this.setHealth(PLAYER.maxHealth);
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
        if (hp === this.health) return;
        this.health = hp;
        this.hearts.replaceChildren();
        for (let i = 0; i < 10; i++) {
            const value = hp - i * 10;
            this.hearts.append(heartCanvas(value >= 10 ? 'full' : value >= 5 ? 'half' : 'empty'));
        }
        this.hearts.classList.toggle('low', hp > 0 && hp <= 25);
        this.hpNumber.textContent = `${hp} HP`;
    }

    // inventory: { hotbar: [itemId], counts: { key: n }, selected }
    setInventory(inventory) {
        const layoutChanged = !this.inventory || this.inventory.hotbar.join() !== inventory.hotbar.join();
        this.inventory = inventory;
        if (layoutChanged) this.buildHotbar();
        this.inventory.hotbar.forEach((itemId, i) => {
            const slot = this.slots[i];
            const item = getItem(itemId);
            if (item?.countKey) {
                const n = inventory.counts[item.countKey] || 0;
                slot.count.textContent = n;
                slot.count.classList.toggle('zero', n === 0);
            }
        });
        this.setSelected(inventory.selected, false);
    }

    buildHotbar() {
        this.hotbar.replaceChildren();
        this.slots = this.inventory.hotbar.map((itemId, i) => {
            const icon = el('canvas', { width: 32, height: 32 });
            getItemView(itemId)?.drawIcon(icon.getContext('2d'), 32);
            const count = el('div.count');
            const node = el('div.slot', {}, [el('div.key', { text: String(i + 1) }), icon, count]);
            this.hotbar.append(node);
            return { node, count, itemId };
        });
    }

    setSelected(index, announce = true) {
        this.slots.forEach((slot, i) => slot.node.classList.toggle('selected', i === index));
        if (announce && this.selected !== index) {
            const item = getItem(this.slots[index]?.itemId);
            if (item) {
                this.itemName.textContent = `${item.name} — ${item.description}`;
                flash(this.itemName, 'show', 1500);
            }
        }
        this.selected = index;
    }

    // progress 0..1, or null to hide
    setCharge(progress) {
        this.charge.classList.toggle('hidden', progress === null);
        if (progress !== null) {
            this.chargeFill.style.width = `${Math.round(progress * 100)}%`;
            // Gold once a head hit would be a one-shot headshot
            this.chargeFill.classList.toggle('full', progress >= BOW.headshotPower);
        }
    }

    setProtected(on) {
        this.protection.classList.toggle('hidden', !on);
    }

    hit(head = false) {
        this.hitmarker.classList.toggle('head', head);
        flash(this.hitmarker, 'show', head ? 300 : 150);
    }

    flash(kind) {
        flash(this.vignettes[kind], 'show', kind === 'danger' ? 250 : 150);
    }

    toast(text) {
        const node = el('div.toast', { text });
        this.toasts.append(node);
        setTimeout(() => node.remove(), 2300);
    }

    // entry: { killer, victim, weapon, mine }
    kill({ killer, victim, weapon, mine }) {
        const icon = KILL_ICONS[weapon] || KILL_ICONS.default;
        const node = el(`div.kill${mine ? '.mine' : ''}`, {}, killer
            ? [el('span', { text: killer }), el('span.weapon', { text: icon }), el('span', { text: victim })]
            : [el('span', { text: victim }), el('span.weapon', { text: icon }), el('span', { text: weapon === 'fall' ? 'fell' : 'died' })]);
        this.killfeed.append(node);
        while (this.killfeed.children.length > 5) this.killfeed.firstChild.remove();
        setTimeout(() => node.remove(), 6000);
    }
}
