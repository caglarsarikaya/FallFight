// Playable characters. All share the same stats; they differ in looks (see client/src/characters).
export const CHARACTERS = [
    { id: 'robot', name: 'Robot', tagline: 'Steel plating, laser visor, zero fear.' },
    { id: 'squirrel', name: 'Squirrel', tagline: 'Small, fluffy and very angry.' },
    { id: 'mario', name: 'Mario', tagline: 'Plumber by day, axe-swinger by night.' },
    { id: 'doctor-octopus', name: 'Dr Octopus', tagline: 'Four mechanical arms, one evil plan.' }
];

export const DEFAULT_CHARACTER = CHARACTERS[0].id;

export function isValidCharacter(id) {
    return CHARACTERS.some(c => c.id === id);
}

export function sanitizeRoomName(name) {
    return String(name || '').replace(/[^\p{L}\p{N} _\-.'!]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

export function sanitizeName(name) {
    const clean = String(name || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16);
    return clean || 'Player';
}
