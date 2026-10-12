import { io } from 'socket.io-client';
import { C2S, S2C } from '../../shared/protocol.js';
import { Connection } from './Connection.js';

// Online play through the Node server. Connects immediately so the menu can show server status.
export class OnlineConnection extends Connection {
    constructor(url) {
        super();
        this.status = 'connecting';
        this.statusListeners = [];
        this.socket = io(url, { transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
        this.socket.on('connect', () => {
            this.setStatus('online');
            // Reconnected after a drop (or a server restart): join the same room again
            if (this.profile) this.join(this.profile, this.joinRequest);
        });
        this.socket.on('disconnect', () => this.setStatus('connecting'));
        this.socket.on('connect_error', () => this.setStatus('connecting'));

        for (const type of Object.values(S2C)) {
            this.socket.on(type, data => this.dispatch(type, data));
        }
        this.on(S2C.WELCOME, data => {
            this.selfId = data.selfId;
        });
    }

    get isOnline() {
        return true;
    }

    onStatus(listener) {
        this.statusListeners.push(listener);
        listener(this.status);
    }

    setStatus(status) {
        this.status = status;
        this.statusListeners.forEach(l => l(status));
    }

    // request: { roomId, password } for a specific room, or {} for quick play
    join(profile, request = {}) {
        this.profile = profile;
        this.joinRequest = request;
        this.socket.emit(C2S.JOIN, { name: profile.name, characterId: profile.characterId, ...request });
    }

    // Ask the server something and wait for its answer (socket.io acknowledgement)
    request(type, data, timeoutMs = 8000) {
        return new Promise(resolve => {
            if (this.status !== 'online') return resolve({ error: 'offline' });
            this.socket.timeout(timeoutMs).emit(type, data, (err, response) => {
                resolve(err ? { error: 'timeout' } : response);
            });
        });
    }

    send(type, data) {
        this.socket.emit(type, data);
    }

    close() {
        this.socket.close();
    }
}
