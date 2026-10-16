// Synthesised weapon sounds, used whenever no recorded sample is installed for a sound name
// (see client/assets/sfx/manifest.json). A gunshot is layered like a real recording:
//   crack  the supersonic snap (very short, bright noise)
//   body   the muzzle blast (filtered noise sweeping down)
//   boom   the low thump you feel in the chest (pitched-down sine)
//   tail   the echo off the surroundings (long, dark noise)
// Far away, the crack and most of the body are gone: a muffled thump and a long rolling tail.
// Our own shots (shot_<gun>_self) add what you only hear holding the gun: a sharper snap, a second
// body layer, a deeper sub thump and the action cycling (bolt or slide clack) right after.

const SHOTS = {
    glock: { crack: 4400, body: 2600, bodyLen: 0.08, boom: 160, boomLen: 0.07, tail: 0.35, gain: 0.55, action: 0.045 },
    usp: { crack: 3600, body: 1900, bodyLen: 0.1, boom: 125, boomLen: 0.1, tail: 0.4, gain: 0.6, action: 0.05 },
    deagle: { crack: 3400, body: 1500, bodyLen: 0.2, boom: 85, boomLen: 0.24, tail: 0.95, gain: 0.85, action: 0.06 },
    mp5: { crack: 5200, body: 2700, bodyLen: 0.065, boom: 165, boomLen: 0.06, tail: 0.3, gain: 0.5, action: 0.035 },
    p90: { crack: 5600, body: 3000, bodyLen: 0.06, boom: 175, boomLen: 0.05, tail: 0.28, gain: 0.48, action: 0.03 },
    m3: { crack: 2600, body: 1000, bodyLen: 0.3, boom: 70, boomLen: 0.3, tail: 1.1, gain: 0.95 },
    ak47: { crack: 3800, body: 1700, bodyLen: 0.14, boom: 100, boomLen: 0.16, tail: 0.8, gain: 0.75, action: 0.04 },
    m4a1: { crack: 4600, body: 2200, bodyLen: 0.11, boom: 118, boomLen: 0.12, tail: 0.6, gain: 0.68, action: 0.035 },
    scout: { crack: 5000, body: 2000, bodyLen: 0.15, boom: 105, boomLen: 0.16, tail: 1.0, gain: 0.8 },
    m249: { crack: 3500, body: 1500, bodyLen: 0.15, boom: 92, boomLen: 0.17, tail: 0.85, gain: 0.78, action: 0.04 },
    awp: { crack: 3000, body: 1150, bodyLen: 0.36, boom: 58, boomLen: 0.42, tail: 1.6, gain: 1.0 }
};

function gunshot(s, out, p, spec, far, self = false) {
    const g = spec.gain;
    if (self) {
        s.noise({ out, duration: 0.008, type: 'highpass', freq: 8000, gain: 0.7 * g });
        s.noise({ out, duration: spec.bodyLen * 0.7, type: 'bandpass', freq: spec.body * 1.4 * p, freqEnd: 600, q: 0.7, gain: 0.45 * g });
        s.tone({ out, type: 'sine', freq: spec.boom * 0.9 * p, freqEnd: 28, duration: spec.boomLen * 1.8, gain: 0.75 * g });
        if (spec.action) click(s, out, { delay: spec.action, freq: 2300 * p, gain: 0.22, q: 4 });
    }
    if (!far) {
        s.noise({ out, duration: 0.03, type: 'bandpass', freq: spec.crack * p, q: 0.8, gain: 1.1 * g });
        s.noise({ out, duration: 0.012, type: 'highpass', freq: 6000, gain: 0.6 * g });
        s.noise({ out, duration: spec.bodyLen, type: 'lowpass', freq: spec.body * p, freqEnd: 280, gain: 0.95 * g });
        s.tone({ out, type: 'sine', freq: spec.boom * 1.8 * p, freqEnd: spec.boom * 0.45, duration: spec.boomLen, gain: 0.9 * g });
        s.tone({ out, type: 'triangle', freq: spec.boom * p, freqEnd: 35, duration: spec.boomLen * 1.4, gain: 0.5 * g });
        s.noise({ out, delay: 0.02, duration: spec.tail, type: 'lowpass', freq: 900, freqEnd: 160, gain: 0.22 * g });
    } else {
        s.noise({ out, duration: spec.bodyLen * 1.5, type: 'lowpass', freq: 700, freqEnd: 120, gain: 0.9 * g });
        s.tone({ out, type: 'sine', freq: spec.boom * 1.2, freqEnd: 30, duration: spec.boomLen * 1.6, gain: 0.6 * g });
        s.noise({ out, delay: 0.05, duration: spec.tail * 1.8, type: 'lowpass', freq: 420, freqEnd: 90, gain: 0.35 * g });
    }
}

const click = (s, out, { delay = 0, freq = 2200, gain = 0.35, q = 6 } = {}) => {
    s.noise({ out, delay, duration: 0.018, type: 'bandpass', freq, q, gain });
    s.tone({ out, delay, type: 'square', freq: freq * 0.45, freqEnd: freq * 0.3, duration: 0.012, gain: gain * 0.4 });
};

export const GUN_PATCHES = {
    // Mechanical
    dryfire: (s, out) => click(s, out, { freq: 1900, gain: 0.45 }),
    clipout: (s, out, p) => {
        click(s, out, { freq: 1600 * p, gain: 0.4 });
        s.noise({ out, delay: 0.03, duration: 0.09, type: 'bandpass', freq: 1300 * p, freqEnd: 900, q: 2, gain: 0.25 });
    },
    clipin: (s, out, p) => {
        s.noise({ out, duration: 0.06, type: 'lowpass', freq: 900 * p, freqEnd: 300, gain: 0.55 });
        click(s, out, { delay: 0.05, freq: 2600 * p, gain: 0.45 });
    },
    boltpull: (s, out, p) => {
        s.noise({ out, duration: 0.12, type: 'bandpass', freq: 1100 * p, freqEnd: 2800 * p, q: 3, gain: 0.3 });
        click(s, out, { delay: 0.12, freq: 3000 * p, gain: 0.4 });
        s.noise({ out, delay: 0.2, duration: 0.08, type: 'bandpass', freq: 2600 * p, freqEnd: 1300, q: 3, gain: 0.25 });
        click(s, out, { delay: 0.28, freq: 2000 * p, gain: 0.45 });
    },
    shell: (s, out, p) => {
        s.tone({ out, type: 'sine', freq: 4200 * p, duration: 0.05, gain: 0.04 });
        s.tone({ out, delay: 0.09, type: 'sine', freq: 3600 * p, duration: 0.04, gain: 0.025 });
    },
    shellIn: (s, out, p) => {
        click(s, out, { freq: 1500 * p, gain: 0.35 });
        s.noise({ out, delay: 0.02, duration: 0.05, type: 'lowpass', freq: 700, gain: 0.3 });
    },
    pump: (s, out) => {
        s.noise({ out, duration: 0.1, type: 'bandpass', freq: 900, freqEnd: 1600, q: 2, gain: 0.4 });
        click(s, out, { delay: 0.11, freq: 1700, gain: 0.5 });
        s.noise({ out, delay: 0.16, duration: 0.09, type: 'bandpass', freq: 1500, freqEnd: 800, q: 2, gain: 0.35 });
        click(s, out, { delay: 0.26, freq: 1400, gain: 0.5 });
    },
    deploy: (s, out, p) => {
        s.noise({ out, duration: 0.14, type: 'bandpass', freq: 800 * p, freqEnd: 1400 * p, q: 1.2, gain: 0.18 });
        click(s, out, { delay: 0.12, freq: 2400 * p, gain: 0.3 });
    },
    zoom: (s, out, p) => click(s, out, { freq: 3200 * p, gain: 0.18, q: 10 }),

    // Knife
    knifeSlash: (s, out, p) => s.noise({ out, duration: 0.16, type: 'bandpass', freq: 1400 * p, freqEnd: 4200 * p, q: 1.6, gain: 0.35 }),
    knifeStab: (s, out, p) => s.noise({ out, duration: 0.22, type: 'bandpass', freq: 900 * p, freqEnd: 2600 * p, q: 1.4, gain: 0.4 }),
    knifeHit: (s, out) => {
        s.noise({ out, duration: 0.1, type: 'lowpass', freq: 650, freqEnd: 180, gain: 0.7 });
        s.noise({ out, duration: 0.05, type: 'bandpass', freq: 1700, q: 2, gain: 0.35 });
        s.tone({ out, type: 'sine', freq: 140, freqEnd: 60, duration: 0.09, gain: 0.4 });
    },
    knifeWall: (s, out) => {
        s.tone({ out, type: 'sine', freq: 3300, freqEnd: 3100, duration: 0.18, gain: 0.12 });
        s.tone({ out, type: 'sine', freq: 5100, duration: 0.1, gain: 0.06 });
        click(s, out, { freq: 2600, gain: 0.4 });
    },

    // Bullets landing
    hitFlesh: (s, out, p) => {
        s.noise({ out, duration: 0.08, type: 'lowpass', freq: 1000 * p, freqEnd: 220, gain: 0.8 });
        s.tone({ out, type: 'sine', freq: 190 * p, freqEnd: 65, duration: 0.08, gain: 0.5 });
        s.noise({ out, duration: 0.03, type: 'bandpass', freq: 2200, q: 1.5, gain: 0.3 });
    },
    hitKevlar: (s, out, p) => {
        s.noise({ out, duration: 0.07, type: 'lowpass', freq: 700 * p, freqEnd: 200, gain: 0.75 });
        s.noise({ out, duration: 0.02, type: 'bandpass', freq: 2800, q: 4, gain: 0.45 });
        s.tone({ out, type: 'sine', freq: 160, freqEnd: 70, duration: 0.07, gain: 0.45 });
    },
    // The famous helmet "dink"
    headshotHelmet: (s, out, p) => {
        s.tone({ out, type: 'sine', freq: 2350 * p, freqEnd: 2250 * p, duration: 0.32, gain: 0.32 });
        s.tone({ out, type: 'sine', freq: 3720 * p, freqEnd: 3600 * p, duration: 0.2, gain: 0.18 });
        s.tone({ out, type: 'sine', freq: 5400 * p, duration: 0.08, gain: 0.08 });
        s.noise({ out, duration: 0.02, type: 'highpass', freq: 4000, gain: 0.5 });
    },
    headshotFlesh: (s, out, p) => {
        s.noise({ out, duration: 0.14, type: 'bandpass', freq: 1300 * p, freqEnd: 400, q: 1.2, gain: 0.8 });
        s.noise({ out, duration: 0.06, type: 'lowpass', freq: 500, gain: 0.6 });
        s.tone({ out, type: 'sine', freq: 120, freqEnd: 50, duration: 0.1, gain: 0.45 });
    },
    impactStone: (s, out, p) => {
        s.noise({ out, duration: 0.04, type: 'bandpass', freq: 3200 * p, q: 1.5, gain: 0.5 });
        s.noise({ out, duration: 0.09, type: 'lowpass', freq: 1500, freqEnd: 300, gain: 0.3 });
        // Occasional ricochet whine
        if (Math.random() < 0.25) s.tone({ out, delay: 0.02, type: 'sine', freq: 3800 * p, freqEnd: 1400, duration: 0.28, gain: 0.07 });
    },
    impactWood: (s, out, p) => {
        s.noise({ out, duration: 0.06, type: 'lowpass', freq: 1400 * p, freqEnd: 400, gain: 0.55 });
        s.tone({ out, type: 'triangle', freq: 340 * p, freqEnd: 160, duration: 0.06, gain: 0.3 });
    },
    impactDirt: (s, out, p) => {
        s.noise({ out, duration: 0.08, type: 'lowpass', freq: 650 * p, freqEnd: 150, gain: 0.55 });
        s.noise({ out, duration: 0.05, type: 'bandpass', freq: 1800, q: 1, gain: 0.15 });
    },
    // A bullet passing close to your head: supersonic snap and a whizz
    whiz: (s, out, p) => {
        s.noise({ out, duration: 0.02, type: 'highpass', freq: 5000, gain: 0.5 });
        s.noise({ out, duration: 0.16, type: 'bandpass', freq: 4200 * p, freqEnd: 1300, q: 3, gain: 0.4 });
    },
    heartbeat: (s, out) => {
        s.tone({ out, type: 'sine', freq: 62, freqEnd: 40, duration: 0.13, gain: 0.55 });
        s.tone({ out, delay: 0.2, type: 'sine', freq: 55, freqEnd: 38, duration: 0.12, gain: 0.38 });
    },
    armorUp: (s, out) => {
        s.noise({ out, duration: 0.18, type: 'bandpass', freq: 700, freqEnd: 1200, q: 1, gain: 0.3 });
        click(s, out, { delay: 0.15, freq: 1800, gain: 0.35 });
    },
    ammoPickup: (s, out) => {
        click(s, out, { freq: 1800, gain: 0.35 });
        click(s, out, { delay: 0.07, freq: 2300, gain: 0.3 });
        s.noise({ out, delay: 0.1, duration: 0.07, type: 'lowpass', freq: 800, gain: 0.3 });
    },

    // RPG: a launch thump and the rocket motor's whoosh, then the blast where it lands
    shot_rpg: (s, out, p) => {
        s.tone({ out, type: 'sine', freq: 140 * p, freqEnd: 40, duration: 0.25, gain: 0.9 });
        s.noise({ out, duration: 0.12, type: 'lowpass', freq: 2400 * p, freqEnd: 400, gain: 0.9 });
        s.noise({ out, delay: 0.04, duration: 0.7, type: 'bandpass', freq: 500 * p, freqEnd: 2600 * p, q: 1.2, gain: 0.45 });
        s.noise({ out, delay: 0.1, duration: 1.0, type: 'lowpass', freq: 700, freqEnd: 120, gain: 0.25 });
    },
    shot_rpg_far: (s, out) => {
        s.tone({ out, type: 'sine', freq: 90, freqEnd: 35, duration: 0.3, gain: 0.6 });
        s.noise({ out, delay: 0.05, duration: 0.9, type: 'bandpass', freq: 400, freqEnd: 1200, q: 1, gain: 0.3 });
    },
    explosion: (s, out, p) => {
        s.noise({ out, duration: 0.08, type: 'highpass', freq: 2500, gain: 0.8 });
        s.noise({ out, duration: 0.6, type: 'lowpass', freq: 3200 * p, freqEnd: 180, gain: 1.3 });
        s.tone({ out, type: 'sine', freq: 85 * p, freqEnd: 28, duration: 0.9, gain: 1.1 });
        s.tone({ out, type: 'triangle', freq: 48 * p, freqEnd: 22, duration: 1.3, gain: 0.7 });
        s.noise({ out, delay: 0.08, duration: 2.2, type: 'lowpass', freq: 650, freqEnd: 70, gain: 0.5 });
    },
    // Grenades: the pin coming out, the throw, a clink on every bounce, the hiss of a smoke going off
    pin: (s, out, p) => {
        click(s, out, { freq: 3400 * p, gain: 0.3, q: 9 });
        s.tone({ out, delay: 0.02, type: 'sine', freq: 5200 * p, freqEnd: 4600, duration: 0.08, gain: 0.05 });
    },
    throw: (s, out, p) => s.noise({ out, duration: 0.22, type: 'bandpass', freq: 600 * p, freqEnd: 1800 * p, q: 1.2, gain: 0.3 }),
    grenadeBounce: (s, out, p) => {
        click(s, out, { freq: 1300 * p, gain: 0.4, q: 4 });
        s.tone({ out, type: 'triangle', freq: 900 * p, freqEnd: 600, duration: 0.05, gain: 0.08 });
    },
    smokePop: (s, out, p) => {
        click(s, out, { freq: 1500 * p, gain: 0.4 });
        s.noise({ out, delay: 0.03, duration: 2.4, type: 'highpass', freq: 2600 * p, freqEnd: 1400, gain: 0.32 });
        s.noise({ out, delay: 0.03, duration: 1.8, type: 'lowpass', freq: 900, freqEnd: 300, gain: 0.2 });
    },
    // The RPG appeared somewhere: a rising two-tone alarm everyone hears
    rpgSpawn: (s, out) => {
        for (let i = 0; i < 3; i++) {
            s.tone({ out, type: 'sawtooth', freq: 520, freqEnd: 880, delay: i * 0.32, duration: 0.28, gain: 0.07 });
        }
    }
};

// shot_<weapon> and shot_<weapon>_far for every gun
for (const [id, spec] of Object.entries(SHOTS)) {
    GUN_PATCHES[`shot_${id}`] = (s, out, p) => gunshot(s, out, p, spec, false);
    GUN_PATCHES[`shot_${id}_far`] = (s, out, p) => gunshot(s, out, p, spec, true);
    GUN_PATCHES[`shot_${id}_self`] = (s, out, p) => gunshot(s, out, p, spec, false, true);
}
