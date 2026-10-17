import { AngelClient } from './angel/AngelClient.js';
import { JetpackClient } from './jetpack/JetpackClient.js';
import { LongJumpClient } from './longjump/LongJumpClient.js';
import { ReviveClient } from './revive/ReviveClient.js';
import { RpgClient } from './rpg/RpgClient.js';
// The shared halves register their items (the angel) and physics hooks
import '../../shared/features/registry.js';

// The client half of each feature in shared/features/, by id
const FEATURES = new Map([AngelClient, JetpackClient, LongJumpClient, ReviveClient, RpgClient].map(F => [F.id, F]));

export function createClientFeatures(ids, game) {
    return ids.map(id => FEATURES.get(id)).filter(Boolean).map(F => new F(game));
}

export function allClientFeatures() {
    return [...FEATURES.values()];
}
