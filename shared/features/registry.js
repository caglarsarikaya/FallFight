import { Jetpack } from './jetpack/Jetpack.js';
import { LongJump } from './longjump/LongJump.js';
import { Angel } from './angel/Angel.js';
import { Revive } from './revive/Revive.js';
import { MapRpg } from './rpg/MapRpg.js';

// Every feature a mode can list in its descriptor's `features`, by id. The client half of a
// feature (views, sounds, HUD) lives in client/src/features/<id>/.
const FEATURES = new Map([Jetpack, LongJump, Angel, Revive, MapRpg].map(F => [F.id, F]));

export function getFeature(id) {
    return FEATURES.get(id) || null;
}

// One instance of each listed feature for a room
export function createFeatures(ids, room) {
    return ids.map(id => {
        const Feature = getFeature(id);
        if (!Feature) throw new Error(`Unknown feature "${id}"`);
        return new Feature(room);
    });
}

// The physics hooks of the listed features (shared/physics.js stepMovement)
export function movementHooks(ids) {
    return ids.map(id => getFeature(id)?.movement).filter(Boolean);
}
