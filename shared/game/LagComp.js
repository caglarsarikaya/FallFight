// Lag compensation: a short history of every player's position so the server can check a shot
// against where the shooter actually saw its targets (they render other players ~100ms in the
// past). Fixed-size Float32Array rings, no allocation per tick.
const FIELDS = 5; // time, x, y, z, crouching
const CAPACITY = 40;  // > 1s at 30 Hz

export class LagComp {
    constructor() {
        this.rings = new Map(); // id -> { data, head, count }
        this.pose = { x: 0, y: 0, z: 0, crouching: false };
    }

    record(time, players) {
        for (const p of players) {
            let ring = this.rings.get(p.id);
            if (!ring) {
                ring = { data: new Float32Array(CAPACITY * FIELDS), head: 0, count: 0 };
                this.rings.set(p.id, ring);
            }
            const o = ring.head * FIELDS;
            ring.data[o] = time;
            ring.data[o + 1] = p.x;
            ring.data[o + 2] = p.y;
            ring.data[o + 3] = p.z;
            ring.data[o + 4] = p.crouching ? 1 : 0;
            ring.head = (ring.head + 1) % CAPACITY;
            ring.count = Math.min(CAPACITY, ring.count + 1);
        }
    }

    forget(id) {
        this.rings.delete(id);
    }

    // Clear a player's history (respawn/teleport) so no shot can hit where they used to be
    reset(id) {
        const ring = this.rings.get(id);
        if (ring) ring.count = 0;
    }

    // Where the player was at `time` (interpolated). Falls back to the current position.
    // Returns a shared scratch object: copy what you need before the next call.
    poseAt(player, time) {
        const pose = this.pose;
        pose.x = player.x;
        pose.y = player.y;
        pose.z = player.z;
        pose.crouching = !!player.crouching;
        const ring = this.rings.get(player.id);
        if (!ring || ring.count === 0) return pose;
        const d = ring.data;
        // Walk back from the newest sample
        let newer = -1;
        for (let n = 0; n < ring.count; n++) {
            const i = ((ring.head - 1 - n + CAPACITY) % CAPACITY) * FIELDS;
            if (d[i] <= time) {
                if (newer < 0) return pose; // newer than the newest sample: current position
                const t = (time - d[i]) / Math.max(1e-6, d[newer] - d[i]);
                pose.x = d[i + 1] + (d[newer + 1] - d[i + 1]) * t;
                pose.y = d[i + 2] + (d[newer + 2] - d[i + 2]) * t;
                pose.z = d[i + 3] + (d[newer + 3] - d[i + 3]) * t;
                pose.crouching = (t < 0.5 ? d[i + 4] : d[newer + 4]) > 0.5;
                return pose;
            }
            newer = i;
        }
        // Older than everything we have: the oldest sample
        pose.x = d[newer + 1];
        pose.y = d[newer + 2];
        pose.z = d[newer + 3];
        pose.crouching = d[newer + 4] > 0.5;
        return pose;
    }
}
