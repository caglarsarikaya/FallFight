import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../shared/game/GameRoom.js';
import { ZOMBIES } from '../shared/modes/zombies/config.js';
import { FlowField } from '../shared/ai/FlowField.js';
import { BLOCK_STATE } from '../shared/world/Arena.js';
import { createRng } from '../shared/math.js';
import { S2C } from '../shared/protocol.js';
import { place, recorder } from './helpers.js';

// A zombies room on the classic map (flat, open floor along the top rows), mid-wave, with no
// zombies coming on their own: the test spawns them
function zombieRoom(seed = 5) {
    const events = [];
    const room = new GameRoom({ mode: 'zombies', map: 'fallfight_classic', rng: createRng(seed), emit: recorder(events) });
    room.eventsOf = type => events.filter(e => e.type === type).map(e => e.data);
    const human = room.addPlayer({ id: 'a', name: 'A' });
    human.health = human.maxHealth = 1e6;
    Object.assign(room.mode, { wave: 1, phase: 'wave', toSpawn: 0, phaseEndsAt: Infinity });
    return { room, human };
}

function spawn(room, ix, iz) {
    room.mode.toSpawn = 1;
    room.mode.spawnZombie();
    room.mode.toSpawn = 0;
    const z = [...room.players.values()].filter(p => p.isZombie).at(-1);
    place(room, z, ix, iz);
    return z;
}

const tick = (room, seconds, each = () => {}) => {
    for (let t = 0; t < seconds; t += 1 / 30) {
        each();
        room.tick(1 / 30);
    }
};

// Point a player's crosshair at someone's chest
function aimAt(shooter, target) {
    const eye = shooter.eye;
    const dx = target.x - eye.x;
    const dy = target.y + 1.1 - eye.y;
    const dz = target.z - eye.z;
    shooter.yaw = Math.atan2(-dx, -dz);
    shooter.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}

test('zombies never stand inside each other, even all spawned on one spot', () => {
    const { room, human } = zombieRoom();
    place(room, human, 50, 2);
    const zs = [];
    for (let i = 0; i < 8; i++) zs.push(spawn(room, 20, 2));
    let closest = Infinity;
    tick(room, 4, () => {
        if (room.time < 1) return;   // give them a second to come apart
        for (let i = 0; i < zs.length; i++) {
            for (let j = i + 1; j < zs.length; j++) {
                if (Math.abs(zs[i].y - zs[j].y) > 1) continue;
                closest = Math.min(closest, Math.hypot(zs[i].x - zs[j].x, zs[i].z - zs[j].z));
            }
        }
    });
    assert.ok(closest > ZOMBIES.brain.bodyRadius * 2 * 0.8, `closest pair ${closest.toFixed(2)}`);
    assert.ok(zs.every(z => z.alive && z.x > room.arena.tileCenter(22, 2).x), 'and they still came on');
});

test('a zombie in your crosshair weaves left and right but keeps coming', () => {
    const lateral = aimed => {
        const { room, human } = zombieRoom();
        place(room, human, 52, 3);
        const z = spawn(room, 20, 3);
        const brain = room.npcs.get(z.id);
        brain.side = 0;
        brain.flanker = false;
        brain.lungeAt = Infinity;
        const startX = z.x;
        let min = Infinity;
        let max = -Infinity;
        tick(room, 4, () => {
            if (aimed) aimAt(human, z);
            else human.yaw = 0;   // looking away
            min = Math.min(min, z.z);
            max = Math.max(max, z.z);
        });
        return { spread: max - min, progress: z.x - startX };
    };
    const calm = lateral(false);
    const shot = lateral(true);
    assert.ok(shot.spread > calm.spread + 0.5, `weave ${shot.spread.toFixed(2)} vs ${calm.spread.toFixed(2)}`);
    assert.ok(shot.progress > 6, `closed in ${shot.progress.toFixed(1)} blocks`);
});

test('flow field: among equally short steps, the cheapest by the caller\'s cost wins', () => {
    const { room } = zombieRoom();
    const flow = new FlowField(room.arena);
    const goal = room.arena.tileCenter(40, 2);
    flow.update([{ x: goal.x, y: 0, z: goal.z }]);
    // From (30, 2) the three steps east (+1, -1/0/+1) are all one closer
    const plain = flow.next(30, 2, 0);
    assert.equal(plain.ix, 31);
    const north = flow.next(30, 2, 0, (nx, nz) => (nz === 1 ? 0 : 5));
    assert.deepEqual([north.ix, north.iz], [31, 1]);
    const south = flow.next(30, 2, 0, (nx, nz) => (nz === 3 ? 0 : 5));
    assert.deepEqual([south.ix, south.iz], [31, 3]);
    // Never a step that isn't closer, however cheap
    const back = flow.next(30, 2, 0, nx => (nx === 29 ? -100 : 0));
    assert.equal(back.ix, 31);
});

test('a zombie falling to its death marks the spot; the others avoid it for a while', () => {
    const { room, human } = zombieRoom();
    place(room, human, 50, 2);
    const z = spawn(room, 20, 2);
    room.kill(z, null, 'fall');
    const { ix, iz } = room.arena.tileAt(z.x, z.z);
    assert.equal(room.mode.isDangerous(ix, iz), true);
    assert.equal(room.mode.isDangerous(ix + 1, iz + 1), true);
    assert.equal(room.mode.isDangerous(ix + 5, iz), false);
    room.time += ZOMBIES.brain.dangerTime + 0.1;
    assert.equal(room.mode.isDangerous(ix, iz), false);
});

test('a zombie claws the floor out from under someone standing just out of reach above it', () => {
    const { room, human } = zombieRoom();
    // A 2-high block in the open: the player on top, the zombie below
    const arena = room.arena;
    let spot = null;
    for (let iz = 10; iz < 50 && !spot; iz++) {
        for (let ix = 10; ix < 50 && !spot; ix++) {
            if (arena.surfaceHeight(ix, iz) === 2 && arena.surfaceHeight(ix - 2, iz) === 0 && arena.surfaceHeight(ix - 1, iz) === 0) spot = { ix, iz };
        }
    }
    assert.ok(spot, 'the map has a 2-high block');
    place(room, human, spot.ix, spot.iz);
    const z = spawn(room, spot.ix - 2, spot.iz);
    room.npcs.get(z.id).lungeAt = Infinity;
    tick(room, 5);
    const cracks = room.eventsOf(S2C.BLOCK_CRACKING).filter(c => c.by === z.id);
    assert.ok(cracks.some(c => c.ix === spot.ix && c.iz === spot.iz), 'it went for the block under the player');
});

test('zombies get better at hopping off a cracking block as the waves go on', () => {
    const { room } = zombieRoom();
    const b = ZOMBIES.brain;
    const early = room.npcs.get(spawn(room, 20, 2).id).dodgeChance;
    room.mode.wave = 30;
    const late = room.npcs.get(spawn(room, 22, 2).id).dodgeChance;
    assert.equal(early, b.dodgeChance);
    assert.equal(late, b.dodgeChanceMax);
    // And they do it: a zombie whose block cracks jumps clear (with the dice on its side)
    room.rng = () => 0;
    const z = spawn(room, 25, 2);
    const brain = room.npcs.get(z.id);
    brain.dodgeChance = 1;
    room.mode.nearestHuman = () => null;   // nobody to chase: it would stand there but for the dodge
    const under = room.arena.supportBlock(z.x, z.y, z.z, 0);
    room.breakBlock(under.ix, under.iy, under.iz, { id: 'a' });
    assert.equal(room.arena.stateAt(under.ix, under.iy, under.iz), BLOCK_STATE.CRACKING);
    room.tick(1 / 30);
    room.rng = createRng(1);
    tick(room, 2);
    assert.equal(z.alive, true, 'it hopped clear');
});

test('bots notice a crosshair on them and dance', () => {
    const room = new GameRoom({ mode: 'ffa', map: 'fallfight_classic', rng: createRng(4), emit: () => {} });
    const human = room.addPlayer({ id: 'a', name: 'A' });
    const bot = room.addBot();
    const brain = room.bots.get(bot.id);
    place(room, human, 40, 2);
    place(room, bot, 30, 2);
    human.yaw = 0;
    brain.fireCheckAt = 0;
    assert.equal(brain.underFire(), false);
    aimAt(human, bot);
    brain.fireCheckAt = 0;
    assert.equal(brain.underFire(), true);
});
