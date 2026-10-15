import { BLOCK_KIND as K } from '../blocks.js';
import { box, house, mirrorX, ring, stairs } from './build.js';

const SIZE = 44;
const FLOOR = 2;    // the lawn is 2 blocks up so the pool can be sunk into it

// After fy_pool_day: two pool houses facing each other across a sunken pool. Swim, dive off the
// board, climb the stairs onto the roofs to snipe. Bedrock under the lawn: nobody falls through
// it (the tiles at the bottom of the pool are another story).
const westHouse = [
    ...house(K.PLANKS, 2, 8, 15, 28, FLOOR, 6, {
        roof: K.PLANKS,
        openings: [
            [8, 8, 20, 23, 3, 4],       // door towards the pool
            [8, 8, 16, 17, 5, 5],       // windows
            [8, 8, 26, 27, 5, 5],
            [2, 2, 21, 22, 3, 4]        // back door
        ]
    }),
    // Stairs up to the roof along the north wall
    ...stairs(K.PLANKS, 3, 14, 1, 0, FLOOR + 1, FLOOR + 1, 7),
    // Palm tree on the lawn
    box(K.PLANKS, 11, 11, 34, 34, FLOOR + 1, FLOOR + 4),
    box(K.GRASS, 10, 12, 33, 35, FLOOR + 5, FLOOR + 5),
    // Hedges
    box(K.GRASS, 13, 17, 7, 7, FLOOR + 1, FLOOR + 1),
    box(K.GRASS, 13, 17, 36, 36, FLOOR + 1, FLOOR + 1)
];

export default {
    id: 'fy_pool_day',
    name: 'fy_pool_day',
    description: 'Two pool houses across a sunken pool: swim, dive, snipe from the roofs.',
    size: SIZE,
    height: 10,
    floor: FLOOR,
    layout: [
        box(K.BEDROCK, 0, SIZE - 1, 0, SIZE - 1, 0, 0),
        box(K.DIRT, 0, SIZE - 1, 0, SIZE - 1, 1, 1),
        box(K.GRASS, 0, SIZE - 1, 0, SIZE - 1, FLOOR, FLOOR),
        ...ring(K.BEDROCK, 0, SIZE - 1, 0, SIZE - 1, FLOOR + 1, 9),

        // Tiled deck and the sunken pool (2 deep), with steps at the west end
        box(K.TILE, 9, 34, 13, 30, FLOOR, FLOOR),
        box(K.TILE, 12, 31, 16, 27, 0, 0),
        box(K.WATER, 12, 31, 16, 27, 1, 2),
        box(K.TILE, 12, 13, 20, 23, 1, 1),
        // Diving board over the east end
        box(K.PLANKS, 28, 33, 21, 22, FLOOR + 1, FLOOR + 1),
        // Lounge chairs on the deck
        box(K.PLANKS, 15, 16, 14, 14, FLOOR + 1, FLOOR + 1),
        box(K.PLANKS, 20, 21, 14, 14, FLOOR + 1, FLOOR + 1),
        box(K.PLANKS, 22, 23, 29, 29, FLOOR + 1, FLOOR + 1),
        box(K.PLANKS, 27, 28, 29, 29, FLOOR + 1, FLOOR + 1),
        // Crates on the lawns
        box(K.CRATE, 20, 21, 4, 5, FLOOR + 1, FLOOR + 1),
        box(K.CRATE, 22, 23, 38, 39, FLOOR + 1, FLOOR + 2),

        ...westHouse,
        ...mirrorX(westHouse, SIZE)
    ],
    landmarks: {
        pool: { ix: 22, iz: 22 },
        poolSteps: { ix: 12, iz: 21 },
        board: { ix: 29, iz: 21 },
        sniperPerches: [{ ix: 5, iz: 21, y: 7 }, { ix: 38, iz: 21, y: 7 }]
    },
    spawns: {
        t: [{ x0: 3, x1: 7, z0: 16, z1: 27 }],
        ct: [{ x0: 36, x1: 40, z0: 16, z1: 27 }],
        zombie: [{ x0: 12, x1: 31, z0: 2, z1: 5 }, { x0: 12, x1: 31, z0: 38, z1: 41 }]
    },
    theme: { sky: '#3f8be0', horizon: '#cde8ff', fog: '#d6ecff', fogNear: 70, fogFar: 180, void: 'none', sun: 2.4, wall: '#f4efe6' }
};
