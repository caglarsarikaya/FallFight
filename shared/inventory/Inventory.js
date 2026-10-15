import { WEAPON_SLOT, isGun, weaponSpec } from '../config/weapons.js';
import { getItem } from '../items/ItemRegistry.js';

const SLOT_COUNT = 7;

// CS-style slots: 1 primary gun, 2 pistol, 3 knife, 4 health potion, 5 special (the map's RPG),
// 6 HE grenade, 7 smoke grenade. Each gun carried has its own ammo (rounds in the magazine +
// reserve); consumables (potions, grenades) are counted in `counts`.
export class Inventory {
    // loadout: { weapons: [gunId], counts: { health_potion } }
    constructor(loadout = {}) {
        this.reset(loadout);
    }

    reset({ weapons = [], counts = {} } = {}) {
        this.hotbar = [null, null, 'knife', 'health_potion', null, 'hegrenade', 'smokegrenade'];
        this.ammo = {};
        this.counts = { health_potion: 0, hegrenade: 0, smokegrenade: 0, ...counts };
        for (const id of weapons) this.give(id);
        this.selected = this.bestSlot();
    }

    // Puts a gun in its slot (replacing what was there) with full ammo. Returns the slot.
    give(id) {
        if (!isGun(id)) return -1;
        const spec = weaponSpec(id);
        const old = this.hotbar[spec.slot];
        if (old && old !== id) delete this.ammo[old];
        this.hotbar[spec.slot] = id;
        this.ammo[id] = { mag: spec.mag, reserve: spec.reserve };
        return spec.slot;
    }

    removeSlot(slot) {
        const id = this.hotbar[slot];
        if (!isGun(id)) return;
        delete this.ammo[id];
        this.hotbar[slot] = null;
        if (this.selected === slot) this.selected = this.bestSlot();
    }

    // Primary if we have one, else pistol, else knife
    bestSlot() {
        if (this.hotbar[WEAPON_SLOT.PRIMARY]) return WEAPON_SLOT.PRIMARY;
        if (this.hotbar[WEAPON_SLOT.SECONDARY]) return WEAPON_SLOT.SECONDARY;
        return WEAPON_SLOT.KNIFE;
    }

    select(slot) {
        if (Number.isInteger(slot) && slot >= 0 && slot < SLOT_COUNT && this.hotbar[slot]) {
            this.selected = slot;
            return true;
        }
        return false;
    }

    itemAt(slot) {
        const id = this.hotbar[slot];
        return id ? getItem(id) : null;
    }

    get selectedItem() {
        return this.itemAt(this.selected);
    }

    get selectedId() {
        return this.hotbar[this.selected];
    }

    has(id) {
        return this.hotbar.includes(id);
    }

    count(key) {
        return this.counts[key] || 0;
    }

    add(key, amount = 1) {
        this.counts[key] = this.count(key) + amount;
    }

    consume(key, amount = 1) {
        if (this.count(key) < amount) return false;
        this.counts[key] -= amount;
        return true;
    }

    // Ammo pickup: n magazines into the reserve of every gun carried, up to its maximum.
    // Returns true if anything was added.
    addMagazines(n = 1) {
        let added = false;
        for (const [id, ammo] of Object.entries(this.ammo)) {
            const spec = weaponSpec(id);
            const reserve = Math.min(spec.reserve, ammo.reserve + spec.mag * n);
            if (reserve > ammo.reserve) {
                ammo.reserve = reserve;
                added = true;
            }
        }
        return added;
    }

    // Do the guns carried still have room for more ammo?
    needsAmmo() {
        return Object.entries(this.ammo).some(([id, a]) => a.reserve < weaponSpec(id).reserve);
    }

    toJSON() {
        const ammo = {};
        for (const [id, a] of Object.entries(this.ammo)) ammo[id] = { mag: a.mag, reserve: a.reserve };
        return { hotbar: [...this.hotbar], ammo, counts: { ...this.counts }, selected: this.selected };
    }
}
