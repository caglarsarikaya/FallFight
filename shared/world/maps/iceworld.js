import { BLOCK_KIND as K } from '../blocks.js';
import { box, mirrorZ, ring } from './build.js';

const SIZE = 36;

// After fy_iceworld: a small square snow field, spawns at the north and south ends, an ice-walled
// square in the middle with crates to fight around, and a slippery ice rink at its heart.
// Everything inside the outer wall can be shot down or knifed through to the void below.
const half = [
    // Spawn cover: low snow walls in front of each spawn
    box(K.SNOW, 4, 9, 7, 7, 1, 1),
    box(K.SNOW, 26, 31, 7, 7, 1, 1),
    box(K.CRATE, 16, 19, 6, 6, 1, 1),
    // Inner square, north side, with an opening in the middle
    box(K.ICE, 9, 14, 10, 10, 1, 3),
    box(K.ICE, 21, 26, 10, 10, 1, 3),
    // Side alley crates
    box(K.CRATE, 3, 4, 12, 13, 1, 1),
    box(K.CRATE, 31, 32, 12, 13, 1, 2),
    box(K.CRATE, 32, 32, 14, 14, 1, 1),             // step up onto it
    // Crates inside the square near the opening
    box(K.CRATE, 12, 13, 13, 14, 1, 1),
    box(K.CRATE, 22, 23, 13, 14, 1, 2),
    box(K.CRATE, 21, 21, 14, 14, 1, 1)
];

export default {
    id: 'fy_iceworld',
    name: 'Ice Arena',
    description: 'Small and fast: a snow field with an ice-walled square and crates in the middle.',
    size: SIZE,
    height: 8,
    floor: 0,
    layout: [
        box(K.SNOW, 0, SIZE - 1, 0, SIZE - 1, 0, 0),
        box(K.ICE, 13, 22, 13, 22, 0, 0),                 // the ice rink: you slide
        ...ring(K.BEDROCK, 0, SIZE - 1, 0, SIZE - 1, 1, 5),
        ...half,
        ...mirrorZ(half, SIZE),
        // West and east sides of the inner square, open in the middle
        box(K.ICE, 10, 10, 11, 14, 1, 3),
        box(K.ICE, 10, 10, 21, 24, 1, 3),
        box(K.ICE, 25, 25, 11, 14, 1, 3),
        box(K.ICE, 25, 25, 21, 24, 1, 3),
        // Centre crate stack: 2x2 high in the middle of a 4x4
        box(K.CRATE, 16, 19, 16, 19, 1, 1),
        box(K.CRATE, 17, 18, 17, 18, 2, 2)
    ],
    landmarks: {
        centre: { ix: 17, iz: 17 },
        rink: { ix: 14, iz: 20 },
        sniperPerches: [{ ix: 17, iz: 17, y: 2 }, { ix: 31, iz: 12, y: 2 }, { ix: 22, iz: 13, y: 2 }]
    },
    spawns: {
        t: [{ x0: 3, x1: 32, z0: 2, z1: 5 }],
        ct: [{ x0: 3, x1: 32, z0: 30, z1: 33 }],
        zombie: [{ x0: 2, x1: 6, z0: 15, z1: 20 }, { x0: 29, x1: 33, z0: 15, z1: 20 }]
    },
    theme: { sky: '#9fb7cf', horizon: '#e4edf5', fog: '#e4edf5', fogNear: 40, fogFar: 120, void: 'abyss', weather: 'snow', sun: 1.5, wall: '#dde8f2' }
};
