import { GRENADE } from '../../shared/constants.js';
import { TEAM_BUY } from '../../shared/config/modes.js';
import { WEAPONS } from '../../shared/config/weapons.js';
import { getItemView } from '../items/registry.js';
import { el } from './dom.js';

// The buy menu, numbered like classic CS (1.5 / 1.6) so muscle memory works: B 4 1 is the AK-47,
// B 4 3 the M4A1, B 3 1 the MP5, B 8 2 kevlar + helmet. Slots for guns we don't have yet stay
// empty (null) so the numbers never shift. Esc / B / 0 closes it (0 goes back from a category).
// Items you can't afford are greyed out; the server checks everything again.
// Deathmatch opens it free: no prices, and 9 switches random guns on/off.
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
            { id: 'kevlar', name: 'Kevlar Vest', price: TEAM_BUY.kevlar },
            { id: 'kevlar_helmet', name: 'Kevlar + Helmet', price: TEAM_BUY.kevlarHelmet },
            { id: 'health_potion', name: 'Health Potion (+20 HP)', price: TEAM_BUY.potion },
            { id: 'hegrenade', name: 'HE Grenade', price: GRENADE.he.price, icon: true },
            { id: 'smokegrenade', name: 'Smoke Grenade', price: GRENADE.smoke.price, icon: true }
        ]
    }
];

export class BuyMenu {
    constructor(root, { onBuy, onToggleRandom, sound }) {
        this.onBuy = onBuy;
        this.onToggleRandom = onToggleRandom;
        this.sound = sound;
        this.title = el('div.buy-title');
        this.list = el('div.buy-list');
        this.hint = el('div.buy-hint');
        this.root = el('div.buy-menu.hidden', {}, [this.title, this.list, this.hint]);
        root.append(this.root);
        this.open = false;
        this.category = null;
        this.money = 0;
        this.team = null;
        this.free = false;
        this.randomGuns = null;    // Deathmatch: shown as category 9
    }

    get visible() {
        return this.open;
    }

    show(money, team, { free = false, randomGuns = null } = {}) {
        this.open = true;
        this.money = money;
        this.team = team;
        this.free = free;
        this.randomGuns = randomGuns;
        this.category = null;
        this.render();
        this.root.classList.remove('hidden');
        this.sound.play('click');
    }

    hide() {
        this.open = false;
        this.root.classList.add('hidden');
    }

    setRandomGuns(on) {
        if (this.randomGuns === null || this.randomGuns === on) return;
        this.randomGuns = on;
        if (this.open) this.render();
    }

    // Top-level rows: the CS categories, plus the random guns switch in Deathmatch
    get categories() {
        if (this.randomGuns === null) return CATEGORIES;
        return [...CATEGORIES, { name: `Random guns: ${this.randomGuns ? 'ON' : 'OFF'}`, toggle: true }];
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
                this.category = null;
                this.render();
            }
            return true;
        }
        if (this.category === null) {
            const cat = this.categories[n - 1];
            if (cat?.toggle) {
                this.onToggleRandom();
                this.sound.play('click');
                return true;
            }
            if (!cat || (!cat.direct && !cat.items.some(Boolean))) return true;
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
        const item = CATEGORIES[this.category].items[n - 1];
        if (item) {
            this.onBuy(item.id);
            this.hide();
        }
        return true;
    }

    render() {
        const money = this.money;
        const funds = this.free ? 'FREE' : `$${money}`;
        if (this.category === null) {
            this.title.textContent = `BUY MENU · ${funds}`;
            this.list.replaceChildren(...this.categories.map((cat, i) => {
                const empty = !cat.toggle && !cat.direct && !cat.items.some(Boolean);
                return el(`button.buy-row${empty ? '.empty' : ''}`, { type: 'button', onclick: () => this.key(i + 1) }, [
                    el('span.key', { text: String(i + 1) }), el('span.name', { text: cat.name })
                ]);
            }));
            this.hint.textContent = '0 / B / Esc to close · F3 rebuys ammo, armor, potions, grenades';
            return;
        }
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
            const own = item.id === TEAM_BUY.defaultPistol[this.team];
            return el(`button.buy-row${poor ? '.poor' : ''}`, { type: 'button', onclick: () => this.key(i + 1) }, [
                el('span.key', { text: String(i + 1) }),
                icon,
                el('span.name', { text: `${item.name}${own ? ' (default)' : ''}` }),
                el('span.price', { text: this.free ? 'FREE' : `$${item.price}` })
            ]);
        }));
        this.hint.textContent = '0 back · Esc close';
    }
}
