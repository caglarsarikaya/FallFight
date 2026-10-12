import { GameRoom } from '../shared/game/GameRoom.js';
import { createRng } from '../shared/math.js';

// A room that records everything it emits
export function createRoom(seed = 7) {
    const events = [];
    const room = new GameRoom({
        rng: createRng(seed),
        emit: (target, type, data) => events.push({ target, type, data })
    });
    room.events = events;
    room.eventsOf = type => events.filter(e => e.type === type).map(e => e.data);
    return room;
}

// Put a player at a tile centre, standing on the floor, facing the given direction
export function place(room, player, ix, iz, yaw = 0) {
    const c = room.arena.tileCenter(ix, iz);
    Object.assign(player, { x: c.x, y: 0, z: c.z, vx: 0, vy: 0, vz: 0, onGround: true, yaw, protectedUntil: 0 });
    player.lastGroundTile = { ix, iz };
}

export function run(room, seconds, dt = 1 / 30) {
    for (let t = 0; t < seconds; t += dt) room.tick(dt);
}
