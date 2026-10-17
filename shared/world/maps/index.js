import classic from './classic.js';
import iceworld from './iceworld.js';
import dust from './dust.js';
import poolday from './poolday.js';

// Every playable map. A map: { id, name, description, size, height, layout, landmarks, spawns, theme }
// layout: boxes of blocks (see layout.js); spawns: tile rectangles per side ('t', 'ct');
// landmarks.sniperPerches: tower tops bots like to snipe from.
// rpgSpots (optional): standing spots { ix, iz, y, name } where the RPG power weapon appears.
// Maps never name a mode: data only one mode needs lives in that mode's mapOverlay (shared/modes/<id>/maps.js).
const ALL = [classic, iceworld, dust, poolday];

export const MAPS = Object.freeze(Object.fromEntries(ALL.map(map => [map.id, map])));
export const DEFAULT_MAP = classic.id;

export function getMap(id) {
    return MAPS[id] || null;
}
