// Gun sights (no magnified scopes, those belong to the snipers). A gun opts in by listing the
// optics it accepts in its spec (shared/config/weapons.js): `sights: ['reddot', 'reflex', 'holo']`.
// Any gun with a `sights` list (even an empty one) can aim down its iron sights for free; the
// optics are bought in the shop (B 9) and stay on the gun until it's replaced or you die.
//   zoom   fov divisor while aiming (1 = none)
export const SIGHTS = Object.freeze({
    iron: { id: 'iron', name: 'Iron Sights', price: 0, zoom: 1.1 },
    reddot: { id: 'reddot', name: 'Red Dot', price: 300, zoom: 1.15 },
    reflex: { id: 'reflex', name: 'Reflex Sight', price: 350, zoom: 1.15 },
    holo: { id: 'holo', name: 'Holographic', price: 400, zoom: 1.2 }
});

export const OPTIC_IDS = Object.freeze(Object.keys(SIGHTS).filter(id => id !== 'iron'));

// Aiming down sights: tighter spread (standing and moving), slower feet
export const ADS = Object.freeze({ spreadMul: 0.55, moveSpreadMul: 0.7, speedMul: 0.85, enterTime: 0.16 });

export function hasSights(spec) {
    return Array.isArray(spec?.sights);
}

// The optics this gun accepts (not counting the iron sights)
export function sightsFor(spec) {
    return hasSights(spec) ? spec.sights : [];
}

export function canMount(spec, sightId) {
    return sightId === 'iron' ? hasSights(spec) : sightsFor(spec).includes(sightId);
}

export function sightSpec(id) {
    return SIGHTS[id] || SIGHTS.iron;
}
