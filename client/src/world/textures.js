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

    return { grassTop, grassSide, dirt };
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
