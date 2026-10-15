// Recorded sound samples, listed in client/assets/sfx/manifest.json as
//   { "shot_ak47": ["ak47_1.ogg", "ak47_2.ogg"], "hitFlesh": "flesh.ogg", ... }
// Several files for one name are picked at random so repeats don't sound robotic.
// Any name without a sample falls back to its synthesised patch, so the manifest can start
// empty and fill up over time. Missing or broken files are skipped silently.
const BASE = new URL('../../assets/sfx/', import.meta.url);

export class SampleBank {
    constructor(ctx) {
        this.ctx = ctx;
        this.buffers = new Map(); // name -> [AudioBuffer]
    }

    async load() {
        let manifest;
        try {
            const response = await fetch(new URL('manifest.json', BASE));
            if (!response.ok) return;
            manifest = await response.json();
        } catch {
            return;
        }
        const jobs = [];
        for (const [name, files] of Object.entries(manifest)) {
            if (name.startsWith('_')) continue; // comments
            for (const file of [].concat(files)) jobs.push(this.loadOne(name, file));
        }
        await Promise.all(jobs);
    }

    async loadOne(name, file) {
        try {
            const response = await fetch(new URL(file, BASE));
            if (!response.ok) return;
            const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
            if (!this.buffers.has(name)) this.buffers.set(name, []);
            this.buffers.get(name).push(buffer);
        } catch {
            // Unsupported or corrupt file: keep the synthesised fallback
        }
    }

    has(name) {
        return this.buffers.has(name);
    }

    pick(name) {
        const list = this.buffers.get(name);
        return list ? list[Math.floor(Math.random() * list.length)] : null;
    }
}
