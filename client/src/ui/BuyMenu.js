import { TEAM_BUY } from '../../shared/config/modes.js';
import { WEAPONS, WEAPON_KIND } from '../../shared/config/weapons.js';
import { getItemView } from '../items/registry.js';
import { el } from './dom.js';

// The CS 1.6 buy menu: press B, pick a category with a number key, then an item with another.
// Esc / B / 0 closes it (0 goes back from a category). Items you can't afford are greyed out;
// the server checks everything again.
const gunsOf = kind => Object.values(WEAPONS).filter(w => w.kind === kind).map(w => ({ id: w.id, name: w.name, price: w.price, gun: true }));

const CATEGORIES = [
    { name: 'Pistols', items: () => gunsOf(WEAPON_KIND.PISTOL) },
    { name: 'Shotguns', items: () => gunsOf(WEAPON_KIND.SHOTGUN) },
    { name: 'SMGs', items: () => gunsOf(WEAPON_KIND.SMG) },
    { name: 'Rifles', items: () => gunsOf(WEAPON_KIND.RIFLE) },
    { name: 'Snipers', items: () => gunsOf(WEAPON_KIND.SNIPER) },
    {
        name: 'Equipment',
        items: () => [
            { id: 'kevlar', name: 'Kevlar Vest', price: TEAM_BUY.kevlar },
            { id: 'kevlar_helmet', name: 'Kevlar + Helmet', price: TEAM_BUY.kevlarHelmet },
            { id: 'health_potion', name: 'Health Potion (+20 HP)', price: TEAM_BUY.potion }
        ]
    },
    { name: 'Ammo for all guns', direct: 'ammo' }
];

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
        this.team = null;
    }

    get visible() {
        return this.open;
    }

    show(money, team) {
        this.open = true;
        this.money = money;
        this.team = team;
        this.category = null;
        this.render();
        this.root.classList.remove('hidden');
        this.sound.play('click');
    }

    hide() {
        this.open = false;
        this.root.classList.add('hidden');
    }

    toggle(money, team) {
        if (this.open) this.hide();
        else this.show(money, team);
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
            const cat = CATEGORIES[n - 1];
            if (!cat) return true;
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
        const item = CATEGORIES[this.category].items()[n - 1];
        if (item) {
            this.onBuy(item.id);
            this.hide();
        }
        return true;
    }

    render() {
        const money = this.money;
        if (this.category === null) {
            this.title.textContent = `BUY MENU · $${money}`;
            this.list.replaceChildren(...CATEGORIES.map((cat, i) => el('button.buy-row', { type: 'button', onclick: () => this.key(i + 1) }, [
                el('span.key', { text: String(i + 1) }), el('span.name', { text: cat.name })
            ])));
            this.hint.textContent = '0 / B / Esc to close';
            return;
        }
        const cat = CATEGORIES[this.category];
        this.title.textContent = `${cat.name.toUpperCase()} · $${money}`;
        this.list.replaceChildren(...cat.items().map((item, i) => {
            const icon = el('canvas', { width: 64, height: 32 });
            if (item.gun) getItemView(item.id)?.drawIcon(icon.getContext('2d'), 32);
            const poor = item.price > money;
            const own = item.id === TEAM_BUY.defaultPistol[this.team];
            return el(`button.buy-row${poor ? '.poor' : ''}`, { type: 'button', onclick: () => this.key(i + 1) }, [
                el('span.key', { text: String(i + 1) }),
                icon,
                el('span.name', { text: `${item.name}${own ? ' (default)' : ''}` }),
                el('span.price', { text: `$${item.price}` })
            ]);
        }));
        this.hint.textContent = '0 back · Esc close';
    }
}
