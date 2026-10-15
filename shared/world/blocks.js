// Block kinds and what they do. Kinds are stored per voxel in Arena.kinds (Uint8Array).
export const BLOCK_KIND = Object.freeze({ AIR: 0, GRASS: 1, STONE: 2, PLANKS: 3 });

// Bullet damage a block soaks up before it cracks (the knife breaks any block outright).
// Floor blocks (layer 0) are FLOOR_HP_SCALE times tougher so a spray doesn't open a pit at once.
export const BLOCK_HP = Object.freeze({ [BLOCK_KIND.GRASS]: 180, [BLOCK_KIND.STONE]: 300, [BLOCK_KIND.PLANKS]: 110 });
export const FLOOR_HP_SCALE = 1.5;
