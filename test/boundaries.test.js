import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameRoom } from '../shared/game/GameRoom.js';
import { GameMode } from '../shared/modes/GameMode.js';
import { registerMode } from '../shared/modes/registry.js';
import { createRng } from '../shared/math.js';
import { place, recorder, run } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The core must not know any mode or feature: those live in shared/modes/<id>/,
// shared/features/<id>/ and their client halves, and plug in through hooks.
const CORE = [
    'shared/game', 'shared/physics.js', 'shared/inventory', 'shared/protocol.js', 'shared/ruleset.js',
    'shared/world', 'client/src/Game.js', 'client/src/ui', 'client/src/entities', 'client/src/player', 'client/src/net'
];
const NAMES = /zombie|teambuy|gungame|jetpack|longjump|godmode|angel|revive|TEAM_BUY|GUN_GAME|ZOMBIES/i;

function files(rel) {
    const full = path.join(root, rel);
    if (statSync(full).isFile()) return [rel];
    return readdirSync(full).flatMap(name => files(path.join(rel, name)));
}

test('boundaries: the core names no mode and no feature', () => {
    const hits = [];
    for (const file of CORE.flatMap(files).filter(f => f.endsWith('.js'))) {
        readFileSync(path.join(root, file), 'utf8').split('\n').forEach((line, i) => {
            if (NAMES.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    assert.deepEqual(hits, [], 'move this into the mode or feature, behind a hook');
});

// A whole new mode in a few lines, without touching any core file: its own rules, its own
// gravity, a feature borrowed from another mode, and only one of the maps
class Floaty extends GameMode {
    equip(player) {
        player.inventory.reset({ weapons: ['deagle'] });
    }
}

test('boundaries: a new mode plugs in with its own rules, gravity, features and maps', () => {
    registerMode({
        id: 'floaty', name: 'Floaty', short: 'FLOAT', description: 'Low gravity, deagles only.',
        maps: ['fy_iceworld'],
        ruleset: { movement: { gravity: 8 } },
        features: ['jetpack'],
        Rules: Floaty
    });
    const events = [];
    const room = new GameRoom({ mode: 'floaty', map: 'fy_pool_day', rng: createRng(2), emit: recorder(events) });
    const normal = new GameRoom({ map: 'fy_iceworld', rng: createRng(2) });
    assert.equal(room.map.id, 'fy_iceworld', 'not one of its maps: its own first map instead');
    assert.equal(room.ruleset.movement.gravity, 8);
    assert.equal(normal.ruleset.movement.gravity, 24, 'other rooms keep theirs');

    const a = room.addPlayer({ id: 'a', name: 'A' });
    assert.equal(a.inventory.selectedId, 'deagle');
    assert.equal(room.playerJSON(a, true).jetpack, false, 'the feature it listed is there');
    assert.equal(normal.addPlayer({ id: 'b', name: 'B' }).jetpack, undefined, 'and only there');
    const welcome = events.find(e => e.type === 'welcome').data;
    assert.deepEqual(welcome.features, ['jetpack']);

    // Bots fall slower under its gravity
    const bot = room.addBot();
    room.bots.get(bot.id).update = () => ({ moveX: 0, moveZ: 0, jump: false });
    place(room, bot, 18, 10);
    const floor = bot.y;
    bot.y += 4;
    bot.onGround = false;
    run(room, 0.5);
    assert.ok(bot.y - floor > 2.5, `still up at ${bot.y - floor}`);
});
