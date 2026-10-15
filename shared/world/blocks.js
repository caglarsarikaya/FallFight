// Block kinds and what they do. Kinds are stored per voxel in Arena.kinds (Uint8Array).
export const BLOCK_KIND = Object.freeze({
    AIR: 0, GRASS: 1, STONE: 2, PLANKS: 3,
    SAND: 4, SANDSTONE: 5, SNOW: 6, ICE: 7, TILE: 8, WATER: 9, BEDROCK: 10, CRATE: 11, DIRT: 12
});

// solid      blocks movement, bullets and sight (water doesn't)
// breakable  two bullets crack it and the knife breaks it; map walls are not
// friction   ground grip multiplier (ice is slippery)
// surface    footstep / impact sound family
const K = BLOCK_KIND;
export const BLOCKS = Object.freeze({
    [K.AIR]: { solid: false, breakable: false, friction: 1, surface: null },
    [K.GRASS]: { solid: true, breakable: true, friction: 1, surface: 'grass' },
    [K.STONE]: { solid: true, breakable: true, friction: 1, surface: 'stone' },
    [K.PLANKS]: { solid: true, breakable: true, friction: 1, surface: 'wood' },
    [K.SAND]: { solid: true, breakable: true, friction: 1, surface: 'sand' },
    [K.SANDSTONE]: { solid: true, breakable: true, friction: 1, surface: 'stone' },
    [K.SNOW]: { solid: true, breakable: true, friction: 0.85, surface: 'snow' },
    [K.ICE]: { solid: true, breakable: true, friction: 0.16, surface: 'ice' },
    [K.TILE]: { solid: true, breakable: true, friction: 1, surface: 'stone' },
    [K.WATER]: { solid: false, breakable: false, friction: 1, surface: 'water' },
    [K.BEDROCK]: { solid: true, breakable: false, friction: 1, surface: 'stone' },
    [K.CRATE]: { solid: true, breakable: true, friction: 1, surface: 'wood' },
    [K.DIRT]: { solid: true, breakable: true, friction: 1, surface: 'grass' }
});

export function blockProps(kind) {
    return BLOCKS[kind] || BLOCKS[K.STONE];
}

// Fast lookups by kind for the hot paths (collision, raycasts)
export const SOLID = Uint8Array.from({ length: 256 }, (_, kind) => (BLOCKS[kind]?.solid ? 1 : 0));
export const BREAKABLE = Uint8Array.from({ length: 256 }, (_, kind) => (BLOCKS[kind]?.breakable ? 1 : 0));

