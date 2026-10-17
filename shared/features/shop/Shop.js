import { GRENADE } from '../../constants.js';
import { SHOP } from './config.js';
import { WEAPONS, WEAPON_SLOT, isGun } from '../../config/weapons.js';
import { OPTIC_IDS, SIGHTS, canMount } from '../../config/sights.js';

// What the buy menu sells, shared by the modes that have one (Team Buy, Zombies).
// Each mode decides who may buy and when; this only handles the item, the price and the money.

// Price of refilling a gun's reserve: a magazine's worth costs about a tenth of the gun
const ammoPrice = spec => spec.ammoPrice ?? Math.max(30, Math.round(spec.price / 25) * 10);

// Which guns an ammo item refills
const AMMO_FILTERS = {
    ammo: () => true,
    ammo_primary: spec => spec.slot === WEAPON_SLOT.PRIMARY,
    ammo_secondary: spec => spec.slot === WEAPON_SLOT.SECONDARY
};

const GRENADE_PRICES = { hegrenade: GRENADE.he.price, smokegrenade: GRENADE.smoke.price };

// 'sight_<sight>_<slot>': an optic for the gun in the primary (0) or pistol (1) slot
const SIGHT_ITEM = new RegExp(`^sight_(${OPTIC_IDS.join('|')})_([01])$`);
export const sightItem = (sightId, slot) => `sight_${sightId}_${slot}`;

// Returns { ok, error?, price }. item: a gun id, 'kevlar', 'kevlar_helmet', 'health_potion',
// 'hegrenade', 'smokegrenade', 'ammo' (every gun), 'ammo_primary', 'ammo_secondary', a sight for a
// gun carried ('sight_holo_0': see sightItem), 'rebuy' or one of the quick buys 'rebuy_ammo', 'rebuy_armor', 'rebuy_potion', 'rebuy_grenades' (see rebuy below).
// free: Deathmatch, nothing costs money and buying a gun you carry refills it.
// notify: false leaves telling the client to the caller (rebuy sends one update for everything).
export function buyItem(room, player, item, { free = false, notify = true } = {}) {
    if (Object.hasOwn(QUICK_BUYS, item)) return rebuy(room, player, { free, order: QUICK_BUYS[item] });
    const inv = player.inventory;
    let price;
    let apply;
    const sight = SIGHT_ITEM.exec(item);
    if (sight) {
        const [, sightId, slot] = sight;
        const gunId = inv.hotbar[Number(slot)];
        if (!isGun(gunId)) return { ok: false, error: 'nogun' };
        if (!canMount(WEAPONS[gunId], sightId)) return { ok: false, error: 'unfit' };
        if (inv.sights[gunId] === sightId) return { ok: false, error: 'owned' };
        price = SIGHTS[sightId].price;
        apply = () => { inv.sights[gunId] = sightId; };
    } else if (isGun(item)) {
        const spec = WEAPONS[item];
        if (spec.special) return { ok: false, error: 'unknown' };
        if (inv.has(item) && !free) return { ok: false, error: 'owned' };
        price = spec.price;
        apply = () => {
            const slot = inv.give(item);
            inv.select(slot);
            player.gun.reload = null;
            player.gun.scoped = 0;
            player.gun.readyAt = room.time + spec.deploy;
        };
    } else if (item === 'kevlar') {
        if (player.armor >= 100) return { ok: false, error: 'owned' };
        price = SHOP.kevlar;
        apply = () => { player.armor = 100; };
    } else if (item === 'kevlar_helmet') {
        if (player.armor >= 100 && player.helmet) return { ok: false, error: 'owned' };
        // Already wearing a full vest: just the helmet
        price = player.armor >= 100 ? SHOP.kevlarHelmet - SHOP.kevlar : SHOP.kevlarHelmet;
        apply = () => {
            player.armor = 100;
            player.helmet = true;
        };
    } else if (item === 'health_potion') {
        if (inv.count('health_potion') >= 2) return { ok: false, error: 'owned' };
        price = SHOP.potion;
        apply = () => inv.add('health_potion', 1);
    } else if (Object.hasOwn(GRENADE_PRICES, item)) {
        if (inv.count(item) >= GRENADE.max) return { ok: false, error: 'owned' };
        price = GRENADE_PRICES[item];
        apply = () => inv.add(item, 1);
    } else if (Object.hasOwn(AMMO_FILTERS, item)) {
        const wanted = AMMO_FILTERS[item];
        const needs = Object.entries(inv.ammo).filter(([id, a]) => !WEAPONS[id].special && wanted(WEAPONS[id]) && a.reserve < WEAPONS[id].reserve);
        if (!needs.length) return { ok: false, error: 'owned' };
        price = needs.reduce((sum, [id]) => sum + ammoPrice(WEAPONS[id]), 0);
        apply = () => {
            for (const [id, a] of needs) a.reserve = WEAPONS[id].reserve;
        };
    } else {
        return { ok: false, error: 'unknown' };
    }
    if (free) price = 0;
    if ((player.money ?? 0) < price) return { ok: false, error: 'money' };
    if (price) player.money -= price;
    apply();
    if (notify) room.notifyInventory(player);
    return { ok: true, price };
}

// Quick buys (N ammo, M armor, H potions, G grenades) and 'rebuy' (all of them): top up in one go.
// When money is short the order decides what you get: ammo for every gun, then kevlar (with the
// helmet if it can be paid for), then two potions, then an HE, then a smoke. Things already full
// or too dear are skipped. Each step is a list of alternatives, the first that can be bought wins.
// Returns { ok, bought: [item...], price } or { ok: false, error: 'money' | 'owned' }.
const QUICK_ORDERS = {
    rebuy_ammo: [['ammo']],
    rebuy_armor: [['kevlar_helmet', 'kevlar']],
    rebuy_potion: [['health_potion'], ['health_potion']],
    rebuy_grenades: [['hegrenade'], ['smokegrenade']]
};
export const QUICK_BUYS = { ...QUICK_ORDERS, rebuy: Object.values(QUICK_ORDERS).flat() };

export function rebuy(room, player, { free = false, order = QUICK_BUYS.rebuy } = {}) {
    const bought = [];
    let price = 0;
    let short = false;
    for (const choices of order) {
        for (const item of choices) {
            const result = buyItem(room, player, item, { free, notify: false });
            if (result.ok) {
                bought.push(item);
                price += result.price;
                break;
            }
            if (result.error === 'money') short = true;
            // A full vest without a helmet we can't afford: don't buy the vest again
            else if (item === 'kevlar_helmet') break;
        }
    }
    if (!bought.length) return { ok: false, error: short ? 'money' : 'owned' };
    room.notifyInventory(player);
    return { ok: true, bought, price };
}
