import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUN, PLAYER } from '../shared/constants.js';
import { WEAPONS } from '../shared/config/weapons.js';
import { inaccuracy, pelletDirections, shotSeed } from '../shared/spread.js';
import { freshGunState } from '../shared/game/PlayerState.js';
import { createRoom, place, run } from './helpers.js';

// Put a gun in the shooter's hands, ready to fire (no deploy delay)
function arm(room, player, id) {
    const slot = player.inventory.give(id);
    player.inventory.select(slot);
    player.gun = freshGunState();
    return slot;
}

// Aim from the shooter's eye at a height above the target's feet and pull the trigger
function shootAt(room, shooter, target, height, seq = 1) {
    const eye = shooter.eye;
    const dir = { x: target.x - eye.x, y: target.y + height - eye.y, z: target.z - eye.z };
    return room.fire(shooter, { slot: shooter.inventory.selected, seq, dir, t: room.time });
}

function duel({ armor = 0, helmet = false } = {}) {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    place(room, a, 22, 22);
    place(room, b, 22, 14);
    b.armor = armor;
    b.helmet = helmet;
    return { room, a, b };
}

test('AK-47 to the head kills an unarmored player; body and legs do less', () => {
    const { room, a, b } = duel();
    arm(room, a, 'ak47');
    assert.ok(shootAt(room, a, b, 1.1));
    const body = room.eventsOf('damage').at(-1);
    assert.equal(body.zone, 'body');
    // 8 blocks of range falloff barely matter for a rifle
    assert.ok(body.amount >= 34 && body.amount <= WEAPONS.ak47.damage, `body ${body.amount}`);

    room.tick(WEAPONS.ak47.interval);
    shootAt(room, a, b, 0.3, 2);
    const legs = room.eventsOf('damage').at(-1);
    assert.equal(legs.zone, 'legs');
    assert.ok(legs.amount < body.amount);

    room.tick(WEAPONS.ak47.interval);
    shootAt(room, a, b, 1.7, 3);
    const head = room.eventsOf('damage').at(-1);
    assert.equal(head.zone, 'head');
    assert.equal(head.headshot, true);
    assert.equal(b.alive, false);
    const death = room.eventsOf('death').at(-1);
    assert.deepEqual([death.cause, death.headshot], ['ak47', true]);
});

test('kevlar soaks up body damage and wears down; the helmet guards the head', () => {
    const plain = duel();
    arm(plain.room, plain.a, 'ak47');
    shootAt(plain.room, plain.a, plain.b, 1.1);
    const unarmored = plain.room.eventsOf('damage').at(-1).amount;

    const vest = duel({ armor: 100 });
    arm(vest.room, vest.a, 'ak47');
    shootAt(vest.room, vest.a, vest.b, 1.1);
    const hit = vest.room.eventsOf('damage').at(-1);
    assert.ok(hit.armorHit);
    assert.ok(hit.amount < unarmored, `${hit.amount} < ${unarmored}`);
    assert.ok(vest.b.armor < 100 && vest.b.armor > 90, `armor ${vest.b.armor}`);

    // No helmet: a rifle headshot still kills through kevlar
    const noHelmet = duel({ armor: 100 });
    arm(noHelmet.room, noHelmet.a, 'm4a1');
    shootAt(noHelmet.room, noHelmet.a, noHelmet.b, 1.7);
    assert.equal(noHelmet.b.alive, false);

    // With a helmet, the M4A1 (weaker armor penetration) leaves them standing
    const helmet = duel({ armor: 100, helmet: true });
    arm(helmet.room, helmet.a, 'm4a1');
    shootAt(helmet.room, helmet.a, helmet.b, 1.7);
    assert.equal(helmet.room.eventsOf('damage').at(-1).zone, 'head');
    assert.equal(helmet.b.alive, true);
});

// Body shot from the duel spot at a target `blocks` away; returns the damage dealt
function bodyShotAt(gun, blocks) {
    const { room, a, b } = duel();
    arm(room, a, gun);
    place(room, b, 22, 22 - blocks);
    shootAt(room, a, b, 1.1);
    return room.eventsOf('damage').at(-1)?.amount;
}

test('SMGs hit full strength up close but fade past mid range; rifles and pistols carry', () => {
    assert.equal(bodyShotAt('mp5', 4), bodyShotAt('mp5', 12), 'no falloff inside SMG range');
    const smgFar = bodyShotAt('mp5', 22);
    assert.ok(smgFar < WEAPONS.mp5.damage * 0.75, `mp5 at 22: ${smgFar}`);
    assert.equal(bodyShotAt('usp', 22), WEAPONS.usp.damage, 'pistols keep full damage');
    assert.equal(bodyShotAt('ak47', 22), WEAPONS.ak47.damage, 'rifles keep full damage');
    // Even a headshot from an SMG stops killing at range
    assert.ok(smgFar * GUN.zoneMultiplier.head < PLAYER.maxHealth);
});

test('the M3 fires 9 pellets in one shot and lands one combined hit', () => {
    const { room, a, b } = duel();
    arm(room, a, 'm3');
    place(room, b, 22, 19);
    assert.ok(shootAt(room, a, b, 1.1));
    const shot = room.eventsOf('shot').at(-1);
    assert.equal(shot.p.length, 9 * 5);
    assert.equal(room.eventsOf('damage').length, 1);
    assert.ok(room.eventsOf('damage')[0].amount > WEAPONS.m3.damage * 3, 'several pellets connect up close');
});

test('rate of fire, magazine and reload are enforced by the server', () => {
    const { room, a, b } = duel();
    arm(room, a, 'awp');
    assert.ok(shootAt(room, a, b, 0.3, 1));
    assert.ok(!shootAt(room, a, b, 0.3, 2), 'bolt still cycling');
    room.tick(WEAPONS.awp.interval);

    const ammo = a.inventory.ammo.awp;
    ammo.mag = 0;
    assert.ok(!shootAt(room, a, b, 0.3, 3), 'empty magazine');
    const reserve = ammo.reserve;
    assert.ok(room.reload(a));
    assert.ok(!shootAt(room, a, b, 0.3, 4), 'reloading');
    run(room, WEAPONS.awp.reloadTime + 0.1);
    assert.equal(ammo.mag, WEAPONS.awp.mag);
    assert.equal(ammo.reserve, reserve - WEAPONS.awp.mag);
    assert.ok(shootAt(room, a, b, 0.3, 5));
});

test('switching weapons takes the deploy time', () => {
    const { room, a, b } = duel();
    arm(room, a, 'ak47');
    a.inventory.give('deagle');
    room.select(a, 1);
    assert.ok(!shootAt(room, a, b, 1.1), 'still drawing the pistol');
    run(room, WEAPONS.deagle.deploy + 0.05);
    assert.ok(shootAt(room, a, b, 1.1, 2));
    assert.equal(room.eventsOf('damage').at(-1).weapon, 'deagle');
});

test('shotgun reloads shell by shell', () => {
    const { room, a } = duel();
    arm(room, a, 'm3');
    a.inventory.ammo.m3.mag = 5;
    room.reload(a);
    run(room, WEAPONS.m3.reloadTime + 0.4);
    assert.equal(a.inventory.ammo.m3.mag, 6);
    run(room, WEAPONS.m3.reloadTime * 2 + 0.05);
    assert.equal(a.inventory.ammo.m3.mag, 8);
    assert.equal(a.gun.reload, null);
});

test('spread: same seed, same pellets; first standing rifle shot is pinpoint, running is not', () => {
    const dir = { x: 0, y: 0, z: -1 };
    const one = pelletDirections(dir, 0.05, 9, shotSeed('a', 7)).map(d => ({ ...d }));
    const two = pelletDirections(dir, 0.05, 9, shotSeed('a', 7)).map(d => ({ ...d }));
    assert.deepEqual(one, two);
    assert.notDeepEqual(one, pelletDirections(dir, 0.05, 9, shotSeed('a', 8)));

    const ak = WEAPONS.ak47;
    const standing = inaccuracy(ak, { speed: 0, onGround: true });
    const running = inaccuracy(ak, { speed: PLAYER.walkSpeed * ak.moveSpeed, onGround: true });
    const jumping = inaccuracy(ak, { speed: 0, onGround: false });
    const spraying = inaccuracy(ak, { speed: 0, onGround: true, heat: 10 });
    assert.ok(standing < 0.005);
    assert.ok(running > standing * 8 && jumping > running && spraying > standing * 5);

    const awp = WEAPONS.awp;
    assert.ok(inaccuracy(awp, { scoped: true }) < 0.001);
    assert.ok(inaccuracy(awp, { scoped: false }) > 0.05, 'no-scopes are a gamble');
});

test('lag compensation: a shot hits where the shooter saw the target', () => {
    const { room, a, b } = duel();
    arm(room, a, 'ak47');
    run(room, 0.5); // build history at b's position
    const seenAt = room.time;
    // b then steps 1.5 blocks sideways (out of the line of fire)
    b.x += 1.5;
    run(room, 0.1);
    // The shooter aims at where b was, 100ms ago
    const eye = a.eye;
    const dir = { x: b.x - 1.5 - eye.x, y: b.y + 1.1 - eye.y, z: b.z - eye.z };
    assert.ok(room.fire(a, { slot: 0, seq: 1, dir, t: seenAt }));
    assert.equal(room.eventsOf('damage').length, 1, 'rewound hit');

    // Too far back in time is clamped to the compensation window: misses
    const c = duel();
    arm(c.room, c.a, 'ak47');
    run(c.room, 0.5);
    const old = c.room.time;
    c.b.x += 1.5;
    run(c.room, GUN.lagCompensation + 0.3);
    const eye2 = c.a.eye;
    c.room.fire(c.a, { slot: 0, seq: 1, dir: { x: c.b.x - 1.5 - eye2.x, y: c.b.y + 1.1 - eye2.y, z: c.b.z - eye2.z }, t: old });
    assert.equal(c.room.eventsOf('damage').length, 0);
});

test('walls: rifles punch through one block with less damage, shotguns do not', () => {
    // 2-high wall at x = 24: stand on either side of it
    const setup = id => {
        const room = createRoom();
        const a = room.addPlayer({ id: 'a', name: 'A' });
        const b = room.addPlayer({ id: 'b', name: 'B' });
        place(room, a, 23, 29);
        place(room, b, 26, 29);
        arm(room, a, id);
        return { room, a, b };
    };
    const ak = setup('ak47');
    shootAt(ak.room, ak.a, ak.b, 1.1);
    const through = ak.room.eventsOf('damage').at(-1);
    assert.ok(through, 'wallbang');
    assert.ok(through.amount < WEAPONS.ak47.damage * 0.7);

    const m3 = setup('m3');
    shootAt(m3.room, m3.a, m3.b, 1.1);
    assert.equal(m3.room.eventsOf('damage').length, 0, 'pellets stop in the wall');
    assert.equal(m3.room.eventsOf('shot').at(-1).p[4], 1, 'reported as a block hit');
});

// Fire the gun in one direction until a block cracks (or 10 shots); returns { shots, crack }
function shootBlock(room, player, gunId, dir) {
    const slot = arm(room, player, gunId);
    let shots = 0;
    while (!room.eventsOf('blockCracking').length && shots < 10) {
        room.fire(player, { slot, seq: ++shots, dir, t: room.time });
        room.tick(WEAPONS[gunId].interval + 0.01);
        player.inventory.ammo[gunId].mag = WEAPONS[gunId].mag;
    }
    return { shots, crack: room.eventsOf('blockCracking').at(-1) };
}

test('two bullets crack a block, whatever the gun', () => {
    for (const gunId of ['glock', 'deagle', 'awp']) {
        const room = createRoom();
        const a = room.addPlayer({ id: 'a', name: 'A' });
        place(room, a, 23, 29);
        const { shots, crack } = shootBlock(room, a, gunId, { x: 1, y: -0.05, z: 0 });
        assert.ok(crack, gunId);
        assert.equal(shots, 2, gunId);
    }
});

test('two bullets crack the floor block under your feet', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    place(room, a, 22, 22);
    const { shots, crack } = shootBlock(room, a, 'usp', { x: 0, y: -1, z: 0 });
    assert.deepEqual([crack?.ix, crack?.iy, crack?.iz], [22, room.arena.floor, 22]);
    assert.equal(shots, 2);
});

test('one shotgun blast cracks the block it is aimed at', () => {
    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    place(room, a, 22, 22);
    const { shots, crack } = shootBlock(room, a, 'm3', { x: 0, y: -1, z: 0 });
    assert.equal(shots, 1);
    assert.deepEqual([crack?.ix, crack?.iy, crack?.iz], [22, room.arena.floor, 22]);
});

test('the M3 stays accurate on the run and kills at mid range', () => {
    const running = { speed: PLAYER.walkSpeed * WEAPONS.m3.moveSpeed };
    assert.ok(inaccuracy(WEAPONS.m3, running) < 0.075);

    const room = createRoom();
    const a = room.addPlayer({ id: 'a', name: 'A' });
    const b = room.addPlayer({ id: 'b', name: 'B' });
    place(room, a, 22, 22);
    place(room, b, 22, 16);
    arm(room, a, 'm3');
    let blasts = 0;
    while (b.alive && blasts < 2) {
        a.vx = running.speed; // strafing at full speed
        shootAt(room, a, b, 1.2, ++blasts);
        room.tick(WEAPONS.m3.interval + 0.01);
    }
    assert.equal(b.alive, false, `still alive with ${b.health} hp after ${blasts} blasts`);
});

test('getting shot slows bots down briefly (tagging)', () => {
    const { room, a, b } = duel();
    arm(room, a, 'usp');
    shootAt(room, a, b, 1.1);
    assert.ok(b.taggedUntil > room.time);
    assert.equal(room.botMoveInput(b, {}).slow, PLAYER.tagSpeed);
});
