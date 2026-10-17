import { ClientMode } from './ClientMode.js';
import { FfaClient } from './ffa/FfaClient.js';
import { GunGameClient } from './gungame/GunGameClient.js';
import { TeamBuyClient } from './teambuy/TeamBuyClient.js';
import { ZombiesClient } from './zombies/ZombiesClient.js';

// The client half of each mode in shared/modes/, by id. A mode without one gets the plain
// ClientMode.
const MODES = new Map([FfaClient, GunGameClient, TeamBuyClient, ZombiesClient].map(M => [M.id, M]));

export function createClientMode(id, game) {
    return new (MODES.get(id) || ClientMode)(game);
}

export function allClientModes() {
    return [...MODES.values()];
}
