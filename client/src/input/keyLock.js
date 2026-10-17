// Fullscreen with the keyboard locked (Chrome, Edge): the only way a web page gets Ctrl+W,
// Ctrl+Shift+W and Ctrl+T instead of the browser, and crouching or flying the jetpack down (Ctrl)
// while running (W) hits exactly those. Holding Esc leaves fullscreen; a short Esc still reaches
// the game. Other browsers get plain fullscreen (or nothing), and Game's leave guard asks before
// the tab closes instead. F11 fullscreen doesn't count: the lock needs the page's own fullscreen.
export const canLockKeys = typeof navigator !== 'undefined' && !!navigator.keyboard?.lock;

// Call from a click (browsers only allow fullscreen from one)
export function enterGameFullscreen() {
    const lock = () => navigator.keyboard?.lock?.().catch(() => {});
    if (document.fullscreenElement) {
        lock();
        return;
    }
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(lock, () => {});
}

export function exitGameFullscreen() {
    navigator.keyboard?.unlock?.();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

// Are Ctrl+W and friends ours right now
export const keysLocked = () => canLockKeys && !!document.fullscreenElement;
