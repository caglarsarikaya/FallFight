// Keyboard/mouse state with pointer lock. Game code reads movement each frame and reacts to
// discrete actions via the onAction callback: ('slot', n) ('camera') ('scoreboard', down)
// ('primary', down) ('secondary') ('reload') ('last') ('pause') ('cycle', +1/-1).
// Crouch is C (Ctrl would make Ctrl+W close the browser tab), walk is Shift, like CS.
export class InputManager {
    constructor(element) {
        this.element = element;
        this.keys = new Set();
        this.mouse = { dx: 0, dy: 0 };
        this.primaryDown = false;
        this.enabled = false;
        this.onAction = () => {};
        this.onLockChange = () => {};

        document.addEventListener('keydown', e => this.handleKey(e, true));
        document.addEventListener('keyup', e => this.handleKey(e, false));
        document.addEventListener('mousemove', e => {
            if (!this.locked) return;
            this.mouse.dx += e.movementX || 0;
            this.mouse.dy += e.movementY || 0;
        });
        element.addEventListener('mousedown', e => {
            if (!this.enabled) return;
            if (!this.locked) {
                this.requestLock();
                return;
            }
            if (e.button === 0) {
                this.primaryDown = true;
                this.onAction('primary', true);
            } else if (e.button === 2) {
                this.onAction('secondary');
            }
        });
        element.addEventListener('contextmenu', e => e.preventDefault());
        document.addEventListener('mouseup', e => {
            if (e.button === 0 && this.primaryDown) {
                this.primaryDown = false;
                this.onAction('primary', false);
            }
        });
        document.addEventListener('wheel', e => {
            if (this.enabled && this.locked) this.onAction('cycle', Math.sign(e.deltaY));
        }, { passive: true });
        document.addEventListener('pointerlockchange', () => {
            const wasLocked = this.locked;
            this.locked = document.pointerLockElement === this.element;
            if (!this.locked) {
                this.keys.clear();
                if (this.primaryDown) {
                    this.primaryDown = false;
                    this.onAction('primary', false);
                }
            }
            if (wasLocked !== this.locked) this.onLockChange(this.locked);
        });
        window.addEventListener('blur', () => this.keys.clear());
    }

    requestLock() {
        const request = this.element.requestPointerLock?.();
        // Newer browsers return a promise that rejects if the user exited lock very recently
        if (request?.catch) request.catch(() => {});
    }

    exitLock() {
        if (document.pointerLockElement) document.exitPointerLock();
    }

    handleKey(e, down) {
        if (!this.enabled) return;
        const code = e.code;
        if (['Tab', 'Space', 'F5', 'ArrowUp', 'ArrowDown'].includes(code)) e.preventDefault();
        if (down) {
            if (e.repeat) return;
            this.keys.add(code);
            if (code.startsWith('Digit')) this.onAction('slot', Number(code.slice(5)) - 1);
            if (code === 'KeyV' || code === 'F5') this.onAction('camera');
            if (code === 'KeyR') this.onAction('reload');
            if (code === 'KeyB') this.onAction('buy');
            if (code === 'KeyQ') this.onAction('last');
            if (code === 'Tab') this.onAction('scoreboard', true);
            if (code === 'Escape') this.onAction('pause');
        } else {
            this.keys.delete(code);
            if (code === 'Tab') this.onAction('scoreboard', false);
        }
    }

    // -1..1 forward/back and strafe left/right
    get movement() {
        const k = this.keys;
        const forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
        const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
        return { forward, strafe };
    }

    get jump() {
        return this.keys.has('Space');
    }

    get crouch() {
        return this.keys.has('KeyC');
    }

    get walk() {
        return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    }

    consumeMouse() {
        const { dx, dy } = this.mouse;
        this.mouse.dx = 0;
        this.mouse.dy = 0;
        return { dx, dy };
    }
}
