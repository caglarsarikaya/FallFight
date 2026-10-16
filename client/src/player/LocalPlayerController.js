import { PLAYER } from '../../shared/constants.js';
import { stepMovement, wishDirection } from '../../shared/physics.js';

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
        this.eyeHeight = PLAYER.eyeHeight;
        this.taggedUntil = 0;
        this.jumpUntil = 0;        // a jump press waits this long for the ground (bunny hop timing)
        this.longJump = false;     // carrying the long jump module (Zombies; set from snapshots)
        this.jetpack = false;      // carrying the jetpack (Zombies; set from snapshots)
        this.events = { jumped: false, longJumped: false, landed: false, fallSpeed: 0, liftOff: false };
        this.jet = { up: false, down: false };
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
        this.taggedUntil = performance.now() / 1000 + PLAYER.tagTime;
    }

    // Fixed-step simulation so movement feels the same at any frame rate.
    // input: { forward, strafe, jump (pressed this frame), crouch, walk }; speedMul from the weapon in hand.
    // With the jetpack, walk (Shift) flies up and crouch (Ctrl) sinks.
    update(dt, { forward, strafe, jump, crouch = false, walk = false }, arena, speedMul = 1) {
        this.events.jumped = false;
        this.events.longJumped = false;
        this.events.landed = false;
        this.events.liftOff = false;
        this.jet.up = this.jetpack && walk;
        this.jet.down = this.jetpack && crouch;
        if (this.jetpack) walk = false;
        this.walking = walk;
        const now = performance.now() / 1000;
        const slow = now < this.taggedUntil ? PLAYER.tagSpeed : 1;
        if (jump) this.jumpUntil = now + PLAYER.jumpBuffer;
        this.accumulator = Math.min(this.accumulator + dt, 0.25);
        while (this.accumulator >= STEP) {
            this.accumulator -= STEP;
            const wasOnGround = this.body.onGround;
            const wasFlying = this.body.flying;
            const vy = this.body.vy;
            const input = this.alive
                ? { ...wishDirection(forward, strafe, this.yaw), jump: now < this.jumpUntil, crouch, walk, speedMul, slow, longJump: this.longJump, jetpack: this.jetpack ? this.jet : null }
                : { moveX: 0, moveZ: 0, jump: false };
            stepMovement(this.body, input, arena, STEP);
            if (!wasFlying && this.body.flying) this.events.liftOff = true;
            if (wasOnGround && !this.body.onGround && this.body.vy > 0 && !this.body.flying) {
                this.events.jumped = true;
                if (this.body.longJumped) this.events.longJumped = true;
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
        return { x, y, z, vx, vy, vz, onGround, crouching, walking: this.walking, jetting: !!this.body.flying, yaw: this.yaw, pitch: this.pitch };
    }
}
