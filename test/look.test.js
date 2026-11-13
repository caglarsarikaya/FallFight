import test from 'node:test';
import assert from 'node:assert/strict';
import { SENSITIVITY, clampSensitivity, zoomLookScale } from '../shared/look.js';

test('sensitivity is clamped and bad saved values fall back to the default', () => {
    assert.equal(clampSensitivity(0.17), 0.17);
    assert.equal(clampSensitivity(0.123), 0.12);
    assert.equal(clampSensitivity(999), SENSITIVITY.max);
    assert.equal(clampSensitivity(0.001), SENSITIVITY.min);
    for (const bad of [0, -1, NaN, 'abc', null, undefined]) assert.equal(clampSensitivity(bad), SENSITIVITY.default);
});

test('zoomed look speed follows the magnification', () => {
    assert.equal(zoomLookScale(75, 1), 1);
    const half = (75 * Math.PI) / 360;
    assert.ok(Math.abs(zoomLookScale(75, 4) - Math.tan(half / 4) / Math.tan(half)) < 1e-12);
    // Slower than 1/zoom, and slower the more it zooms
    assert.ok(zoomLookScale(75, 4) < 1 / 4);
    assert.ok(zoomLookScale(75, 8) < zoomLookScale(75, 4));
});
