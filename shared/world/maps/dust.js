import { BLOCK_KIND as K } from '../blocks.js';
import { box, ring } from './build.js';

const SIZE = 48;

// After de_dust: three lanes between two big sandstone blocks. Long on the west with its double
// doors, mid with the famous doors, short on the east up a raised catwalk. Tunnels cut through
// both blocks. Red Brick spawns south, Blue Brick north, with a crate-strewn site on
// each side of the CT spawn.
export default {
    id: 'de_dust_mini',
    name: 'Dust Arena',
    description: 'Long, mid and short lanes, doors and tunnels: a compact take on Dust.',
    size: SIZE,
    height: 8,
    floor: 0,
    layout: [
        box(K.SAND, 0, SIZE - 1, 0, SIZE - 1, 0, 0),
        ...ring(K.BEDROCK, 0, SIZE - 1, 0, SIZE - 1, 1, 5),

        // West block, with a tunnel from long to mid (2 high, roofed)
        box(K.SANDSTONE, 11, 18, 12, 20, 1, 4),
        box(K.SANDSTONE, 11, 18, 24, 36, 1, 4),
        box(K.SANDSTONE, 11, 18, 21, 23, 3, 4),
        // East block, with a tunnel from mid to short
        box(K.SANDSTONE, 29, 36, 12, 26, 1, 4),
        box(K.SANDSTONE, 29, 36, 30, 36, 1, 4),
        box(K.SANDSTONE, 29, 36, 27, 29, 3, 4),

        // Mid doors: a wall across mid with a 2-wide doorway
        box(K.SANDSTONE, 19, 22, 24, 24, 1, 3),
        box(K.SANDSTONE, 25, 28, 24, 24, 1, 3),
        box(K.PLANKS, 23, 24, 24, 24, 3, 3),
        // Long doors
        box(K.SANDSTONE, 1, 4, 31, 31, 1, 3),
        box(K.SANDSTONE, 8, 10, 31, 31, 1, 3),
        box(K.PLANKS, 5, 7, 31, 31, 3, 3),

        // Short: a raised catwalk (1 high) along the east wall
        box(K.SANDSTONE, 38, 46, 14, 23, 1, 1),

        // A site (north-west): a big crate you can climb via a small one
        box(K.CRATE, 4, 5, 5, 6, 1, 2),
        box(K.CRATE, 6, 6, 6, 6, 1, 1),
        box(K.CRATE, 13, 14, 4, 5, 1, 1),
        box(K.CRATE, 8, 9, 10, 10, 1, 1),
        // B site (north-east)
        box(K.CRATE, 40, 41, 5, 6, 1, 2),
        box(K.CRATE, 42, 42, 6, 6, 1, 1),
        box(K.CRATE, 33, 34, 7, 8, 1, 1),
        box(K.CRATE, 44, 45, 10, 10, 1, 1),

        // Mid "xbox" and lane cover
        box(K.CRATE, 22, 23, 14, 15, 1, 1),
        box(K.CRATE, 25, 26, 33, 34, 1, 2),
        box(K.CRATE, 27, 27, 34, 34, 1, 1),
        box(K.CRATE, 5, 6, 20, 21, 1, 1),
        box(K.CRATE, 41, 42, 30, 31, 1, 1),
        // T spawn cover
        box(K.CRATE, 21, 22, 41, 42, 1, 1),
        box(K.SANDSTONE, 12, 15, 40, 40, 1, 2),
        box(K.SANDSTONE, 32, 35, 40, 40, 1, 2)
    ],
    landmarks: {
        midDoors: { ix: 23, iz: 24 },
        tunnel: { ix: 15, iz: 22 },
        sniperPerches: [{ ix: 4, iz: 5, y: 2 }, { ix: 40, iz: 5, y: 2 }, { ix: 25, iz: 33, y: 2 }, { ix: 44, iz: 18, y: 1 }]
    },
    spawns: {
        t: [{ x0: 16, x1: 31, z0: 42, z1: 46 }],
        ct: [{ x0: 17, x1: 30, z0: 1, z1: 6 }]
    },
    theme: { sky: '#6f9fd6', horizon: '#f1d9ad', fog: '#ecd5a8', fogNear: 60, fogFar: 160, void: 'lava', sun: 2.6, wall: '#e8cf9a' }
};
