// Static arena layout: boxes of blocks on the 60 x 60 tile grid. Ranges are inclusive; layer 0 is
// the floor (world y -1..0), layer 1 the first block above it (world y 0..1), and so on.

import { BLOCK_KIND } from './blocks.js';

export { BLOCK_KIND };

const SIZE = 60;
const SNIPER_HEIGHT = 8;

const box = (kind, x0, x1, z0, z1, y0, y1) => ({ kind, x0, x1, z0, z1, y0, y1 });
const stone = (x0, x1, z0, z1, height) => box(BLOCK_KIND.STONE, x0, x1, z0, z1, 1, height);
const planks = (x0, x1, z0, z1, height) => box(BLOCK_KIND.PLANKS, x0, x1, z0, z1, 1, height);

// 3x3 plank lookout, 2 high, with a 1-high step block on its east side
function lookoutTower(x, z) {
    return [planks(x, x + 2, z, z + 2, 2), planks(x + 3, x + 3, z + 1, z + 1, 1)];
}

// 5x5 stone tower, 8 high, with a parapet round the top and a plank staircase:
// steps climb 1 block per tile along the north side (heights 1..7), then a landing at 8 on the
// north-east corner leads onto the top through a 2-block gap in the parapet.
function sniperTower(x, z) {
    const boxes = [stone(x, x + 4, z, z + 4, SNIPER_HEIGHT)];
    for (let i = 0; i < 7; i++) boxes.push(planks(x - 1 + i, x - 1 + i, z - 1, z - 1, i + 1));
    boxes.push(planks(x + 5, x + 5, z, z, SNIPER_HEIGHT));
    const rim = SNIPER_HEIGHT + 1;
    boxes.push(
        box(BLOCK_KIND.STONE, x, x + 3, z, z, rim, rim),           // north edge, gap at the stairs
        box(BLOCK_KIND.STONE, x, x + 4, z + 4, z + 4, rim, rim),   // south edge
        box(BLOCK_KIND.STONE, x, x, z + 1, z + 3, rim, rim),       // west edge
        box(BLOCK_KIND.STONE, x + 4, x + 4, z + 2, z + 3, rim, rim) // east edge, gap continues
    );
    return boxes;
}

const SNIPER_ORIGINS = [[5, 7], [50, 7], [5, 48], [50, 48]];
const LOOKOUT_ORIGINS = [[17, 17], [40, 17], [17, 40], [40, 40]];

export const ARENA_LAYOUT = [
    // Grass floor
    box(BLOCK_KIND.GRASS, 0, SIZE - 1, 0, SIZE - 1, 0, 0),

    // Centre: stone plaza (1 high) ringed by 2-high cover walls
    stone(28, 31, 28, 31, 1),
    stone(24, 24, 28, 31, 2),
    stone(35, 35, 28, 31, 2),
    stone(28, 31, 24, 24, 2),
    stone(28, 31, 35, 35, 2),

    ...LOOKOUT_ORIGINS.flatMap(([x, z]) => lookoutTower(x, z)),
    ...SNIPER_ORIGINS.flatMap(([x, z]) => sniperTower(x, z)),

    // Mid-field cover walls (2 high)
    stone(12, 12, 28, 31, 2),
    stone(47, 47, 28, 31, 2),
    stone(28, 31, 12, 12, 2),
    stone(28, 31, 47, 47, 2),

    // Low walls (1 high) to duck behind
    stone(9, 9, 20, 22, 1),
    stone(50, 50, 20, 22, 1),
    stone(9, 9, 37, 39, 1),
    stone(50, 50, 37, 39, 1),

    // Crates (2x2, 1 high)
    planks(24, 25, 14, 15, 1),
    planks(34, 35, 14, 15, 1),
    planks(24, 25, 44, 45, 1),
    planks(34, 35, 44, 45, 1),
    planks(14, 15, 24, 25, 1),
    planks(44, 45, 24, 25, 1),
    planks(14, 15, 34, 35, 1),
    planks(44, 45, 34, 35, 1)
];

// Named spots in the layout, used by bots (sniper perches) and tests
export const LANDMARKS = {
    openFloor: { ix: 22, iz: 22 },
    lane: { ix: 22, from: 22, to: 14 },            // clear straight line along x = 22
    plaza: { ix: 29, iz: 29 },
    wall: { ix: 24, iz: 29 },                       // 2 high, with open floor at ix 23 and 25
    lookout: { top: { ix: 18, iz: 18 }, step: { ix: 20, iz: 18 }, besideStep: { ix: 21, iz: 18 }, belowSide: { ix: 18, iz: 21 } },
    sniper: { top: { ix: 7, iz: 9 }, stairsStart: { ix: 4, iz: 6 }, approach: { ix: 2, iz: 4 } },
    sniperPerches: SNIPER_ORIGINS.map(([x, z]) => ({ ix: x + 2, iz: z + 2, y: SNIPER_HEIGHT }))
};
