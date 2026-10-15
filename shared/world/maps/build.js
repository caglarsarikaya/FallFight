import { BLOCK_KIND } from '../blocks.js';

// Little helpers for writing map layouts. All ranges are inclusive tile / layer indices; later
// boxes overwrite earlier ones, so carve with AIR (or WATER) after building solid shapes.

export const box = (kind, x0, x1, z0, z1, y0, y1) => ({ kind, x0, x1, z0, z1, y0, y1 });

// The four walls of a rectangle (one block thick)
export function ring(kind, x0, x1, z0, z1, y0, y1) {
    return [
        box(kind, x0, x1, z0, z0, y0, y1),
        box(kind, x0, x1, z1, z1, y0, y1),
        box(kind, x0, x0, z0, z1, y0, y1),
        box(kind, x1, x1, z0, z1, y0, y1)
    ];
}

// Stairs: one column per step along (dx, dz), each 1 higher, from layer `from` up to `to`
export function stairs(kind, x, z, dx, dz, base, from, to) {
    const steps = [];
    for (let top = from, i = 0; top <= to; top++, i++) {
        steps.push(box(kind, x + dx * i, x + dx * i, z + dz * i, z + dz * i, base, top));
    }
    return steps;
}

// A hollow building: walls, a flat roof, and openings (doors / windows) carved out with air
export function house(kind, x0, x1, z0, z1, floor, wallTop, { roof = kind, openings = [] } = {}) {
    return [
        box(kind, x0, x1, z0, z1, floor + 1, wallTop),
        box(BLOCK_KIND.AIR, x0 + 1, x1 - 1, z0 + 1, z1 - 1, floor + 1, wallTop),
        ...openings.map(([ox0, ox1, oz0, oz1, oy0, oy1]) => box(BLOCK_KIND.AIR, ox0, ox1, oz0, oz1, oy0, oy1)),
        box(roof, x0, x1, z0, z1, wallTop + 1, wallTop + 1)
    ];
}

// Mirror a list of boxes across the map's x axis centre (x -> size - 1 - x)
export function mirrorX(boxes, size) {
    return boxes.map(b => ({ ...b, x0: size - 1 - b.x1, x1: size - 1 - b.x0 }));
}

// Mirror across the z axis centre (z -> size - 1 - z)
export function mirrorZ(boxes, size) {
    return boxes.map(b => ({ ...b, z0: size - 1 - b.z1, z1: size - 1 - b.z0 }));
}
