// The Half-Life long jump module. It appears every `interval` seconds on the spot the mode's map
// overlay names (room.mapRules.longJumpSpot), if none is lying there. The carrier keeps it until
// they die. Crouch + jump while moving faster than minSpeed: a leap along the keys at `speed`,
// `up` upwards (~10 blocks, HL-style).
export const LONG_JUMP = Object.freeze({ interval: 180, speed: 14, up: 8.5, minSpeed: 0.8 });
