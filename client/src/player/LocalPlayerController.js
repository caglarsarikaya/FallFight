import { PLAYER } from '../../shared/constants.js';
import { stepMovement, wishDirection } from '../../shared/physics.js';
import { DEFAULT_RULESET } from '../../shared/ruleset.js';

const STEP = 1 / 60;
const LOOK_SPEED = 0.0022;
const MAX_PITCH = 1.5;
const CROUCH_SPEED = 10;   // how fast the eye moves between standing and crouching height

// Client-side prediction of the local player using the same physics as the server's bots
export class LocalPlayerController {
    constructor() {
        this.body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true, crouching: false };
        this.yaw = 0;
        this.pitch = 0;
        this.alive = false;
        this.walking = false;
        this.accumulator = 0;
        this.ruleset = DEFAULT_RULESET; // the room's tuning, from the welcome (same as the server's)
        this.eyeHeight = PLAYER.eyeHeight;
        this.taggedUntil = 0;
        this.jumpUntil = 0;        // a jump press waits this long for the ground (bunny hop timing)
        this.movementHooks = [];   // the room's feature physics hooks (from the welcome)
        this.perks = {};           // our own latest snapshot: what the features read (what we carry...)
        this.keys = {};            // this frame's keys after the features had them (their own input added)
        this.events = { jumped: false, jumpKind: null, landed: false, fallSpeed: 0, liftOff: false };
    }

    teleport(x, y, z, yaw = this.yaw) {
        Object.assign(this.body, { x, y, z, vx: 0, vy: 0, vz: 0, onGround: true, crouching: false, flying: false });
        this.eyeHeight = PLAYER.eyeHeight;
        this.yaw = yaw;
        this.pitch = 0;
    }

    look(dx, dy, sensitivity = 1) {
        this.yaw -= dx * LOOK_SPEED * sensitivity;
        this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - dy * LOOK_SPEED * sensitivity));
    }

    applyKnockback(kb) {
        this.body.vx += kb.x;
        this.body.vz += kb.z;
        this.body.vy = Math.max(this.body.vy, kb.y);
        this.body.onGround = false;
    }

    // Getting shot slows you down for a moment
    tag() {
        this.taggedUntil = performance.now() / 1000 + this.ruleset.tagTime;
    }

    // Fixed-step simulation so movement feels the same at any frame rate.
    // input: { forward, strafe, jump (pressed this frame), crouch, walk }; speedMul from the weapon in hand.
    // The room's features may turn keys into their own input (Shift to fly up...).
    update(dt, { forward, strafe, jump, crouch = false, walk = false }, arena, speedMul = 1) {
        this.events.jumped = false;
        this.events.jumpKind = null;
        this.events.landed = false;
        this.events.liftOff = false;
        const keys = { crouch, walk };
        for (const hook of this.movementHooks) hook.prepare?.(keys, this.perks);
        this.keys = keys;
        this.walking = keys.walk;
        const now = performance.now() / 1000;
        const slow = now < this.taggedUntil ? this.ruleset.tagSpeed : 1;
        if (jump) this.jumpUntil = now + this.ruleset.movement.jumpBuffer;
        this.accumulator = Math.min(this.accumulator + dt, 0.25);
        while (this.accumulator >= STEP) {
            this.accumulator -= STEP;
            const wasOnGround = this.body.onGround;
            const wasFlying = this.body.flying;
            const vy = this.body.vy;
            const input = this.alive
                ? { ...wishDirection(forward, strafe, this.yaw), jump: now < this.jumpUntil, speedMul, slow, ...keys }
                : { moveX: 0, moveZ: 0, jump: false };
            stepMovement(this.body, input, arena, STEP, this.ruleset, this.movementHooks);
            if (!wasFlying && this.body.flying) this.events.liftOff = true;
            if (wasOnGround && !this.body.onGround && this.body.vy > 0 && !this.body.flying) {
                this.events.jumped = true;
                this.events.jumpKind = this.body.jumpKind;
                this.jumpUntil = 0; // one press, one jump
            }
            if (!wasOnGround && this.body.onGround) {
                this.events.landed = true;
                this.events.fallSpeed = -vy;
            }
        }
        // Smooth crouch camera
        const target = this.body.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
        this.eyeHeight += (target - this.eyeHeight) * Math.min(1, dt * CROUCH_SPEED);
        // Don't fall forever while waiting for the death message
        this.body.y = Math.max(this.body.y, -60);
    }

    get eye() {
        return { x: this.body.x, y: this.body.y + this.eyeHeight, z: this.body.z };
    }

    get horizontalSpeed() {
        return Math.hypot(this.body.vx, this.body.vz);
    }

    get networkState() {
        const { x, y, z, vx, vy, vz, onGround, crouching } = this.body;
        return { x, y, z, vx, vy, vz, onGround, crouching, walking: this.walking, flying: !!this.body.flying, yaw: this.yaw, pitch: this.pitch };
    }
}
