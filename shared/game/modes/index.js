import { DEFAULT_MODE } from '../../config/modes.js';
import { FreeForAll } from './FreeForAll.js';
import { GunGame } from './GunGame.js';

const MODE_CLASSES = { ffa: FreeForAll, gungame: GunGame };

export function createMode(id, room) {
    const Mode = MODE_CLASSES[id] || MODE_CLASSES[DEFAULT_MODE];
    return new Mode(room);
}

export function isPlayableMode(id) {
    return Object.hasOwn(MODE_CLASSES, id);
}
