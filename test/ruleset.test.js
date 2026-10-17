import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../shared/game/GameRoom.js';
import { createRng } from '../shared/math.js';
import { DEFAULT_RULESET, buildRuleset } from '../shared/ruleset.js';
import { PLAYER } from '../shared/constants.js';
import { place, run } from './helpers.js';

test('ruleset: overrides merge over the defaults, frozen, and typos are refused', () => {
    const rules = buildRuleset({ movement: { gravity: 12 }, respawnDelay: 1 });
    assert.equal(rules.movement.gravity, 12);
    assert.equal(rules.movement.jumpSpeed, DEFAULT_RULESET.movement.jumpSpeed);
    assert.equal(rules.respawnDelay, 1);
    assert.equal(DEFAULT_RULESET.movement.gravity, PLAYER.gravity);
    assert.ok(Object.isFrozen(rules.movement));
    assert.throws(() => buildRuleset({ movement: { gravty: 12 } }), /ruleset\.movement\.gravty/);
});

test('ruleset: two rooms on one server keep their own gravity', () => {
    const rooms = [
        new GameRoom({ rng: createRng(3) }),
        new GameRoom({ rng: createRng(3), ruleset: { movement: { gravity: 6 } } })
    ];
    const heights = rooms.map(room => {
        const bot = room.addBot();
        room.bots.get(bot.id).update = () => ({ moveX: 0, moveZ: 0, jump: false });
        place(room, bot, 30, 30);
        bot.y += 6;
        bot.onGround = false;
        run(room, 0.5);
        return bot.y - room.arena.surfaceHeight(30, 30);
    });
    assert.ok(heights[1] > heights[0] + 1, `low gravity fell slower: ${heights}`);
    assert.equal(rooms[0].ruleset.movement.gravity, PLAYER.gravity);
});

test('ruleset: the welcome carries the room ruleset for client prediction', () => {
    const events = [];
    const room = new GameRoom({ rng: createRng(3), ruleset: { movement: { jumpSpeed: 9 } }, emit: (target, type, data) => events.push({ type, data }) });
    room.addPlayer({ id: 'a', name: 'A' });
    const welcome = events.find(e => e.type === 'welcome').data;
    assert.equal(welcome.ruleset.movement.jumpSpeed, 9);
});
