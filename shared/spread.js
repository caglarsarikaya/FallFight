import { PLAYER } from './constants.js';

// Bullet spread and recoil, shared so the shooter's client can predict exactly where its bullets
// land (tracers, impact marks) while the server stays the judge of hits.

// Cone half-angle (radians) for the next shot.
// state: { speed, onGround, crouching, scoped, heat } where heat counts recent shots (decays)
export function inaccuracy(spec, { speed = 0, onGround = true, crouching = false, scoped = false, heat = 0 }) {
    const s = spec.spread;
    const moving = Math.max(0, Math.min(1, (speed - 0.6) / (PLAYER.walkSpeed * 0.75)));
    if (spec.scope) {
        // Snipers are only accurate scoped and standing still
        if (!onGround) return s.air;
        if (!scoped) return s.stand + moving * s.move;
        return spec.scope.spread + moving * spec.scope.moveSpread;
    }
    let cone = crouching && onGround ? s.crouch : s.stand;
    cone += moving * s.move;
    if (!onGround) cone += s.air;
    cone += Math.min(s.maxShot, heat * s.perShot);
    return cone;
}

// Heat after the time since the last shot, then +1 for the shot being fired
export function heatAfter(spec, heat, sinceLastShot) {
    return Math.max(0, heat - sinceLastShot * spec.spread.recover) + 1;
}

// Small hash so every (player, shot) pair gets its own repeatable random stream
export function shotSeed(playerId, seq) {
    let h = 2166136261;
    const id = String(playerId);
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return (h ^ Math.imul(seq | 0, 2654435761)) >>> 0;
}

function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Directions of every pellet for one shot: aim dir (unit) jittered inside the cone.
// Writes into `out` (array of {x,y,z}, grown as needed) and returns it.
export function pelletDirections(dir, cone, pellets, seed, out = []) {
    const rand = seededRandom(seed);
    // Orthonormal basis around dir
    let rx = -dir.z;
    let rz = dir.x;
    let rl = Math.hypot(rx, rz);
    if (rl < 1e-6) {
        rx = 1;
        rz = 0;
        rl = 1;
    }
    rx /= rl;
    rz /= rl;
    // up = right x dir
    const ux = -rz * dir.y;
    const uy = rz * dir.x - rx * dir.z;
    const uz = rx * dir.y;
    for (let i = 0; i < pellets; i++) {
        // Centre-weighted like CS: most shots near the middle, a few at the edge
        const r = Math.tan(cone * (rand() + rand()) * 0.5);
        const a = rand() * Math.PI * 2;
        const ox = Math.cos(a) * r;
        const oy = Math.sin(a) * r;
        const x = dir.x + rx * ox + ux * oy;
        const y = dir.y + uy * oy;
        const z = dir.z + rz * ox + uz * oy;
        const len = Math.hypot(x, y, z);
        const d = out[i] || (out[i] = { x: 0, y: 0, z: 0 });
        d.x = x / len;
        d.y = y / len;
        d.z = z / len;
    }
    out.length = pellets;
    return out;
}

// View kick for the n-th shot of a spray (n from 1), in degrees: { pitch, yaw }.
// A fixed pattern per gun, so sprays can be learnt: straight up first, then swaying sideways.
export function recoilKick(spec, n) {
    const r = spec.recoil;
    const climb = n <= 8 ? 1 : 0.35;
    const sway = n >= r.sideFrom ? Math.sin(n * 0.55 + spec.damage) * r.side : 0;
    return { pitch: r.up * climb, yaw: sway };
}
