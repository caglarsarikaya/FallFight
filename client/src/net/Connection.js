// Common surface of LocalConnection and OnlineConnection, so the game doesn't care which it uses.
export class Connection {
    constructor() {
        this.handlers = new Map();
        this.selfId = null;
        this.ping = null;   // smoothed round-trip time in ms, null when unknown or offline
    }

    get isOnline() {
        return false;
    }

    on(type, handler) {
        if (!this.handlers.has(type)) this.handlers.set(type, []);
        this.handlers.get(type).push(handler);
    }

    dispatch(type, data) {
        for (const handler of this.handlers.get(type) || []) handler(data);
    }

    // Join the arena with the player's profile
    join(_profile) {
        throw new Error('not implemented');
    }

    send(_type, _data) {
        throw new Error('not implemented');
    }

    close() {}
}
