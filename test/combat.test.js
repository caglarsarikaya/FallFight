import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOW, PLAYER, PROJECTILE } from '../shared/constants.js';
import { getItem } from '../shared/items/ItemRegistry.js';
import { createRoom, place } from './helpers.js';

const bow = getItem('bow');

test('bow damage grows with draw power', () => {
    const weak = bow.damageFor({ zone: 'body', power: 0.15 }).amount;
    const mid = bow.damageFor({ zone: 'body', power: 0.6 }).amount;
    const strong = bow.damageFor({ zone: 'body', power: 1 }).amount;
    assert.ok(weak < mid && mid < strong, `${weak} < ${mid} < ${strong}`);
    assert.equal(strong, BOW.damage.body[1]);
});

test('legs < body < head at the same power', () => {
    for (const power of [0.2, 0.5, 0.9]) {
        const legs = bow.damageFor({ zone: 'legs', power }).amount;
        const body = bow.damageFor({ zone: 'body', power }).amount;
        const head = bow.damageFor({ zone: 'head', power }).amount;
        assert.ok(legs < body && body < head, `power ${power}: ${legs} ${body} ${head}`);
    }
});

test('a full-draw arrow to the head is a one-shot kill; a slow one is not', () => {
    assert.deepEqual(bow.damageFor({ zone: 'head', power: 1 }), { amount: PLAYER.maxHealth, headshot: true });
    const slow = bow.damageFor({ zone: 'head', power: 0.2 });
    assert.equal(slow.headshot, false);
    assert.ok(slow.amount >= 50 && slow.amount < PLAYER.maxHealth, 'two slow head arrows kill');
});

// Shoot along a clear lane towards a target, aiming at a height above its feet
function shootAt(room, shooter, target, height, charge) {
    const eye = shooter.eye;
    const dz = target.z - eye.z;
    const speed = bow.launchSpeed(charge);
    const time = Math.abs(dz) / speed;
    const aimY = target.y + height + 0.5 * PROJECTILE.gravity * time * time; // compensate for gravity
    const dir = { x: 0, y: (aimY - eye.y) / Math.abs(dz), z: Math.sign(dz) };
    room.useItem(shooter, 0, dir, charge);
    for (let i = 0; i < 45 && room.projectiles.size; i++) room.tick(1 / 30);
    room.tick(BOW.cooldown);
}

test('projectile hits are zoned: full-draw headshot kills, two slow head shots kill', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    place(room, a, 22, 22);
    place(room, b, 22, 14);

    shootAt(room, a, b, 1.65, BOW.fullDraw);
    const shot = room.eventsOf('damage').at(-1);
    assert.equal(shot.zone, 'head');
    assert.equal(shot.headshot, true);
    assert.equal(b.alive, false);
    assert.equal(room.eventsOf('death').at(-1).cause, 'headshot');

    // Fresh target: slow arrows to the head
    const c = room.addPlayer({ id: 'c', name: 'C' });
    place(room, c, 22, 14);
    shootAt(room, a, c, 1.65, 0.25);
    assert.equal(room.eventsOf('damage').at(-1).zone, 'head');
    assert.equal(c.alive, true, 'one slow head arrow does not kill');
    shootAt(room, a, c, 1.65, 0.25);
    assert.equal(c.alive, false, 'two slow head arrows kill');
});

test('leg shots do less damage than body shots', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    place(room, a, 22, 22);
    place(room, b, 22, 14);
    shootAt(room, a, b, 0.4, 0.6);
    const legs = room.eventsOf('damage').at(-1);
    shootAt(room, a, b, 1.1, 0.6);
    const body = room.eventsOf('damage').at(-1);
    assert.equal(legs.zone, 'legs');
    assert.equal(body.zone, 'body');
    assert.ok(legs.amount < body.amount);
});

test('walls stop arrows and axes', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    // 2-high wall at x = 24: stand on either side of it
    place(room, a, 23, 29);
    place(room, b, 25, 29);
    a.yaw = -Math.PI / 2;
    room.useItem(a, 0, { x: 1, y: 0, z: 0 }, 1);
    for (let i = 0; i < 30; i++) room.tick(1 / 30);
    assert.equal(b.health, PLAYER.maxHealth, 'arrow blocked by the wall');
    assert.equal(room.eventsOf('projectileEnd').at(-1).stuck, true);

    // The axe can't reach through it either; it chops the wall instead
    room.useItem(a, 1, { x: 1, y: -0.3, z: 0 });
    assert.equal(b.health, PLAYER.maxHealth, 'axe blocked by the wall');
    const crack = room.eventsOf('blockCracking').at(-1);
    assert.deepEqual([crack.ix, crack.iz], [24, 29]);
});
