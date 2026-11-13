import { SENSITIVITY, clampSensitivity } from '../../shared/look.js';

// Tiny helper for building DOM: el('div.class#id', { attrs }, children)
export function el(spec, attrs = {}, children = []) {
    const [, tag = 'div', rest = ''] = spec.match(/^([a-z0-9]*)(.*)$/i);
    const node = document.createElement(tag || 'div');
    for (const part of rest.match(/[.#][^.#]+/g) || []) {
        if (part[0] === '.') node.classList.add(part.slice(1));
        else node.id = part.slice(1);
    }
    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'text') node.textContent = value;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of [].concat(children)) {
        if (child != null) node.append(child);
    }
    return node;
}

// A row of buttons where exactly one is on: [[value, label]]
export function choice(options, onPick) {
    const buttons = options.map(([value, label]) => {
        const button = el('button.btn.menu-choice', { type: 'button', text: label, onclick: () => onPick(value) });
        button.dataset.value = value;
        return button;
    });
    return {
        node: el('div.menu-choices', {}, buttons),
        set: value => buttons.forEach(b => b.classList.toggle('selected', b.dataset.value === value))
    };
}

// Mouse sensitivity: a slider for the rough setting and a number field for the exact one (players
// bring their value from other games and tune it in small steps). onChange gets the clamped value
export function sensitivityControl(value, onChange) {
    const slider = el('input', { type: 'range', min: SENSITIVITY.sliderMin, max: SENSITIVITY.sliderMax, step: SENSITIVITY.step });
    const number = el('input.menu-number', { type: 'number', min: SENSITIVITY.min, max: SENSITIVITY.max, step: SENSITIVITY.step, 'aria-label': 'Mouse sensitivity' });
    const set = v => {
        slider.value = v;
        number.value = Number(v).toFixed(2);
    };
    slider.addEventListener('input', () => {
        const v = clampSensitivity(Number(slider.value));
        number.value = v.toFixed(2);
        onChange(v);
    });
    // While typing only the slider follows; the field is tidied up once the player is done
    number.addEventListener('input', () => {
        if (number.value === '' || !Number.isFinite(Number(number.value))) return;
        const v = clampSensitivity(Number(number.value));
        slider.value = v;
        onChange(v);
    });
    number.addEventListener('change', () => set(clampSensitivity(Number(number.value) || Number(slider.value))));
    set(value);
    return { node: el('div.menu-slider-number', {}, [slider, number]), set };
}

// Re-trigger a CSS "show" flash
export function flash(node, className = 'show', duration = 120) {
    node.classList.add(className);
    clearTimeout(node._flashTimer);
    node._flashTimer = setTimeout(() => node.classList.remove(className), duration);
}
