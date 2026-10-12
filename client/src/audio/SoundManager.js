// Synthesised sound effects (WebAudio, no asset files). Sounds with a position are attenuated by
// distance from the listener and panned left/right.

const HEARING_DISTANCE = 35;

// Each patch receives (sound manager, output node, pitch multiplier)
const PATCHES = {
    step: (s, out, p) => s.noise({ out, duration: 0.07, type: 'lowpass', freq: 380 * p, gain: 0.22 }),
    jump: (s, out) => s.noise({ out, duration: 0.09, type: 'bandpass', freq: 650, gain: 0.15 }),
    land: (s, out) => s.noise({ out, duration: 0.1, type: 'lowpass', freq: 300, gain: 0.3 }),
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
    bowDraw: (s, out) => s.tone({ out, type: 'sawtooth', freq: 70, freqEnd: 120, duration: 0.6, gain: 0.04 }),
    bowShoot: (s, out) => {
        s.tone({ out, type: 'triangle', freq: 240, freqEnd: 110, duration: 0.25, gain: 0.35 });
        s.noise({ out, duration: 0.1, type: 'highpass', freq: 2500, gain: 0.18 });
    },
    arrowStick: (s, out) => s.tone({ out, type: 'triangle', freq: 520, freqEnd: 180, duration: 0.07, gain: 0.25 }),
    arrowHit: (s, out) => {
        s.tone({ out, type: 'square', freq: 320, freqEnd: 90, duration: 0.08, gain: 0.25 });
        s.noise({ out, duration: 0.06, type: 'lowpass', freq: 2000, gain: 0.25 });
    },
    hurt: (s, out) => {
        s.tone({ out, type: 'square', freq: 440, freqEnd: 190, duration: 0.16, gain: 0.22 });
        s.tone({ out, type: 'square', freq: 330, freqEnd: 140, duration: 0.16, delay: 0.03, gain: 0.15 });
    },
    death: (s, out) => s.tone({ out, type: 'sawtooth', freq: 320, freqEnd: 50, duration: 0.8, gain: 0.25 }),
    kill: (s, out) => {
        [660, 880, 1320].forEach((f, i) => s.tone({ out, type: 'square', freq: f, duration: i === 2 ? 0.3 : 0.1, delay: i * 0.09, gain: 0.12 }));
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
    hitmarker: (s, out) => s.tone({ out, type: 'square', freq: 1900, duration: 0.035, gain: 0.08 }),
    click: (s, out) => s.tone({ out, type: 'square', freq: 900, duration: 0.04, gain: 0.08 })
};

export class SoundManager {
    constructor(volume = 0.7) {
        this.volume = volume;
        this.ctx = null;
        this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    }

    // Browsers only allow audio after a user gesture; call from click/key handlers
    unlock() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            this.ctx = new AudioContext();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.volume;
            const compressor = this.ctx.createDynamicsCompressor();
            this.master.connect(compressor);
            compressor.connect(this.ctx.destination);
            this.noiseBuffer = this.createNoiseBuffer();
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

    play(name, { at = null, volume = 1, pitch = 1 } = {}) {
        if (!this.ctx || this.ctx.state !== 'running' || !PATCHES[name]) return;
        const out = this.createOutput(at, volume);
        if (!out) return;
        PATCHES[name](this, out, pitch);
    }

    createOutput(at, volume) {
        const gain = this.ctx.createGain();
        let level = volume;
        let pan = 0;
        if (at) {
            const dx = at.x - this.listener.x;
            const dz = at.z - this.listener.z;
            const dist = Math.hypot(dx, at.y - this.listener.y, dz);
            level *= Math.pow(Math.max(0, 1 - dist / HEARING_DISTANCE), 1.5);
            if (level < 0.01) return null;
            // Right vector for the listener's yaw is (cos yaw, -sin yaw)
            const len = Math.hypot(dx, dz) || 1;
            pan = ((dx / len) * Math.cos(this.listener.yaw) - (dz / len) * Math.sin(this.listener.yaw)) * 0.8;
        }
        gain.gain.value = level;
        if (pan && this.ctx.createStereoPanner) {
            const panner = this.ctx.createStereoPanner();
            panner.pan.value = pan;
            gain.connect(panner);
            panner.connect(this.master);
        } else {
            gain.connect(this.master);
        }
        setTimeout(() => gain.disconnect(), 2500);
        return gain;
    }

    createNoiseBuffer() {
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        return buffer;
    }

    tone({ out, type = 'sine', freq, freqEnd = freq, duration, delay = 0, gain = 0.2 }) {
        const t = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + duration);
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, duration / 4));
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
