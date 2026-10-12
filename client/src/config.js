// Multiplayer game server (Render). The game page itself is hosted on GitHub Pages.
export const SERVER_URL = 'https://fallfightgameserver.onrender.com';

// If the server can't be reached this long after pressing Play, play offline against bots instead
export const CONNECT_TIMEOUT_MS = 45000;

// Bots in the offline fallback (rooms are always 4 fighters)
export const OFFLINE_BOTS = 3;

// Which server to use:
// - ?server=<url> in the page URL overrides everything (e.g. ?server=http://localhost:3000)
// - a page served by the local dev server (npm run dev) uses that server
// - otherwise SERVER_URL
export function resolveServerUrl() {
    const override = new URLSearchParams(location.search).get('server');
    if (override) return override;
    const local = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') && location.port === '3000';
    return local ? location.origin : SERVER_URL;
}
