import classic from './classic.js';

// Every playable map. A map: { id, name, description, size, height, layout, landmarks, spawns, theme }
// layout: boxes of blocks (see layout.js); spawns: tile rectangles per team ('t', 'ct', 'zombie');
// landmarks.sniperPerches: tower tops bots like to snipe from.
const ALL = [classic];

export const MAPS = Object.freeze(Object.fromEntries(ALL.map(map => [map.id, map])));
export const DEFAULT_MAP = classic.id;

export function getMap(id) {
    return MAPS[id] || null;
}
