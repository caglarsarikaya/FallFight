// Keyboard/mouse state with pointer lock. Game code reads movement each frame and reacts to
// discrete actions via the onAction callback: ('slot', n) ('camera') ('scoreboard', down)
// ('primary', down) ('secondary') ('reload') ('last') ('buy') ('rebuy', F3) ('pause').
// Crouch is C or Ctrl, walk is Shift, like CS. Jump is Space or the mouse wheel (either way), one
// jump per press so bunny hops need timing. Ctrl+W can't be blocked by a web page, so the game
// asks before the tab closes (see Game); other Ctrl shortcuts (and Ctrl+wheel zoom) are swallowed
// while playing.
export class InputManager {
    constructor(element) {
        this.element = element;
        this.keys = new Set();
        this.mouse = { dx: 0, dy: 0 };
        this.primaryDown = false;
        this.enabled = false;
        this.onAction = () => {};
        this.onLockChange = () => {};
        this.lockLostAt = -Infinity;
        this.jumpPressed = false;

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
            if (!this.enabled || !this.locked) return;
            e.preventDefault();
            if (e.deltaY !== 0) this.jumpPressed = true;
        }, { passive: false });
        document.addEventListener('pointerlockchange', () => {
            const wasLocked = this.locked;
            this.locked = document.pointerLockElement === this.element;
            if (wasLocked && !this.locked) this.lockLostAt = performance.now();
            if (!this.locked) {
                this.keys.clear();
                this.jumpPressed = false;
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
        // F3 is the browser's Find; here it's rebuy
        if (['Tab', 'Space', 'F3', 'F5', 'ArrowUp', 'ArrowDown'].includes(code)) e.preventDefault();
        // Crouching (Ctrl) while pressing other keys must not trigger browser shortcuts (Ctrl+D
        // bookmarks...), also with the mouse released (buy menu); text fields keep theirs
        const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);
        if ((e.ctrlKey || e.metaKey) && !typing) e.preventDefault();
        if (down) {
            if (e.repeat) return;
            this.keys.add(code);
            if (code === 'Space') this.jumpPressed = true;
            if (code.startsWith('Digit')) this.onAction('slot', Number(code.slice(5)) - 1);
            if (code === 'KeyV' || code === 'F5') this.onAction('camera');
            if (code === 'KeyR') this.onAction('reload');
            if (code === 'KeyB') this.onAction('buy');
            if (code === 'F3') this.onAction('rebuy');
            if (code === 'KeyQ') this.onAction('last');
            if (code === 'Tab') this.onAction('scoreboard', true);
            // The Esc that just released the mouse (some browsers pass it on) isn't a second press
            if (code === 'Escape' && performance.now() - this.lockLostAt > 250) this.onAction('pause');
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

    // True once per Space press or wheel tick since the last call
    consumeJump() {
        const pressed = this.jumpPressed;
        this.jumpPressed = false;
        return pressed;
    }

    get crouch() {
        const k = this.keys;
        return k.has('KeyC') || k.has('ControlLeft') || k.has('ControlRight');
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
