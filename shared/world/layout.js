// Static arena layout: boxes of blocks on the tile grid. Ranges are inclusive; layer 0 is the floor
// (world y -1..0), layer 1 is the first block above it (world y 0..1), and so on.

export const BLOCK_KIND = Object.freeze({ AIR: 0, GRASS: 1, STONE: 2, PLANKS: 3 });

const tower = (x0, z0) => ({ kind: BLOCK_KIND.PLANKS, x0, x1: x0 + 2, z0, z1: z0 + 2, y0: 1, y1: 2 });
const block = (x, z, kind = BLOCK_KIND.PLANKS) => ({ kind, x0: x, x1: x, z0: z, z1: z, y0: 1, y1: 1 });
const wall = (x0, x1, z0, z1) => ({ kind: BLOCK_KIND.STONE, x0, x1, z0, z1, y0: 1, y1: 2 });

export const ARENA_LAYOUT = [
    // Grass floor
    { kind: BLOCK_KIND.GRASS, x0: 0, x1: 29, z0: 0, z1: 29, y0: 0, y1: 0 },

    // Central stone plaza, 1 high
    { kind: BLOCK_KIND.STONE, x0: 13, x1: 16, z0: 13, z1: 16, y0: 1, y1: 1 },

    // Four 2-high plank towers, each with a 1-high step facing the middle so it can be climbed
    tower(4, 4), block(7, 5),
    tower(23, 4), block(22, 5),
    tower(4, 23), block(7, 24),
    tower(23, 23), block(22, 24),

    // Cover walls around the plaza, 2 high
    wall(9, 9, 13, 16),
    wall(20, 20, 13, 16),
    wall(13, 16, 9, 9),
    wall(13, 16, 20, 20)
];
