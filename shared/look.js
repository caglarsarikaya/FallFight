// Mouse look tuning shared by the menus, the saved profile and the game loop.

// Sensitivity 1 turns 0.0022 rad per mouse count (LocalPlayerController). The slider covers the
// usual range; the number field goes further both ways (0.17 here is about 1.0 in CS)
export const SENSITIVITY = { min: 0.01, max: 10, sliderMin: 0.05, sliderMax: 3, step: 0.01, default: 1 };

export function clampSensitivity(value) {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return SENSITIVITY.default;
    return Math.round(Math.min(SENSITIVITY.max, Math.max(SENSITIVITY.min, v)) * 100) / 100;
}

// How much slower the mouse turns when the view is zoomed (FOV = baseFov / zoom): by the picture's
// magnification, tan(fov / 2) ratio. Things on screen then move under the crosshair at the same
// speed zoomed or not, so muscle memory carries over; dividing by the zoom alone leaves scopes
// feeling too fast
export function zoomLookScale(baseFovDeg, zoom) {
    if (!(zoom > 1)) return 1;
    const half = (baseFovDeg * Math.PI) / 360;
    return Math.tan(half / zoom) / Math.tan(half);
}
