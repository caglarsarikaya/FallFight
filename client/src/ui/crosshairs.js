import { el } from './dom.js';

// The crosshair styles players bring from other shooters. gap: fixed distance from the centre to
// the lines in pixels, or null to open up with the gun's inaccuracy (the HUD feeds it then)
export const CROSSHAIRS = [
    { id: 'classic', name: 'Classic', gap: null, len: 9, thick: 2 },
    { id: 'static', name: 'Small', gap: 3, len: 6, thick: 2 },
    { id: 'crossdot', name: 'Cross + dot', gap: 5, len: 6, thick: 2, dot: 2 },
    { id: 'dot', name: 'Dot', gap: 0, len: 0, thick: 0, dot: 4 },
    { id: 'tee', name: 'T', gap: null, len: 9, thick: 2, noTop: true }
];
export const DEFAULT_CROSSHAIR = 'classic';

export const CROSSHAIR_COLORS = [
    ['#5dff5d', 'Green'], ['#00ffff', 'Cyan'], ['#ffff00', 'Yellow'], ['#ff40ff', 'Pink'], ['#ff3030', 'Red'], ['#ffffff', 'White']
];
export const DEFAULT_CROSSHAIR_COLOR = CROSSHAIR_COLORS[0][0];

export const crosshairStyle = id => CROSSHAIRS.find(c => c.id === id) || CROSSHAIRS[0];
export const isCrosshairColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

// The crosshair itself: four lines and a centre dot, shaped by CSS variables (styles: .crosshair)
export function crosshairNode(children = []) {
    return el('div.crosshair', {}, [...['t', 'b', 'l', 'r'].map(side => el(`div.ch.ch-${side}`)), el('div.ch.ch-dot'), ...children]);
}

// Shape and colour a crosshair node; dynamic ones get their gap from the caller afterwards
export function applyCrosshair(node, id, color) {
    const style = crosshairStyle(id);
    node.style.setProperty('--len', `${style.len}px`);
    node.style.setProperty('--thick', `${style.thick}px`);
    node.style.setProperty('--dot', `${style.dot || 0}px`);
    node.style.setProperty('--gap', `${style.gap ?? 6}px`);
    node.style.setProperty('--ch-color', isCrosshairColor(color) ? color : DEFAULT_CROSSHAIR_COLOR);
    node.classList.toggle('no-top', !!style.noTop);
    node.classList.toggle('no-dot', !style.dot);
    node.classList.toggle('no-lines', !style.len);
    return style;
}

// Options control: a live preview, the styles and the colours (swatches, or any colour).
// onChange(style id, colour) on every pick
export function crosshairPicker(profile, onChange) {
    const preview = crosshairNode();
    const styleButtons = CROSSHAIRS.map(c => el('button.btn.menu-choice', { type: 'button', text: c.name, onclick: () => pick(c.id, current.color) }));
    const swatches = CROSSHAIR_COLORS.map(([hex, name]) => {
        const swatch = el('button.crosshair-swatch', { type: 'button', title: name, 'aria-label': name, onclick: () => pick(current.id, hex) });
        swatch.style.background = hex;
        return swatch;
    });
    const custom = el('input.crosshair-custom', { type: 'color', title: 'Any colour', 'aria-label': 'Custom crosshair colour' });
    custom.addEventListener('input', () => pick(current.id, custom.value));
    const current = { id: DEFAULT_CROSSHAIR, color: DEFAULT_CROSSHAIR_COLOR };

    const set = (id, color) => {
        current.id = crosshairStyle(id).id;
        current.color = (isCrosshairColor(color) ? color : DEFAULT_CROSSHAIR_COLOR).toLowerCase();
        applyCrosshair(preview, current.id, current.color);
        styleButtons.forEach((b, i) => b.classList.toggle('selected', CROSSHAIRS[i].id === current.id));
        swatches.forEach((s, i) => s.classList.toggle('selected', CROSSHAIR_COLORS[i][0] === current.color));
        custom.value = current.color;
    };
    function pick(id, color) {
        set(id, color);
        onChange(current.id, current.color);
    }
    set(profile.crosshair, profile.crosshairColor);

    return {
        node: el('div.crosshair-picker', {}, [
            el('div.crosshair-preview', {}, [preview]),
            el('div.crosshair-picks', {}, [
                el('div.menu-choices', {}, styleButtons),
                el('div.crosshair-colors', {}, [...swatches, custom])
            ])
        ]),
        set
    };
}
