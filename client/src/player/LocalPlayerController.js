import { PLAYER } from '../../shared/constants.js';
import { stepMovement, wishDirection } from '../../shared/physics.js';

const STEP = 1 / 60;
const LOOK_SPEED = 0.0022;
const MAX_PITCH = 1.5;

// Client-side prediction of the local player using the same physics as the server's bots
export class LocalPlayerController {
    constructor() {
        this.body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true };
        this.yaw = 0;
        this.pitch = 0;
        this.alive = false;
        this.accumulator = 0;
        this.events = { jumped: false, landed: false };
    }

    teleport(x, y, z, yaw = this.yaw) {
        Object.assign(this.body, { x, y, z, vx: 0, vy: 0, vz: 0, onGround: true });
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
        this.body.vy = kb.y;
        this.body.onGround = false;
    }

    // Fixed-step simulation so movement feels the same at any frame rate
    update(dt, { forward, strafe, jump }, arena) {
        this.events.jumped = false;
        this.events.landed = false;
        this.accumulator = Math.min(this.accumulator + dt, 0.25);
        while (this.accumulator >= STEP) {
            this.accumulator -= STEP;
            const wasOnGround = this.body.onGround;
            const input = this.alive
                ? { ...wishDirection(forward, strafe, this.yaw), jump }
                : { moveX: 0, moveZ: 0, jump: false };
            stepMovement(this.body, input, arena, STEP);
            if (wasOnGround && !this.body.onGround && this.body.vy > 0) this.events.jumped = true;
            if (!wasOnGround && this.body.onGround) this.events.landed = true;
        }
        // Don't fall forever while waiting for the death message
        this.body.y = Math.max(this.body.y, -60);
    }

    get eye() {
        return { x: this.body.x, y: this.body.y + PLAYER.eyeHeight, z: this.body.z };
    }

    get horizontalSpeed() {
        return Math.hypot(this.body.vx, this.body.vz);
    }

    get networkState() {
        const { x, y, z, vx, vy, vz, onGround } = this.body;
        return { x, y, z, vx, vy, vz, onGround, yaw: this.yaw, pitch: this.pitch };
    }
}
