import { el } from './dom.js';

// Every key in the game, grouped: the in-game hint, the Esc menu's Help page and the main menu's
// controls list all read from here. Modes add a Shop group and features an Abilities group with
// their static menuControls ([[key, what]]).
const MOVEMENT = [['WASD', 'Move'], ['Shift', 'Walk (silent, accurate)'], ['C / Ctrl', 'Crouch'], ['Space / wheel', 'Jump']];
const COMBAT = [['Left click', 'Fire / slash'], ['Right click', 'Scope / knife stab, hold to aim'], ['R', 'Reload']];
const ITEMS = [['1 / 2 / 3 / 4', 'Rifle / Pistol / Knife / Potion'], ['Q', 'Switch weapon'], ['6 / 7', 'HE / smoke grenade (click to throw)']];
const GENERAL = [['V', 'First / third person'], ['Tab', 'Scoreboard'], ['Esc', 'Game menu (and this help)']];
// The main menu doesn't know the mode yet
export const SHOP_CONTROLS = [['B', 'Buy menu'], ['N', 'Quick buy: ammo'], ['M', 'Quick buy: kevlar + helmet'], ['H', 'Quick buy: 2 potions'], ['G', 'Quick buy: HE + smoke']];

// [{ title, rows: [[key, what]] }], empty groups left out. plugins: the mode and features in play
// (or their classes); shop: the Shop group's rows
export function controlGroups(plugins, shop = null) {
    const classes = plugins.map(p => (typeof p === 'function' ? p : p.constructor));
    const isMode = C => C.isMode;
    shop ??= classes.filter(isMode).flatMap(C => C.menuControls ?? []);
    return [
        { title: 'Movement', rows: MOVEMENT },
        { title: 'Combat', rows: COMBAT },
        { title: 'Weapons & items', rows: ITEMS },
        { title: 'Shop', rows: shop },
        { title: 'Abilities', rows: classes.filter(C => !isMode(C)).flatMap(C => C.menuControls ?? []) },
        { title: 'General', rows: GENERAL }
    ].filter(g => g.rows.length);
}

export function renderControls(groups) {
    return el('div.controls-groups', {}, groups.map(({ title, rows }) => el('div.controls-group', {}, [
        el('div.controls-title', { text: title }),
        el('ul', {}, rows.map(([key, what]) => el('li', {}, [el('b', { text: key }), ` ${what}`])))
    ])));
}
