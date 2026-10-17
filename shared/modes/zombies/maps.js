import { getMap } from '../../world/maps/index.js';

// What Zombies needs from each map it plays on, kept here so map files stay mode-free.
// spawns: tile rectangles (inclusive) where zombies come in; humans use the map's 'ct' side.
// longJumpSpot (optional): { ix, iz, y } where the long jump module appears.
const plaza = getMap('fallfight_classic').landmarks.plaza;

export const mapOverlay = {
    fallfight_classic: {
        spawns: [{ x0: 20, x1: 39, z0: 1, z1: 3 }, { x0: 20, x1: 39, z0: 56, z1: 58 }],
        longJumpSpot: { ix: plaza.ix, iz: plaza.iz, y: 1 }
    },
    de_dust_mini: {
        spawns: [{ x0: 2, x1: 8, z0: 41, z1: 46 }, { x0: 39, x1: 45, z0: 41, z1: 46 }, { x0: 2, x1: 8, z0: 13, z1: 18 }]
    },
    fy_iceworld: {
        spawns: [{ x0: 2, x1: 6, z0: 15, z1: 20 }, { x0: 29, x1: 33, z0: 15, z1: 20 }]
    },
    fy_pool_day: {
        spawns: [{ x0: 12, x1: 31, z0: 2, z1: 5 }, { x0: 12, x1: 31, z0: 38, z1: 41 }]
    }
};
