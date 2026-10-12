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

// Re-trigger a CSS "show" flash
export function flash(node, className = 'show', duration = 120) {
    node.classList.add(className);
    clearTimeout(node._flashTimer);
    node._flashTimer = setTimeout(() => node.classList.remove(className), duration);
}
