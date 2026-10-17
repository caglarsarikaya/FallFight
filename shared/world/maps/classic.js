import { ARENA_LAYOUT, LANDMARKS, RPG_SPOTS } from '../layout.js';

// The original lava arena: open grass, a stone plaza, plank lookouts and four sniper towers
export default {
    id: 'fallfight_classic',
    name: 'Lava Arena',
    description: 'Open grass over lava, a walled plaza and four sniper towers.',
    size: 60,
    height: 10,
    layout: ARENA_LAYOUT,
    landmarks: LANDMARKS,
    // A one-shot RPG appears on one of these tower tops (the rpg feature, shared/features/rpg/)
    rpgSpots: RPG_SPOTS,
    // Tile rectangles (inclusive): team bases on the west and east edges
    spawns: {
        t: [{ x0: 1, x1: 4, z0: 24, z1: 35 }],
        ct: [{ x0: 55, x1: 58, z0: 24, z1: 35 }]
    },
    theme: { sky: '#87b9e8', fog: '#b9d6f0', void: 'lava' }
};
