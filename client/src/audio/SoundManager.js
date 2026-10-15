import { GUN_PATCHES } from './GunSounds.js';
import { SampleBank } from './SampleBank.js';

// Sound effects: recorded samples when installed (see SampleBank), synthesised WebAudio patches
// otherwise. Positional sounds fade with distance, get duller far away (low-pass), pan
// left/right, and send some signal to a shared reverb so shots echo around the arena.

const HEARING_DISTANCE = 35;       // default audible range in blocks
const MAX_VOICES = 48;             // hard cap on overlapping sounds
const RETRIGGER_MS = 12;           // the same sound can't restart faster than this
const PITCH_JITTER = 0.04;         // +-4% so repeated shots don't sound robotic

// Each patch receives (sound manager, output node, pitch multiplier)
const PATCHES = {
    step: (s, out, p) => s.noise({ out, duration: 0.07, type: 'lowpass', freq: 380 * p, gain: 0.22 }),
    stepStone: (s, out, p) => {
        s.noise({ out, duration: 0.05, type: 'bandpass', freq: 1500 * p, q: 1.5, gain: 0.25 });
        s.noise({ out, duration: 0.06, type: 'lowpass', freq: 400, gain: 0.2 });
    },
    stepWood: (s, out, p) => {
        s.noise({ out, duration: 0.06, type: 'lowpass', freq: 900 * p, gain: 0.28 });
        s.tone({ out, type: 'triangle', freq: 210 * p, freqEnd: 120, duration: 0.05, gain: 0.12 });
    },
    stepSnow: (s, out, p) => {
        // Crunchy: a few tiny crackles
        for (let i = 0; i < 3; i++) s.noise({ out, delay: i * 0.018, duration: 0.03, type: 'bandpass', freq: (1300 + i * 400) * p, q: 2, gain: 0.18 });
    },
    stepSand: (s, out, p) => s.noise({ out, duration: 0.1, type: 'bandpass', freq: 2200 * p, freqEnd: 1200, q: 0.8, gain: 0.16 }),
    stepIce: (s, out, p) => {
        s.noise({ out, duration: 0.03, type: 'highpass', freq: 3000 * p, gain: 0.16 });
        s.tone({ out, type: 'sine', freq: 1800 * p, duration: 0.03, gain: 0.03 });
    },
    swim: (s, out, p) => s.noise({ out, duration: 0.25, type: 'lowpass', freq: 900 * p, freqEnd: 300, gain: 0.18 }),
    splash: (s, out) => {
        s.noise({ out, duration: 0.45, type: 'lowpass', freq: 2500, freqEnd: 300, gain: 0.5 });
        s.noise({ out, delay: 0.05, duration: 0.3, type: 'bandpass', freq: 1500, q: 1, gain: 0.25 });
    },
    jump: (s, out) => s.noise({ out, duration: 0.09, type: 'bandpass', freq: 650, gain: 0.15 }),
    land: (s, out) => {
        s.noise({ out, duration: 0.1, type: 'lowpass', freq: 300, gain: 0.35 });
        s.tone({ out, type: 'sine', freq: 90, freqEnd: 45, duration: 0.08, gain: 0.25 });
    },
    swing: (s, out, p) => s.noise({ out, duration: 0.18, type: 'bandpass', freq: 700 * p, freqEnd: 2600 * p, q: 1.5, gain: 0.3 }),
    hit: (s, out) => {
        s.tone({ out, type: 'square', freq: 150, freqEnd: 55, duration: 0.12, gain: 0.3 });
        s.noise({ out, duration: 0.08, type: 'lowpass', freq: 1400, gain: 0.35 });
    },
    crack: (s, out) => {
        for (let i = 0; i < 3; i++) s.noise({ out, delay: i * 0.08, duration: 0.05, type: 'bandpass', freq: 1500 + i * 300, q: 3, gain: 0.3 });
    },
    break: (s, out) => {
        s.noise({ out, duration: 0.32, type: 'lowpass', freq: 1000, freqEnd: 180, gain: 0.5 });
        s.tone({ out, type: 'triangle', freq: 110, freqEnd: 40, duration: 0.22, gain: 0.3 });
    },
    restore: (s, out) => s.tone({ out, type: 'sine', freq: 300, freqEnd: 520, duration: 0.15, gain: 0.08 }),
    hurt: (s, out) => {
        s.noise({ out, duration: 0.12, type: 'lowpass', freq: 700, freqEnd: 200, gain: 0.45 });
        s.tone({ out, type: 'sine', freq: 140, freqEnd: 60, duration: 0.12, gain: 0.35 });
    },
    death: (s, out) => {
        s.noise({ out, duration: 0.35, type: 'lowpass', freq: 600, freqEnd: 100, gain: 0.5 });
        s.tone({ out, type: 'sine', freq: 110, freqEnd: 35, duration: 0.4, gain: 0.4 });
    },
    kill: (s, out) => {
        s.tone({ out, type: 'square', freq: 880, duration: 0.06, gain: 0.07 });
        s.tone({ out, type: 'square', freq: 1320, duration: 0.12, delay: 0.06, gain: 0.07 });
    },
    pickup: (s, out) => {
        s.tone({ out, type: 'square', freq: 784, duration: 0.07, gain: 0.12 });
        s.tone({ out, type: 'square', freq: 1175, duration: 0.14, delay: 0.07, gain: 0.12 });
    },
    spawnPickup: (s, out) => s.tone({ out, type: 'sine', freq: 880, freqEnd: 1320, duration: 0.18, gain: 0.15 }),
    drink: (s, out) => {
        for (let i = 0; i < 3; i++) s.tone({ out, type: 'sine', freq: 320, freqEnd: 190, duration: 0.09, delay: i * 0.16, gain: 0.3 });
    },
    heal: (s, out) => {
        s.tone({ out, type: 'sine', freq: 523, freqEnd: 1046, duration: 0.4, gain: 0.15 });
        s.tone({ out, type: 'triangle', freq: 784, duration: 0.3, delay: 0.1, gain: 0.1 });
    },
    respawn: (s, out) => s.tone({ out, type: 'sine', freq: 220, freqEnd: 880, duration: 0.5, gain: 0.18 }),
    select: (s, out) => s.tone({ out, type: 'square', freq: 1200, duration: 0.03, gain: 0.05 }),
    empty: (s, out) => s.tone({ out, type: 'square', freq: 180, duration: 0.06, gain: 0.1 }),
    hitmarker: (s, out) => s.tone({ out, type: 'square', freq: 1900, duration: 0.03, gain: 0.05 }),
    // One-shot headshot: a dull thump, then a fading ear ring (two close sines beat against each other)
    tinnitus: (s, out) => {
        s.noise({ out, duration: 0.25, type: 'lowpass', freq: 400, freqEnd: 80, gain: 0.5 });
        s.tone({ out, type: 'sine', freq: 6800, duration: 2.2, gain: 0.05 });
        s.tone({ out, type: 'sine', freq: 6860, duration: 2.2, gain: 0.05 });
    },
    click: (s, out) => s.tone({ out, type: 'square', freq: 900, duration: 0.04, gain: 0.08 }),
    levelUp: (s, out) => {
        [523, 659, 784, 1046].forEach((f, i) => s.tone({ out, type: 'square', freq: f, duration: 0.09, delay: i * 0.07, gain: 0.08 }));
    },
    win: (s, out) => {
        [523, 659, 784, 1046, 1318].forEach((f, i) => s.tone({ out, type: 'triangle', freq: f, duration: i === 4 ? 0.6 : 0.14, delay: i * 0.12, gain: 0.16 }));
    },
    lose: (s, out) => {
        [392, 330, 262, 196].forEach((f, i) => s.tone({ out, type: 'triangle', freq: f, duration: i === 3 ? 0.6 : 0.18, delay: i * 0.16, gain: 0.14 }));
    },
    ...GUN_PATCHES
};

export class SoundManager {
    constructor(volume = 0.7) {
        this.volume = volume;
        this.ctx = null;
        this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
        this.voices = 0;
        this.lastPlayed = new Map();
    }

    // Browsers only allow audio after a user gesture; call from click/key handlers
    unlock() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            this.ctx = new AudioContext();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.volume;
            // Gunfire is loud: a fast compressor keeps sprays punchy without clipping
            const compressor = this.ctx.createDynamicsCompressor();
            compressor.threshold.value = -14;
            compressor.knee.value = 8;
            compressor.ratio.value = 6;
            compressor.attack.value = 0.002;
            compressor.release.value = 0.12;
            this.master.connect(compressor);
            compressor.connect(this.ctx.destination);
            this.noiseBuffer = this.createNoiseBuffer();
            this.reverb = this.createReverb();
            this.samples = new SampleBank(this.ctx);
            this.samples.load();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    setVolume(volume) {
        this.volume = volume;
        if (this.master) this.master.gain.value = volume;
    }

    setListener(x, y, z, yaw) {
        Object.assign(this.listener, { x, y, z, yaw });
    }

    has(name) {
        return !!PATCHES[name] || !!this.samples?.has(name);
    }

    // options: { at: {x,y,z} for positional sounds, volume, pitch, range (blocks), reverb (0..1) }
    play(name, { at = null, volume = 1, pitch = 1, range = HEARING_DISTANCE, reverb = 0.15 } = {}) {
        if (!this.ctx || this.ctx.state !== 'running' || this.voices >= MAX_VOICES) return;
        const sample = this.samples.has(name);
        if (!sample && !PATCHES[name]) return;
        const now = performance.now();
        const key = at ? `${name}@${Math.round(at.x)},${Math.round(at.z)}` : name;
        if (now - (this.lastPlayed.get(key) || 0) < RETRIGGER_MS) return;
        this.lastPlayed.set(key, now);

        const out = this.createOutput(at, volume, range, reverb);
        if (!out) return;
        const p = pitch * (1 + (Math.random() * 2 - 1) * PITCH_JITTER);
        if (sample) this.playBuffer(this.samples.pick(name), out, p);
        else PATCHES[name](this, out, p);
        this.voices++;
        setTimeout(() => this.voices--, 1200);
    }

    // Gunshot with a distant variant past 35% of its range (as heard from far away)
    playShot(weaponId, at, { self = false } = {}) {
        const range = 160;
        const d = at ? this.distanceTo(at) : 0;
        const far = !self && d > range * 0.3;
        const name = `shot_${weaponId}${far ? '_far' : ''}`;
        this.play(name, { at: self ? null : at, range, volume: self ? 0.9 : 1, reverb: self ? 0.18 : 0.3 + Math.min(0.5, d / range) });
    }

    distanceTo(at) {
        const l = this.listener;
        return Math.hypot(at.x - l.x, at.y - l.y, at.z - l.z);
    }

    createOutput(at, volume, range, reverb) {
        const ctx = this.ctx;
        const gain = ctx.createGain();
        let level = volume;
        let pan = 0;
        let muffle = 1;
        if (at) {
            const dx = at.x - this.listener.x;
            const dz = at.z - this.listener.z;
            const dist = Math.hypot(dx, at.y - this.listener.y, dz);
            const near = Math.max(0, 1 - dist / range);
            level *= Math.pow(near, 1.6);
            if (level < 0.01) return null;
            muffle = near;
            // Right vector for the listener's yaw is (cos yaw, -sin yaw)
            const len = Math.hypot(dx, dz) || 1;
            pan = ((dx / len) * Math.cos(this.listener.yaw) - (dz / len) * Math.sin(this.listener.yaw)) * 0.8 * Math.min(1, dist / 3);
        }
        gain.gain.value = level;

        let tail = gain;
        if (muffle < 0.9) {
            // Air soaks up the highs over distance
            const lowpass = ctx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = 500 + 17000 * muffle * muffle;
            tail.connect(lowpass);
            tail = lowpass;
        }
        if (pan && ctx.createStereoPanner) {
            const panner = ctx.createStereoPanner();
            panner.pan.value = pan;
            tail.connect(panner);
            tail = panner;
        }
        tail.connect(this.master);
        if (reverb > 0 && this.reverb) {
            const send = ctx.createGain();
            send.gain.value = reverb;
            tail.connect(send);
            send.connect(this.reverb);
            setTimeout(() => send.disconnect(), 3000);
        }
        setTimeout(() => gain.disconnect(), 3000);
        return gain;
    }

    playBuffer(buffer, out, pitch) {
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = pitch;
        src.connect(out);
        src.start();
    }

    createNoiseBuffer() {
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        return buffer;
    }

    // One shared convolution reverb: a short, dark outdoor slap with a decaying tail
    createReverb() {
        const ctx = this.ctx;
        const seconds = 1.3;
        const length = Math.floor(ctx.sampleRate * seconds);
        const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const data = impulse.getChannelData(c);
            let smooth = 0;
            for (let i = 0; i < length; i++) {
                const t = i / ctx.sampleRate;
                smooth += (Math.random() * 2 - 1 - smooth) * 0.35; // darken the noise
                const early = t > 0.03 && t < 0.09 ? 1.6 : 1;     // early reflections off walls
                data[i] = smooth * early * Math.pow(1 - t / seconds, 3);
            }
        }
        const convolver = ctx.createConvolver();
        convolver.buffer = impulse;
        const wet = ctx.createGain();
        wet.gain.value = 0.55;
        convolver.connect(wet);
        wet.connect(this.master);
        return convolver;
    }

    tone({ out, type = 'sine', freq, freqEnd = freq, duration, delay = 0, gain = 0.2 }) {
        const t = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + duration);
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.004, duration / 4));
        env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.connect(env);
        env.connect(out);
        osc.start(t);
        osc.stop(t + duration + 0.02);
    }

    noise({ out, duration, delay = 0, type = 'lowpass', freq = 1000, freqEnd = freq, q = 1, gain = 0.2 }) {
        const t = this.ctx.currentTime + delay;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = type;
        filter.Q.value = q;
        filter.frequency.setValueAtTime(freq, t);
        filter.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + duration);
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(gain, t);
        env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        src.connect(filter);
        filter.connect(env);
        env.connect(out);
        src.start(t, Math.random() * 0.5);
        src.stop(t + duration + 0.02);
    }
}
