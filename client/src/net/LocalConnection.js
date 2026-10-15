import { NET } from '../../shared/constants.js';
import { GameRoom } from '../../shared/game/GameRoom.js';
import { Connection } from './Connection.js';

// Offline play: runs the authoritative GameRoom (with bots) right here in the browser.
export class LocalConnection extends Connection {
    constructor({ botCount = 3, mode, map } = {}) {
        super();
        this.botCount = botCount;
        this.selfId = 'you';
        this.room = new GameRoom({
            mode,
            map,
            emit: (target, type, data) => {
                if (target === null || target === this.selfId) {
                    // Copy so client code can never mutate server state, and deliver async like a socket
                    const copy = structuredClone(data);
                    queueMicrotask(() => this.dispatch(type, copy));
                }
            }
        });
        this.timer = null;
    }

    join(profile) {
        this.room.addPlayer({ id: this.selfId, name: profile.name, characterId: profile.characterId });
        if (this.room.mode.seatBots) this.room.setBotCount(this.botCount);

        const step = 1 / NET.tickRate;
        let last = performance.now();
        let pending = 0;
        this.timer = setInterval(() => {
            const now = performance.now();
            // Catch up after the tab was in the background, but not forever
            pending = Math.min(pending + (now - last) / 1000, 1);
            last = now;
            while (pending >= step) {
                this.room.tick(step);
                pending -= step;
            }
        }, step * 1000);
    }

    send(type, data) {
        const copy = structuredClone(data);
        queueMicrotask(() => this.room.handleMessage(this.selfId, type, copy));
    }

    close() {
        clearInterval(this.timer);
    }
}
