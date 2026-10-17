import ffa from './ffa/index.js';
import gungame from './gungame/index.js';
import teambuy from './teambuy/index.js';
import zombies from './zombies/index.js';

// Every game mode, in menu order. A mode is a folder in shared/modes/<id>/ whose index.js exports
// a descriptor:
//   { id, name, short, description,     what the menus show
//     maps: [mapId...],                 the maps it plays on, first is the default
//     mapOverlay?: { [mapId]: {...} },  per-map data only this mode needs (room.mapRules)
//     ruleset?: {...},                  tuning overrides (shared/ruleset.js)
//     features?: [featureId...],        opt-in gameplay pieces (shared/features/registry.js)
//     Rules }                           a GameMode subclass with its rules
// Its client half lives in client/src/modes/<id>/.
export const MODES = [];
export const DEFAULT_MODE = 'ffa';

const byId = new Map();

export function registerMode(descriptor) {
    const { id, maps, Rules } = descriptor;
    if (byId.has(id)) throw new Error(`Mode "${id}" is already registered`);
    if (!maps?.length || typeof Rules !== 'function') throw new Error(`Mode "${id}" needs maps and a Rules class`);
    const mode = Object.freeze({ ruleset: {}, mapOverlay: {}, features: [], ...descriptor });
    byId.set(id, mode);
    MODES.push(mode);
    return mode;
}

for (const mode of [ffa, gungame, teambuy, zombies]) registerMode(mode);

export function getModeInfo(id) {
    return byId.get(id) || null;
}

export function isValidMode(id) {
    return byId.has(id);
}

// Does this mode play on this map?
export function modeHasMap(modeId, mapId) {
    return !!getModeInfo(modeId)?.maps.includes(mapId);
}

// The rules object for a room (unknown ids fall back to the default mode)
export function createMode(id, room) {
    const descriptor = getModeInfo(id) || getModeInfo(DEFAULT_MODE);
    return new descriptor.Rules(room, descriptor);
}
