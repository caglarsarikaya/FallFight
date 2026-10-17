// The jetpack (GTA San Andreas style), kept until you die. Shift lifts off and climbs at `up`,
// Ctrl sinks at `down`, no keys hovers; WASD flies at `speed`. Velocity blends toward that at
// `accel` per second. You can't climb more than `ceiling` blocks over the map's top layer.
// Carriers take no fall damage.
export const JETPACK = Object.freeze({ up: 6, down: 4.5, speed: 7.5, accel: 5, ceiling: 14 });
