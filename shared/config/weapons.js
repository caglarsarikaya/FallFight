// Gun and knife tuning, modelled on Counter-Strike 1.6. Shared by the server (authoritative
// damage, spread, fire rate, ammo) and the client (prediction, recoil, HUD, buy menu).
//
// Units: distances in blocks (1 block ~ 40 CS units), times in seconds, angles in radians
// unless the field name says deg.
//   rpm            rounds per minute (sets the time between shots)
//   damage         per bullet (per pellet for shotguns) at point blank, before hit zone and armor
//   range          blocks of full damage; past it damage halves every GUN.falloffHalf blocks
//   armorPen       share of damage that still goes to health through kevlar
//   penetration    how many blocks a bullet can punch through (losing damage each time)
//   reloadTime     seconds (per shell for shotguns); about 30% quicker than CS 1.6
//   moveSpeed      movement speed multiplier while holding it
//   spread         inaccuracy cone (radians): stance base + moving + in the air + per-shot bloom
//   recoil         view kick in degrees: up per shot (capped), side sway after sideFrom shots
//   scope          sniper zoom levels (fov divisor); unscoped spread is huge, like a no-scope
export const WEAPON_KIND = Object.freeze({
    KNIFE: 'knife', PISTOL: 'pistol', SMG: 'smg', SHOTGUN: 'shotgun', RIFLE: 'rifle', SNIPER: 'sniper',
    MG: 'mg', LAUNCHER: 'launcher'
});

// SPECIAL: map power weapons (the Lava Arena RPG), never bought or given in a loadout.
// HE / SMOKE: grenades, bought in the shop (keys 6 and 7)
export const WEAPON_SLOT = Object.freeze({ PRIMARY: 0, SECONDARY: 1, KNIFE: 2, ITEM: 3, SPECIAL: 4, HE: 5, SMOKE: 6, EXTRA: 7 });

const SLOT_OF_KIND = { [WEAPON_KIND.PISTOL]: WEAPON_SLOT.SECONDARY, [WEAPON_KIND.LAUNCHER]: WEAPON_SLOT.SPECIAL };

const gun = spec => Object.freeze({
    pellets: 1,
    auto: false,
    penetration: 1,
    reloadStyle: 'mag',
    deploy: 0.75,
    knockback: 0,
    ...spec,
    slot: SLOT_OF_KIND[spec.kind] ?? WEAPON_SLOT.PRIMARY,
    interval: 60 / spec.rpm
});

export const WEAPONS = Object.freeze({
    // ---- pistols -----------------------------------------------------------------------
    glock: gun({
        id: 'glock', name: 'Glock-18', short: 'GLOCK', kind: WEAPON_KIND.PISTOL,
        rpm: 400, damage: 25, range: 45, armorPen: 0.5, penetration: 1,
        mag: 20, reserve: 120, reloadTime: 1.55, deploy: 0.6, moveSpeed: 1,
        spread: { stand: 0.005, crouch: 0.0035, move: 0.030, air: 0.12, perShot: 0.010, maxShot: 0.05, recover: 7 },
        recoil: { up: 1.4, upMax: 6, side: 0.3, sideFrom: 3, recover: 14 },
        price: 400, killReward: 300
    }),
    usp: gun({
        id: 'usp', name: 'USP .45', short: 'USP', kind: WEAPON_KIND.PISTOL,
        rpm: 352, damage: 34, range: 45, armorPen: 0.5, penetration: 1,
        mag: 12, reserve: 100, reloadTime: 1.9, deploy: 0.6, moveSpeed: 1,
        spread: { stand: 0.004, crouch: 0.0025, move: 0.030, air: 0.12, perShot: 0.011, maxShot: 0.05, recover: 6 },
        recoil: { up: 1.8, upMax: 7, side: 0.3, sideFrom: 3, recover: 13 },
        price: 500, killReward: 300
    }),
    deagle: gun({
        id: 'deagle', name: 'Desert Eagle', short: 'DEAGLE', kind: WEAPON_KIND.PISTOL,
        rpm: 267, damage: 54, range: 45, armorPen: 0.75, penetration: 2,
        mag: 7, reserve: 35, reloadTime: 1.55, deploy: 0.75, moveSpeed: 1,
        spread: { stand: 0.0045, crouch: 0.003, move: 0.045, air: 0.16, perShot: 0.030, maxShot: 0.09, recover: 3.5 },
        recoil: { up: 4.2, upMax: 10, side: 0.8, sideFrom: 1, recover: 11 },
        price: 650, killReward: 300, knockback: 1.5
    }),
    // ---- SMGs and shotgun ----------------------------------------------------------------
    mp5: gun({
        id: 'mp5', name: 'MP5 Navy', short: 'MP5', kind: WEAPON_KIND.SMG, auto: true,
        rpm: 750, damage: 26, range: 16, armorPen: 0.5, penetration: 1,
        mag: 30, reserve: 120, reloadTime: 1.8, deploy: 0.75, moveSpeed: 0.98,
        spread: { stand: 0.012, crouch: 0.009, move: 0.025, air: 0.10, perShot: 0.0035, maxShot: 0.035, recover: 9 },
        recoil: { up: 0.55, upMax: 5, side: 0.35, sideFrom: 6, recover: 12 },
        price: 1500, killReward: 600
    }),
    p90: gun({
        id: 'p90', name: 'ES P90', short: 'P90', kind: WEAPON_KIND.SMG, auto: true,
        rpm: 857, damage: 21, range: 16, armorPen: 0.75, penetration: 1,
        mag: 50, reserve: 100, reloadTime: 2.4, deploy: 0.8, moveSpeed: 0.98,
        spread: { stand: 0.014, crouch: 0.011, move: 0.024, air: 0.10, perShot: 0.003, maxShot: 0.035, recover: 10 },
        recoil: { up: 0.5, upMax: 5, side: 0.4, sideFrom: 6, recover: 12 },
        price: 2350, killReward: 300
    }),
    m3: gun({
        id: 'm3', name: 'M3 Super 90', short: 'M3', kind: WEAPON_KIND.SHOTGUN,
        rpm: 68, damage: 20, pellets: 9, range: 6, armorPen: 0.5, penetration: 0,
        mag: 8, reserve: 32, reloadTime: 0.35, reloadStyle: 'shell', deploy: 0.85, moveSpeed: 0.92,
        // Like CS, a shotgun's spread barely changes on the move
        spread: { stand: 0.060, crouch: 0.055, move: 0.010, air: 0.030, perShot: 0, maxShot: 0, recover: 4 },
        recoil: { up: 5.5, upMax: 12, side: 0.6, sideFrom: 1, recover: 9 },
        price: 1700, killReward: 900, knockback: 2.5
    }),
    // ---- rifles --------------------------------------------------------------------------
    ak47: gun({
        id: 'ak47', name: 'AK-47', short: 'AK-47', kind: WEAPON_KIND.RIFLE, auto: true,
        rpm: 600, damage: 36, range: 45, armorPen: 0.775, penetration: 2,
        mag: 30, reserve: 90, reloadTime: 1.7, deploy: 0.85, moveSpeed: 0.88,
        spread: { stand: 0.004, crouch: 0.002, move: 0.060, air: 0.16, perShot: 0.0065, maxShot: 0.05, recover: 6 },
        recoil: { up: 1.15, upMax: 9, side: 0.75, sideFrom: 5, recover: 10 },
        price: 2500, killReward: 300
    }),
    m4a1: gun({
        id: 'm4a1', name: 'M4A1', short: 'M4A1', kind: WEAPON_KIND.RIFLE, auto: true,
        rpm: 666, damage: 33, range: 45, armorPen: 0.7, penetration: 2,
        mag: 30, reserve: 90, reloadTime: 2.15, deploy: 0.85, moveSpeed: 0.92,
        spread: { stand: 0.0035, crouch: 0.002, move: 0.050, air: 0.15, perShot: 0.005, maxShot: 0.04, recover: 6.5 },
        recoil: { up: 0.9, upMax: 7.5, side: 0.55, sideFrom: 6, recover: 11 },
        price: 3100, killReward: 300
    }),
    // ---- machine gun ----------------------------------------------------------------------
    // ammoPrice: refilling its 200 spare rounds (the usual formula would ask $2300)
    m249: gun({
        id: 'm249', name: 'M249 Para', short: 'M249', kind: WEAPON_KIND.MG, auto: true,
        rpm: 750, damage: 32, range: 45, armorPen: 0.8, penetration: 2,
        mag: 100, reserve: 200, reloadTime: 3.3, deploy: 1.0, moveSpeed: 0.85,
        spread: { stand: 0.009, crouch: 0.006, move: 0.075, air: 0.18, perShot: 0.0045, maxShot: 0.06, recover: 5 },
        recoil: { up: 0.85, upMax: 8, side: 0.6, sideFrom: 8, recover: 9 },
        price: 5750, ammoPrice: 600, killReward: 300
    }),
    // ---- snipers -------------------------------------------------------------------------
    scout: gun({
        id: 'scout', name: 'Schmidt Scout', short: 'SCOUT', kind: WEAPON_KIND.SNIPER,
        rpm: 48, damage: 75, range: 120, armorPen: 0.85, penetration: 3,
        mag: 10, reserve: 90, reloadTime: 1.4, deploy: 0.9, moveSpeed: 1,
        spread: { stand: 0.065, crouch: 0.055, move: 0.10, air: 0.10, perShot: 0, maxShot: 0, recover: 4 },
        recoil: { up: 2.5, upMax: 6, side: 0.3, sideFrom: 1, recover: 10 },
        scope: { zooms: [2.5, 5], spread: 0.0008, moveSpread: 0.05 },
        price: 2750, killReward: 300
    }),
    awp: gun({
        id: 'awp', name: 'AWP Magnum', short: 'AWP', kind: WEAPON_KIND.SNIPER,
        rpm: 41, damage: 115, range: 120, armorPen: 0.975, penetration: 3,
        mag: 10, reserve: 30, reloadTime: 1.75, deploy: 1.2, moveSpeed: 0.84,
        spread: { stand: 0.085, crouch: 0.075, move: 0.13, air: 0.13, perShot: 0, maxShot: 0, recover: 4 },
        recoil: { up: 4, upMax: 8, side: 0.4, sideFrom: 1, recover: 9 },
        scope: { zooms: [2.5, 6], spread: 0.0005, moveSpread: 0.06 },
        price: 4750, killReward: 100, knockback: 3
    }),
    // ---- specials (spawned by the map, one shot, then gone) -------------------------------
    // rocket: flight speed, life (s), blast radius, damage (full inside the core share of the
    // radius and on whoever it hits, then falls off to 0 at the edge, ignores armor), blockRadius
    // (every block inside breaks), knockback at the centre
    rpg: gun({
        id: 'rpg', name: 'RPG-7', short: 'RPG', kind: WEAPON_KIND.LAUNCHER, special: true,
        rpm: 30, damage: 180, range: 120, armorPen: 1, penetration: 0,
        mag: 1, reserve: 0, reloadTime: 2, deploy: 0.8, moveSpeed: 0.85,
        spread: { stand: 0.004, crouch: 0.003, move: 0.03, air: 0.08, perShot: 0, maxShot: 0, recover: 4 },
        recoil: { up: 8, upMax: 10, side: 0.8, sideFrom: 1, recover: 7 },
        rocket: { speed: 38, life: 3, radius: 6, core: 0.4, damage: 250, blockRadius: 2.6, knockback: 11 },
        killReward: 300
    })
});

export const KNIFE = Object.freeze({
    id: 'knife', name: 'Knife', short: 'KNIFE', kind: WEAPON_KIND.KNIFE, slot: WEAPON_SLOT.KNIFE,
    slash: { damage: 25, interval: 0.45 },
    stab: { damage: 65, backstab: 180, interval: 1.0 },
    reach: 2.0,        // players
    blockReach: 3.5,   // chopping blocks, like the old axe
    deploy: 0.4,
    moveSpeed: 1.04,
    killReward: 1500
});

export const GUN_IDS = Object.freeze(Object.keys(WEAPONS));
// Guns that can be bought or handed out (specials only come from the map)
export const BUYABLE_GUN_IDS = Object.freeze(GUN_IDS.filter(id => !WEAPONS[id].special));

export function weaponSpec(id) {
    return id === KNIFE.id ? KNIFE : WEAPONS[id] || null;
}

export function isGun(id) {
    return Object.hasOwn(WEAPONS, id);
}
