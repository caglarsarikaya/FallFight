// Blocky optics mounted on a gun's rail (see `rail` in ./specs.js). Same part format as the gun
// models, [w, h, d, x, y, z, material], with y from the top of the rail and z from its centre.
// The housings are hollow frames so you look through them when aiming; `glass` is the window
// (a faint tint), `eye` the height of the line of sight above the rail, `rear` how far the back
// of the optic sits behind the mount (it goes near the eye when aiming).
// The reticle itself is drawn on the HUD (Hud.setReticle) so it always shows where the bullets go.

const P = (w, h, d, x, y, z, m) => [w, h, d, x, y, z, m];

// Four bars around a w x h window, d deep, centred at (0, y, z)
function frame(w, h, d, t, y, z, m) {
    return [
        P(w, t, d, 0, y + (h - t) / 2, z, m),
        P(w, t, d, 0, y - (h - t) / 2, z, m),
        P(t, h - 2 * t, d, (w - t) / 2, y, z, m),
        P(t, h - 2 * t, d, -(w - t) / 2, y, z, m)
    ];
}

// Small (narrower than the receiver), hairline rims, shallow housings and big windows: aimed,
// the optic is a slim outline around the target, so it doesn't wall off the view.
export const SIGHT_MODELS = {
    // A short, thin-walled tube on a low mount
    reddot: {
        parts: [P(0.016, 0.008, 0.024, 0, 0.004, 0, 'black'), ...frame(0.028, 0.026, 0.01, 0.0015, 0.021, 0, 'dark')],
        glass: [0.025, 0.023, 0, 0.021, -0.004],
        eye: 0.021, rear: 0.005
    },
    // A flat plate with one wide open window
    reflex: {
        parts: [P(0.02, 0.005, 0.036, 0, 0.0025, 0, 'black'), ...frame(0.032, 0.024, 0.004, 0.0015, 0.017, -0.012, 'black')],
        glass: [0.0284, 0.0204, 0, 0.017, -0.012],
        eye: 0.017, rear: 0.018
    },
    // EOTech-style: a low base box under a slim square hood
    holo: {
        parts: [P(0.022, 0.006, 0.05, 0, 0.003, 0, 'dark'), ...frame(0.034, 0.026, 0.02, 0.0015, 0.019, -0.012, 'black')],
        glass: [0.031, 0.023, 0, 0.019, -0.018],
        eye: 0.019, rear: 0.025
    }
};

export const RETICLE_COLOR = { reddot: '#ff2a2a', reflex: '#ff3b1f', holo: '#ff2a2a' };

// Buy menu icon (64 x 32): the window and its reticle, square pixels to match the voxel look
export function drawReticle(ctx, id) {
    const { width, height } = ctx.canvas;
    const cx = width / 2;
    const cy = height / 2;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f2f2f2';
    const box = (x, y, w, h) => ctx.fillRect(Math.round(x), Math.round(y), w, h);
    if (id === 'reflex') {
        // Open frame, a chevron
        ctx.strokeStyle = '#f2f2f2';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 14, cy - 10, 28, 20);
        ctx.fillStyle = RETICLE_COLOR.reflex;
        for (let i = 0; i < 4; i++) {
            box(cx - 1 - i * 2, cy + i * 2, 2, 2);
            box(cx + 1 + i * 2 - 2, cy + i * 2, 2, 2);
        }
        return;
    }
    if (id === 'holo') {
        // Long body, square window, a square ring around a dot
        box(cx - 16, cy + 8, 32, 5);
        ctx.strokeStyle = '#f2f2f2';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 14, cy - 12, 28, 20);
        ctx.strokeStyle = RETICLE_COLOR.holo;
        ctx.strokeRect(cx - 6, cy - 8, 12, 12);
        ctx.fillStyle = RETICLE_COLOR.holo;
        box(cx - 1, cy - 3, 2, 2);
        return;
    }
    // Red dot: a square tube and a dot
    ctx.strokeStyle = '#f2f2f2';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - 11, cy - 11, 22, 22);
    box(cx - 6, cy + 11, 12, 3);
    ctx.fillStyle = RETICLE_COLOR.reddot;
    box(cx - 1.5, cy - 1.5, 3, 3);
}
