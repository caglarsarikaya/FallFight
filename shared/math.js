// Small vector helpers on plain {x, y, z} objects (shared code can't depend on three.js).

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// Forward direction for a yaw/pitch, matching a three.js camera (yaw 0 looks down -Z)
export function directionFromAngles(yaw, pitch) {
    const cp = Math.cos(pitch);
    return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

export function yawTowards(dx, dz) {
    return Math.atan2(-dx, -dz);
}

export function normalize(v) {
    const len = Math.hypot(v.x, v.y, v.z);
    return len > 1e-9 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 0, z: -1 };
}

export function distance2D(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

// Ray vs axis-aligned box. Returns the entry distance or null.
export function rayBox(origin, dir, min, max, maxDist) {
    let tmin = 0;
    let tmax = maxDist;
    for (const axis of ['x', 'y', 'z']) {
        const o = origin[axis];
        const d = dir[axis];
        if (Math.abs(d) < 1e-9) {
            if (o < min[axis] || o > max[axis]) return null;
            continue;
        }
        let t1 = (min[axis] - o) / d;
        let t2 = (max[axis] - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
    }
    return tmin;
}

// Deterministic PRNG for reproducible tests and simulations
export function createRng(seed = 1) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
