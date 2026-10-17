import { GRENADE } from '../../shared/constants.js';
import { SHOP } from '../../shared/features/shop/config.js';
import { WEAPONS, WEAPON_SLOT } from '../../shared/config/weapons.js';
import { SIGHTS, sightsFor } from '../../shared/config/sights.js';
import { sightItem } from '../../shared/features/shop/Shop.js';
import { drawReticle } from '../items/guns/sights.js';
import { getItemView } from '../items/registry.js';
import { el } from './dom.js';

// The buy menu, numbered like classic CS (1.5 / 1.6) so muscle memory works: B 4 1 is the AK-47,
// B 4 3 the M4A1, B 3 1 the MP5, B 8 2 kevlar + helmet. Slots for guns we don't have yet stay
// empty (null) so the numbers never shift. Esc / B / 0 closes it (0 goes back from a category).
// Items you can't afford are greyed out; the server checks everything again.
// 9 is sights: pick the gun (1 main, 2 pistol), then the optic (B 9 1 3 a holo on the rifle).
// Deathmatch opens it free: no prices (random guns are switched in the Esc menu).
const gun = id => ({ id, name: WEAPONS[id].name, price: WEAPONS[id].price, gun: true });

const CATEGORIES = [
    { name: 'Pistols', items: [gun('usp'), gun('glock'), gun('deagle'), null, null, null] },
    { name: 'Shotguns', items: [gun('m3'), null] },
    { name: 'SMGs', items: [gun('mp5'), null, gun('p90'), null, null] },
    { name: 'Rifles', items: [gun('ak47'), null, gun('m4a1'), null, gun('scout'), gun('awp')] },
    { name: 'Machine gun', items: [gun('m249')] },
    { name: 'Primary ammo', direct: 'ammo_primary' },
    { name: 'Secondary ammo', direct: 'ammo_secondary' },
    {
        name: 'Equipment',
        items: [
            { id: 'kevlar', name: 'Kevlar Vest', price: SHOP.kevlar },
            { id: 'kevlar_helmet', name: 'Kevlar + Helmet', price: SHOP.kevlarHelmet },
            { id: 'health_potion', name: 'Health Potion (+20 HP)', price: SHOP.potion },
            { id: 'hegrenade', name: 'HE Grenade', price: GRENADE.he.price, icon: true },
            { id: 'smokegrenade', name: 'Smoke Grenade', price: GRENADE.smoke.price, icon: true }
        ]
    },
    { name: 'Sights', sights: true }
];
const SIGHT_SLOTS = [WEAPON_SLOT.PRIMARY, WEAPON_SLOT.SECONDARY];
const SIGHTS_CATEGORY = CATEGORIES.findIndex(c => c.sights);

export class BuyMenu {
    constructor(root, { onBuy, sound }) {
        this.onBuy = onBuy;
        this.sound = sound;
        this.title = el('div.buy-title');
        this.list = el('div.buy-list');
        this.hint = el('div.buy-hint');
        this.root = el('div.buy-menu.hidden', {}, [this.title, this.list, this.hint]);
        root.append(this.root);
        this.open = false;
        this.category = null;
        this.money = 0;
        this.defaultItem = null;   // marked "(default)": what you get anyway (the mode says)
        this.free = false;
        this.inventory = null;     // { hotbar, sights }: which guns can take which sight
        this.sightSlot = null;     // in Sights: the gun slot picked (0 main, 1 pistol)
    }

    get visible() {
        return this.open;
    }

    // options (from the mode): { free, defaultItem }; inventory: the weapons we carry
    show(money, { free = false, defaultItem = null } = {}, inventory = null) {
        this.open = true;
        this.money = money;
        this.defaultItem = defaultItem;
        this.free = free;
        this.inventory = inventory;
        this.category = null;
        this.sightSlot = null;
        this.render();
        this.root.classList.remove('hidden');
        this.sound.play('click');
    }

    hide() {
        this.open = false;
        this.root.classList.add('hidden');
    }

    // A new gun or sight while open (the sight rows show what's mounted)
    setInventory(inventory) {
        this.inventory = inventory;
        if (this.open && this.category === SIGHTS_CATEGORY) this.render();
    }

    // The gun in a sight slot and the optics it takes ([] = none)
    sightGun(slot) {
        const id = this.inventory?.hotbar[slot];
        const spec = WEAPONS[id];
        return spec ? { id, spec, optics: sightsFor(spec), mounted: this.inventory.sights?.[id] || null } : null;
    }

    setMoney(money) {
        if (money === this.money) return;
        this.money = money;
        if (this.open) this.render();
    }

    // Number keys while open: 1-9 pick, 0 goes back / closes
    key(n) {
        if (!this.open) return false;
        if (n === 0) {
            if (this.category === null) this.hide();
            else {
                if (this.sightSlot !== null) this.sightSlot = null;
                else this.category = null;
                this.render();
            }
            return true;
        }
        if (this.category === null) {
            const cat = CATEGORIES[n - 1];
            if (!cat || (!cat.direct && !cat.sights && !cat.items.some(Boolean))) return true;
            if (cat.direct) {
                this.onBuy(cat.direct);
                this.hide();
            } else {
                this.category = n - 1;
                this.render();
                this.sound.play('click');
            }
            return true;
        }
        if (this.category === SIGHTS_CATEGORY) return this.sightKey(n);
        const item = CATEGORIES[this.category].items[n - 1];
        if (item) {
            this.onBuy(item.id);
            this.hide();
        }
        return true;
    }

    sightKey(n) {
        if (this.sightSlot === null) {
            const slot = SIGHT_SLOTS[n - 1];
            if (slot === undefined || !this.sightGun(slot)?.optics.length) return true;
            this.sightSlot = slot;
            this.render();
            this.sound.play('click');
            return true;
        }
        const sightId = this.sightGun(this.sightSlot)?.optics[n - 1];
        if (sightId) {
            this.onBuy(sightItem(sightId, this.sightSlot));
            this.hide();
        }
        return true;
    }

    render() {
        const money = this.money;
        const funds = this.free ? 'FREE' : `$${money}`;
        if (this.category === null) {
            this.title.textContent = `BUY MENU · ${funds}`;
            this.list.replaceChildren(...CATEGORIES.map((cat, i) => {
                const empty = !cat.direct && !cat.sights && !cat.items.some(Boolean);
                return el(`button.buy-row${empty ? '.empty' : ''}`, { type: 'button', onclick: () => this.key(i + 1) }, [
                    el('span.key', { text: String(i + 1) }), el('span.name', { text: cat.name })
                ]);
            }));
            this.hint.textContent = '0 / B / Esc to close · quick buy: N ammo · M kevlar · H potions · G grenades';
            return;
        }
        if (this.category === SIGHTS_CATEGORY) return this.renderSights(funds);
        const cat = CATEGORIES[this.category];
        this.title.textContent = `${cat.name.toUpperCase()} · ${funds}`;
        this.list.replaceChildren(...cat.items.map((item, i) => {
            if (!item) {
                return el('div.buy-row.empty', {}, [el('span.key', { text: String(i + 1) }), el('span.name', { text: '—' })]);
            }
            const icon = el('canvas', { width: 64, height: 32 });
            if (item.gun) getItemView(item.id)?.drawIcon(icon.getContext('2d'), 32);
            else if (item.icon) {
                const ctx = icon.getContext('2d');
                ctx.translate(16, 0);
                getItemView(item.id)?.drawIcon(ctx, 32);
            }
            const poor = !this.free && item.price > money;
            const own = item.id === this.defaultItem;
            return el(`button.buy-row${poor ? '.poor' : ''}`, { type: 'button', onclick: () => this.key(i + 1) }, [
                el('span.key', { text: String(i + 1) }),
                icon,
                el('span.name', { text: `${item.name}${own ? ' (default)' : ''}` }),
                el('span.price', { text: this.free ? 'FREE' : `$${item.price}` })
            ]);
        }));
        this.hint.textContent = '0 back · Esc close';
    }

    // Sights: first the two guns, then the optics the picked one takes
    renderSights(funds) {
        this.hint.textContent = '0 back · Esc close';
        if (this.sightSlot === null) {
            this.title.textContent = `SIGHTS · ${funds}`;
            this.list.replaceChildren(...SIGHT_SLOTS.map((slot, i) => {
                const gun = this.sightGun(slot);
                const label = i === 0 ? 'Main gun' : 'Pistol';
                const name = !gun ? `${label} (none)` : `${label} · ${gun.spec.name}${gun.optics.length ? '' : ' (no sights)'}`;
                const icon = el('canvas', { width: 64, height: 32 });
                if (gun) getItemView(gun.id)?.drawIcon(icon.getContext('2d'), 32);
                return el(`button.buy-row${gun?.optics.length ? '' : '.empty'}`, { type: 'button', onclick: () => this.key(i + 1) }, [
                    el('span.key', { text: String(i + 1) }), icon, el('span.name', { text: name })
                ]);
            }));
            return;
        }
        const gun = this.sightGun(this.sightSlot);
        this.title.textContent = `${(gun?.spec.name ?? '').toUpperCase()} SIGHTS · ${funds}`;
        this.list.replaceChildren(...(gun?.optics ?? []).map((id, i) => {
            const sight = SIGHTS[id];
            const icon = el('canvas', { width: 64, height: 32 });
            drawReticle(icon.getContext('2d'), id);
            const poor = !this.free && sight.price > this.money;
            return el(`button.buy-row${poor ? '.poor' : ''}`, { type: 'button', onclick: () => this.key(i + 1) }, [
                el('span.key', { text: String(i + 1) }),
                icon,
                el('span.name', { text: `${sight.name}${gun.mounted === id ? ' (mounted)' : ''}` }),
                el('span.price', { text: this.free ? 'FREE' : `$${sight.price}` })
            ]);
        }));
    }
}
