import * as THREE from 'three';
import { createRng } from '../../shared/math.js';

const SIZE = 16;

// 16x16 canvas texture with crisp pixels, Minecraft style
export function pixelTexture(draw, size = SIZE) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    draw(ctx, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapLinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function shade(hex, amount) {
    const c = new THREE.Color(hex);
    c.offsetHSL(0, 0, amount);
    return `#${c.getHexString()}`;
}

function noise(ctx, size, base, spread, rng, alpha = 1) {
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = shade(base, (rng() - 0.5) * spread);
            ctx.fillRect(x, y, 1, 1);
        }
    }
    ctx.globalAlpha = 1;
}

export function createBlockTextures() {
    const grassTop = pixelTexture((ctx, s) => {
        const rng = createRng(11);
        noise(ctx, s, '#5d9b3a', 0.12, rng);
        for (let i = 0; i < 18; i++) {
            ctx.fillStyle = rng() < 0.5 ? '#6fb246' : '#4e8a2f';
            ctx.fillRect(Math.floor(rng() * s), Math.floor(rng() * s), 1, 1);
        }
    });

    const dirt = pixelTexture((ctx, s) => {
        const rng = createRng(23);
        noise(ctx, s, '#866043', 0.12, rng);
        for (let i = 0; i < 14; i++) {
            ctx.fillStyle = rng() < 0.5 ? '#6b4a32' : '#a07a58';
            ctx.fillRect(Math.floor(rng() * s), Math.floor(rng() * s), 1, 1);
        }
    });

    const grassSide = pixelTexture((ctx, s) => {
        const rng = createRng(37);
        noise(ctx, s, '#866043', 0.12, rng);
        for (let x = 0; x < s; x++) {
            const depth = 3 + Math.floor(rng() * 3);
            for (let y = 0; y < depth; y++) {
                ctx.fillStyle = shade('#5d9b3a', (rng() - 0.5) * 0.12);
                ctx.fillRect(x, y, 1, 1);
            }
        }
    });

    const stoneBricks = pixelTexture((ctx, s) => {
        const rng = createRng(53);
        noise(ctx, s, '#8a8a8a', 0.1, rng);
        // Mortar lines in a running-bond pattern
        ctx.fillStyle = '#5e5e5e';
        for (const y of [0, 4, 8, 12]) ctx.fillRect(0, y, s, 1);
        for (let row = 0; row < 4; row++) {
            const offset = row % 2 ? 4 : 0;
            for (let x = offset; x < s; x += 8) ctx.fillRect(x, row * 4, 1, 4);
        }
        ctx.fillStyle = '#a3a3a3';
        for (let i = 0; i < 10; i++) ctx.fillRect(Math.floor(rng() * s), Math.floor(rng() * s), 1, 1);
    });

    const planks = pixelTexture((ctx, s) => {
        const rng = createRng(71);
        noise(ctx, s, '#b8945f', 0.08, rng);
        ctx.fillStyle = '#7d6139';
        for (const y of [3, 7, 11, 15]) ctx.fillRect(0, y, s, 1);
        for (let row = 0; row < 4; row++) {
            const x = row % 2 ? 11 : 4;
            ctx.fillRect(x, row * 4, 1, 3);
        }
        ctx.fillStyle = '#9c7a48';
        for (let i = 0; i < 14; i++) ctx.fillRect(Math.floor(rng() * s), Math.floor(rng() * s), 2, 1);
    });

    const sand = pixelTexture((ctx, s) => {
        const rng = createRng(83);
        noise(ctx, s, '#d9c08a', 0.08, rng);
        for (let i = 0; i < 20; i++) {
            ctx.fillStyle = rng() < 0.5 ? '#c4a96f' : '#ead39f';
            ctx.fillRect(Math.floor(rng() * s), Math.floor(rng() * s), 1, 1);
        }
    });

    const sandstone = pixelTexture((ctx, s) => {
        const rng = createRng(89);
        noise(ctx, s, '#d6b77c', 0.07, rng);
        ctx.fillStyle = '#b8955a';
        for (const y of [0, 7, 8]) ctx.fillRect(0, y, s, 1);
        ctx.fillStyle = '#e6cc94';
        for (const y of [1, 9]) ctx.fillRect(0, y, s, 1);
        for (let i = 0; i < 8; i++) ctx.fillRect(Math.floor(rng() * s), 3 + Math.floor(rng() * 3), 2, 1);
    });

    const snow = pixelTexture((ctx, s) => {
        const rng = createRng(97);
        noise(ctx, s, '#eef3f8', 0.05, rng);
        ctx.fillStyle = '#d7e2ee';
        for (let i = 0; i < 10; i++) ctx.fillRect(Math.floor(rng() * s), Math.floor(rng() * s), 1, 1);
    });

    const snowSide = pixelTexture((ctx, s) => {
        const rng = createRng(98);
        noise(ctx, s, '#866043', 0.12, rng);
        for (let x = 0; x < s; x++) {
            const depth = 3 + Math.floor(rng() * 3);
            for (let y = 0; y < depth; y++) {
                ctx.fillStyle = shade('#eef3f8', (rng() - 0.5) * 0.05);
                ctx.fillRect(x, y, 1, 1);
            }
        }
    });

    const ice = pixelTexture((ctx, s) => {
        const rng = createRng(101);
        noise(ctx, s, '#9fd0f0', 0.06, rng);
        ctx.fillStyle = '#d9f0ff';
        for (let i = 0; i < 4; i++) {
            let x = Math.floor(rng() * s);
            let y = Math.floor(rng() * s);
            for (let k = 0; k < 6; k++) {
                ctx.fillRect(x, y, 1, 1);
                x = (x + 1) % s;
                y = (y + (rng() < 0.5 ? 1 : 0)) % s;
            }
        }
    });

    const tile = pixelTexture((ctx, s) => {
        const rng = createRng(107);
        noise(ctx, s, '#f2f5f7', 0.03, rng);
        ctx.fillStyle = '#7fb6d9';
        for (const v of [0, 8]) {
            ctx.fillRect(0, v, s, 1);
            ctx.fillRect(v, 0, 1, s);
        }
    });

    // Map walls: plain concrete panels (tinted per map)
    const bedrock = pixelTexture((ctx, s) => {
        const rng = createRng(113);
        noise(ctx, s, '#b4b6ba', 0.04, rng);
        ctx.fillStyle = '#9a9ca1';
        ctx.fillRect(0, 0, s, 1);
        ctx.fillRect(0, 0, 1, s);
        ctx.fillStyle = '#c4c6ca';
        ctx.fillRect(1, 1, s - 1, 1);
        for (let i = 0; i < 6; i++) ctx.fillRect(Math.floor(rng() * s), Math.floor(rng() * s), 1, 1);
    });

    const crate = pixelTexture((ctx, s) => {
        const rng = createRng(127);
        noise(ctx, s, '#a87a42', 0.08, rng);
        ctx.fillStyle = '#6b4a24';
        ctx.fillRect(0, 0, s, 2);
        ctx.fillRect(0, s - 2, s, 2);
        ctx.fillRect(0, 0, 2, s);
        ctx.fillRect(s - 2, 0, 2, s);
        for (let i = 2; i < s - 2; i++) {
            ctx.fillRect(i, i, 1, 1);
            ctx.fillRect(s - 1 - i, i, 1, 1);
        }
    });

    const water = pixelTexture((ctx, s) => {
        const rng = createRng(131);
        noise(ctx, s, '#2f86c9', 0.08, rng);
        ctx.fillStyle = '#7fc3f2';
        for (let i = 0; i < 9; i++) ctx.fillRect(Math.floor(rng() * s), Math.floor(rng() * s), 3, 1);
    });
    water.wrapS = water.wrapT = THREE.RepeatWrapping;

    return { grassTop, grassSide, dirt, stoneBricks, planks, sand, sandstone, snow, snowSide, ice, tile, bedrock, crate, water };
}

// Crack overlays for the breaking animation (stage 0..4)
export function createCrackTextures(stages = 5) {
    const textures = [];
    for (let stage = 0; stage < stages; stage++) {
        textures.push(pixelTexture((ctx, s) => {
            const rng = createRng(101);
            ctx.clearRect(0, 0, s, s);
            ctx.fillStyle = 'rgba(20, 10, 5, 0.85)';
            const lines = 2 + stage * 2;
            for (let l = 0; l < lines; l++) {
                let x = 8 + Math.floor((rng() - 0.5) * 4);
                let y = 8 + Math.floor((rng() - 0.5) * 4);
                const len = 3 + stage * 2;
                for (let i = 0; i < len; i++) {
                    ctx.fillRect(x, y, 1, 1);
                    x += Math.round((rng() - 0.5) * 2.2);
                    y += Math.round((rng() - 0.5) * 2.2);
                }
            }
        }));
    }
    return textures;
}

export function createLavaTexture() {
    const texture = pixelTexture((ctx, s) => {
        const rng = createRng(5);
        noise(ctx, s, '#e2591b', 0.2, rng);
        for (let i = 0; i < 30; i++) {
            ctx.fillStyle = rng() < 0.5 ? '#ffb43a' : '#b8340f';
            ctx.fillRect(Math.floor(rng() * s), Math.floor(rng() * s), 2, 1);
        }
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(60, 60);
    return texture;
}

// Generic pixel-art helper: rows of characters mapped through a palette ('.' = transparent)
export function drawPixelArt(ctx, rows, palette, size) {
    const scale = size / rows.length;
    ctx.imageSmoothingEnabled = false;
    rows.forEach((row, y) => {
        [...row].forEach((ch, x) => {
            if (ch === '.' || !palette[ch]) return;
            ctx.fillStyle = palette[ch];
            ctx.fillRect(Math.floor(x * scale), Math.floor(y * scale), Math.ceil(scale), Math.ceil(scale));
        });
    });
}
