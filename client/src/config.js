// Multiplayer server (e.g. 'https://fallfight.onrender.com'). Leave empty to only offer offline play.
// When the page is served by the Node server itself (npm start), its own origin is used.
export const SERVER_URL = '';

export function resolveServerUrl() {
    if (SERVER_URL) return SERVER_URL;
    const servedByNode = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return servedByNode && location.port === '3000' ? location.origin : '';
}

export const OFFLINE_BOTS = 3;
