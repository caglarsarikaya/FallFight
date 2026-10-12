import { DEFAULT_CHARACTER, isValidCharacter, sanitizeName } from '../../shared/characters/definitions.js';

const KEY = 'fallfight.profile.v1';

const DEFAULTS = {
    name: '',
    characterId: DEFAULT_CHARACTER,
    cameraMode: 'first',
    volume: 0.7,
    // Last "create room" choices (never the password)
    roomName: '',
    roomMaxPlayers: 0,
    roomBots: true,
    sensitivity: 1
};

// Player choices remembered between visits (browser storage may be unavailable; that's fine)
export class Profile {
    constructor(data = {}) {
        Object.assign(this, DEFAULTS, data);
        if (!isValidCharacter(this.characterId)) this.characterId = DEFAULT_CHARACTER;
    }

    static load() {
        try {
            return new Profile(JSON.parse(localStorage.getItem(KEY) || '{}'));
        } catch {
            return new Profile();
        }
    }

    get hasName() {
        return this.name.trim().length > 0;
    }

    setName(name) {
        this.name = sanitizeName(name);
    }

    save() {
        try {
            localStorage.setItem(KEY, JSON.stringify({
                name: this.name,
                characterId: this.characterId,
                cameraMode: this.cameraMode,
                volume: this.volume,
                sensitivity: this.sensitivity,
                roomName: this.roomName,
                roomMaxPlayers: this.roomMaxPlayers,
                roomBots: this.roomBots
            }));
        } catch {
            // Private mode or storage disabled: choices last for this session only
        }
    }
}
