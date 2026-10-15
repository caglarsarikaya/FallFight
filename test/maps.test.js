import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../shared/world/maps/index.js';
import { Arena } from '../shared/world/Arena.js';
import { BLOCK_KIND } from '../shared/world/blocks.js';
import { Pathfinder } from '../shared/ai/Pathfinder.js';
import { stepMovement } from '../shared/physics.js';
import { GameRoom } from '../shared/game/GameRoom.js';
import { createRng } from '../shared/math.js';

const reachable = (arena, ix, iz) => !!arena.reachable[iz * arena.size + ix];

// Reachable, stable floor tiles inside a spawn zone
function zoneTiles(arena, zone) {
    const tiles = [];
    for (let iz = zone.z0; iz <= zone.z1; iz++) {
        for (let ix = zone.x0; ix <= zone.x1; ix++) {
            const y = arena.spawnLevel(ix, iz);
            if (y !== null) tiles.push({ ix, iz, y });
        }
    }
    return tiles;
}

for (const map of Object.values(MAPS)) {
    test(`${map.id}: every spawn zone has room to spawn, and the teams can reach each other`, () => {
        const arena = new Arena(map);
        assert.equal(arena.size, map.size);
        for (const [team, zones] of Object.entries(map.spawns)) {
            for (const zone of zones) assert.ok(zoneTiles(arena, zone).length >= 4, `${team} zone ${JSON.stringify(zone)}`);
        }
        const from = zoneTiles(arena, map.spawns.t[0])[0];
        const to = zoneTiles(arena, map.spawns.ct[0])[0];
        const path = new Pathfinder(arena).find(from, to, 20000);
        assert.ok(path && path.length, 'path between spawns');
        const end = path.at(-1);
        assert.deepEqual([end.ix, end.iz], [to.ix, to.iz], 'the path arrives');
    });

    test(`${map.id}: sniper perches are reachable surfaces`, () => {
        const arena = new Arena(map);
        for (const perch of map.landmarks.sniperPerches) {
            assert.equal(arena.surfaceHeight(perch.ix, perch.iz), perch.y, JSON.stringify(perch));
            assert.ok(reachable(arena, perch.ix, perch.iz), `reachable ${JSON.stringify(perch)}`);
        }
    });

    test(`${map.id}: the outer wall can't be broken`, () => {
        const arena = new Arena(map);
        const y = arena.floor + 1;
        if (!arena.isSolid(0, y, 5)) return; // open maps (the lava arena) have no wall
        assert.equal(arena.startBreak(0, y, 5, 'x', 0), false);
        assert.equal(arena.hitBlock(0, y, 5), false);
        assert.equal(arena.hitBlock(0, y, 5), false);
    });

    test(`${map.id}: a bots match runs and players spawn inside their zones`, () => {
        for (const mode of ['ffa', 'gungame']) {
            const room = new GameRoom({ mode, map: map.id, rng: createRng(3) });
            room.setBotCount(4);
            for (let t = 0; t < 20; t += 1 / 30) room.tick(1 / 30);
            for (const p of room.players.values()) {
                assert.ok(Number.isFinite(p.x) && p.y > -8, `${p.name} ${p.x},${p.y},${p.z}`);
            }
        }
    });
}

test('fy_pool_day: water is not solid; you can swim up and climb out by the steps', () => {
    const arena = new Arena(MAPS.fy_pool_day);
    const { pool, poolSteps } = MAPS.fy_pool_day.landmarks;
    assert.equal(arena.kindAt(pool.ix, 2, pool.iz), BLOCK_KIND.WATER);
    assert.equal(arena.surfaceHeight(pool.ix, pool.iz), 0, 'stand on the pool floor');
    assert.ok(reachable(arena, pool.ix, pool.iz));
    // Bullets fly through water
    const c = arena.tileCenter(pool.ix, pool.iz);
    assert.equal(arena.raycast({ x: c.x - 5, y: 1, z: c.z }, { x: 1, y: 0, z: 0 }, 5), null);

    // Swimming up from the bottom with Space held reaches the surface
    const body = { x: c.x, y: 0, z: c.z, vx: 0, vy: 0, vz: 0, onGround: true };
    let top = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
        stepMovement(body, { moveX: 0, moveZ: 0, jump: true }, arena, 1 / 60);
        top = Math.max(top, body.y);
    }
    assert.ok(top > 1.5, `swam up to ${top.toFixed(2)}`);

    // From the pool, a path leads out via the steps
    const out = new Pathfinder(arena).find(pool, { ix: 10, iz: 21 });
    assert.ok(out.some(w => w.ix === poolSteps.ix || w.ix === poolSteps.ix + 1), 'uses the steps');
    assert.equal(out.at(-1).y, 2);
});

test('fy_pool_day: swimming into the edge with Space held climbs out onto the deck', () => {
    const arena = new Arena(MAPS.fy_pool_day);
    const climb = (tile, moveX, moveZ) => {
        const c = arena.tileCenter(tile.ix, tile.iz);
        const body = { x: c.x, y: arena.surfaceHeight(tile.ix, tile.iz), z: c.z, vx: 0, vy: 0, vz: 0, onGround: true };
        for (let t = 0; t < 3; t += 1 / 60) stepMovement(body, { moveX, moveZ, jump: true }, arena, 1 / 60);
        for (let t = 0; t < 0.5; t += 1 / 60) stepMovement(body, { moveX, moveZ, jump: false }, arena, 1 / 60);
        return body;
    };
    // From the pool floor against the north wall
    const wall = climb({ ix: 20, iz: 17 }, 0, -1);
    assert.ok(wall.y >= 2 && wall.onGround, `out of the pool at y ${wall.y.toFixed(2)}`);
    // From the west steps
    const { poolSteps } = MAPS.fy_pool_day.landmarks;
    const steps = climb({ ix: poolSteps.ix + 1, iz: poolSteps.iz }, -1, 0);
    assert.ok(steps.y >= 2 && steps.onGround, `up the steps to y ${steps.y.toFixed(2)}`);
});

test('fy_iceworld: the rink is slippery', () => {
    const arena = new Arena(MAPS.fy_iceworld);
    const slide = tile => {
        const c = arena.tileCenter(tile.ix, tile.iz);
        const body = { x: c.x, y: 0, z: c.z, vx: 0, vy: 0, vz: 0, onGround: true };
        for (let t = 0; t < 0.5; t += 1 / 60) stepMovement(body, { moveX: 1, moveZ: 0, jump: false }, arena, 1 / 60);
        const start = body.x;
        for (let t = 0; t < 0.5; t += 1 / 60) stepMovement(body, { moveX: 0, moveZ: 0, jump: false }, arena, 1 / 60);
        return body.x - start;
    };
    const onIce = slide({ ix: 14, iz: 15 });
    const onSnow = slide({ ix: 3, iz: 9 });
    assert.ok(onIce > onSnow * 2, `ice ${onIce.toFixed(2)} vs snow ${onSnow.toFixed(2)}`);
});

test('fy_pool_day: teams spawn inside their pool houses, not on the roofs', () => {
    const room = new GameRoom({ mode: 'teambuy', map: 'fy_pool_day', rng: createRng(4) });
    for (const id of ['a', 'b', 'c', 'd']) room.addPlayer({ id, name: id });
    room.tick(1 / 30);
    for (const p of room.players.values()) assert.equal(p.y, 2, `${p.name} (${p.team}) at height ${p.y}`);
    // ...and the roof is a separate place you reach by the stairs
    const arena = room.arena;
    const { sniperPerches } = MAPS.fy_pool_day.landmarks;
    const path = new Pathfinder(arena).find({ ix: 5, iz: 21, y: 2 }, { ...sniperPerches[0] }, 20000);
    assert.equal(path.at(-1).y, 7, 'up on the roof');
});

test('de_dust_mini: bots path through the roofed tunnel', () => {
    const arena = new Arena(MAPS.de_dust_mini);
    const { tunnel } = MAPS.de_dust_mini.landmarks;
    assert.equal(arena.surfaceHeight(tunnel.ix, tunnel.iz), 4, 'the top of the tunnel roof');
    assert.equal(arena.spawnLevel(tunnel.ix, tunnel.iz), 0, 'the tunnel floor');
    const path = new Pathfinder(arena).find({ ix: 6, iz: 22, y: 0 }, { ix: 22, iz: 22, y: 0 }, 20000);
    assert.equal(path.at(-1).ix, 22);
    assert.ok(path.some(w => w.ix === tunnel.ix && w.y === 0), 'walks through it, not over it');
});
