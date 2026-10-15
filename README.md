# FallFight

A blocky arena shooter that runs in the browser, built to feel like Counter-Strike 1.6: rifles,
pistols, SMGs, a shotgun, snipers and the knife, with real recoil, spread and hit feedback. The
world is still made of blocks, so you can also **break the floor under your opponents** and drop
them into the lava.

**▶ Play: https://caglarsarikaya.github.io/FallFight/**

- **Four game modes**: Deathmatch, Gun Game, Team Buy and Zombies (see below). Pick one on the menu.
- **Quick Play** puts you in a public room of the chosen mode. Rooms are always full: bots fill the
  empty seats, and a bot steps out whenever a person joins. If the game server can't be reached (or is
  full), you play the same game against bots in your browser. **Play Offline** does that on purpose.
- **Rooms**: create your own room with a name, an optional password, a player count, a **mode and a
  map**, and a choice to **fill empty seats with bots** or play **friends only**. Friends see it in the
  room list and join it (entering the password if there is one).

## Game modes

| Mode | How it works |
|---|---|
| **Deathmatch** | Everyone for themselves, forever. A random rifle and pistol every life, kevlar and helmet, a health potion for every kill |
| **Gun Game** | Everyone starts with a Glock. Every 5 kills hands you the next gun at once: Glock → USP → Deagle → MP5 → P90 → M3 → Scout → M4A1 → AK-47 → AWP. The first to finish the ladder (50 kills) wins. A knife kill takes a kill away from the victim |
| **Team Buy** | Terrorists vs Counter-Terrorists in rounds, like CS on fy_pool_day. Each round opens with a few seconds of freeze time to buy (press **B**); then wipe out the other team. Dead players wait for the next round, and survivors keep their guns. Kills, round wins and even losses pay money ($800 to start, $16000 max). First to 8 rounds wins |
| **Zombies** | 1–4 players hold out against endless waves together. Every wave brings more, tougher and faster zombies, with runners every 5th wave. Killed zombies drop ammo, potions, kevlar and better guns. Players who fall come back when the wave is cleared; when everyone is down, the run is over. Zombies claw through walls if you hide behind them |

## Maps

| Map | Inspired by | |
|---|---|---|
| **fy_pool_day** | fy_pool_day | Two pool houses across a sunken pool. Swim (Space swims up), dive off the board, climb the stairs to snipe from the roofs. Team Buy's default |
| **fy_iceworld** | fy_iceworld | A small snow field with an ice-walled square and crates. The rink in the middle is slippery, and it snows |
| **de_dust_mini** | de_dust | Long, mid and short lanes, mid doors, long doors and roofed tunnels through the middle blocks |
| **Lava Arena** | the original FallFight | Open grass over lava, a walled plaza and four sniper towers |

Inside each map's outer wall, everything can be shot down or knifed through.

## How to play

| Key | Action |
|---|---|
| WASD | Move |
| Shift | Walk: quiet footsteps and better accuracy |
| C | Crouch: the most accurate stance, and a smaller target |
| Space | Jump (shooting in the air is wildly inaccurate) |
| Mouse | Look |
| Left click | Fire (hold for automatic guns) · knife slash |
| Right click | Scope (Scout, AWP: two zoom levels) · knife stab |
| R | Reload |
| 1 / 2 / 3 / 4, Q, mouse wheel | Rifle / Pistol / Knife / Health potion · Q = last weapon |
| B | Team Buy: buy menu. Pick a category, then an item, with the number keys |
| V (or F5) | Switch between first and third person |
| Tab | Scoreboard |
| Esc | Menu: change character or nickname, camera, sound, mouse sensitivity, graphics (LOW for slow computers: no shadows) |

**Characters:** Robot, Squirrel, Mario, Dr Octopus, Dr Helix and Byte. They all have the same stats;
only the looks differ. Your nickname, character and settings are remembered in the browser.

### Weapons

Numbers follow Counter-Strike 1.6 (all tuning is in `shared/config/weapons.js`):

| Weapon | Type | Damage | Rate | Magazine | Notes |
|---|---|---|---|---|---|
| Glock-18 | Pistol | 25 | 400/min | 20 | Light, accurate first shot |
| USP .45 | Pistol | 34 | 352/min | 12 | |
| Desert Eagle | Pistol | 54 | 267/min | 7 | Heavy kick; punches through a block |
| MP5 Navy | SMG | 26 | 750/min | 30 | Easy spray |
| ES P90 | SMG | 21 | 857/min | 50 | |
| M3 Super 90 | Shotgun | 20 × 9 | 68/min | 8 | Loads shell by shell; deadly up close |
| AK-47 | Rifle | 36 | 600/min | 30 | One-tap headshot even through a helmet |
| M4A1 | Rifle | 33 | 666/min | 30 | Steadier spray than the AK |
| Scout | Sniper | 75 | 48/min | 10 | Light: run at full speed |
| AWP | Sniper | 115 | 41/min | 10 | One shot to the body kills |
| Knife | Melee | 25 / 65 | | | Slash / stab; a stab in the back kills. Chops blocks |

### Rules

| | |
|---|---|
| Health and armor | 100 HP. Deathmatch and Gun Game: kevlar + helmet on spawn, respawn after 3 s with 2 s of spawn protection (attacking ends it). Team Buy: buy armor yourself, no respawn until the next round |
| Loadout | Deathmatch: a random rifle, SMG, shotgun or sniper and a random pistol every life. Gun Game: your ladder gun. Team Buy: a pistol, then whatever you buy. Zombies: a USP, then what the zombies drop. The knife always |
| 🎯 Hit zones | Head ×4, body ×1, legs ×0.75. Kevlar soaks up part of every body hit (how much depends on the gun's armor penetration); only a helmet protects the head |
| Accuracy | Standing still is accurate, crouching more so. Moving, jumping and long sprays open up the spread. Snipers are only accurate scoped and standing still. The crosshair shows your current spread |
| Recoil | Every gun kicks in a fixed pattern (up first, then sideways): pull the mouse down to control a spray, or fire in bursts |
| Range | Damage drops with distance, much faster for SMGs and shotgun pellets than for rifles |
| Walls | Rifles, snipers and the Deagle punch through a block (for less damage). Two bullets crack any block, floor included (the map's outer walls never break); the knife breaks any block outright. Broken blocks regrow after 20 s |
| Getting hit | Your view flinches, you slow down for a moment, and a red arc shows where the shot came from |
| Sound | Footsteps give away anyone running; walking (Shift) and crouching are silent |
| 🏰 Sniper towers | Four 8-high stone towers near the corners. Climb the plank stairs to a top with a parapet. Knife the stairs to cut a sniper off |
| 🧪 Health potion | Heals 20 HP, one use. Deathmatch: every kill rewards one. Team Buy: $200. Zombies: dropped by zombies |
| Pickups | Deathmatch: every 15 s an ammo box (a magazine for every gun you carry), every 60 s a health potion. Gun Game: ammo boxes |
| Falling | Fall into the void and you die. Whoever hit you or broke your block in the last 10 s gets the kill |

## Architecture

```
client/   static site: three.js rendering, input, UI, sound (no build step, native ES modules)
shared/   the game itself in plain JS: rules, items, physics, bots, authoritative GameRoom
server/   Node + socket.io host for online rooms
test/     node:test unit tests and bot simulations
```

- **One simulation everywhere.** `shared/game/GameRoom.js` is the authoritative game: health,
  weapons, blocks, pickups, kills and bots.
  - Offline, it runs inside the browser through `client/src/net/LocalConnection.js`.
  - Online, it runs on the server (`server/RoomManager.js`).

  The client only talks to a `Connection`, so both modes run identical code.
- **Movement:** the client predicts its own movement with `shared/physics.js`, the same physics the
  server uses for bots. It sends its position 20 times a second, and remote players are interpolated.
- **Items (OOP):**

  ```
  Item ─┬─ Weapon ─┬─ Gun (one per entry in shared/config/weapons.js)
        │          ├─ MeleeWeapon ── Knife
        │          └─ RangedWeapon (projectiles, for future grenades)
        └─ Consumable ── HealthPotion
  ```

  Each item has a matching `ItemView` on the client (`client/src/items/`): its 3D model,
  first-person animation and slot icon. Players carry an `Inventory` with CS-style slots (primary,
  pistol, knife, potion) and per-gun ammo (magazine + reserve).
- **Shooting:** guns are hitscan.
  - Shared maths in `shared/spread.js` gives the client and the server the same pellet directions,
    because they're seeded per shot. That makes the shooter's tracers, bullet holes and sounds instant
    (`client/src/weapons/WeaponController.js`).
  - The server resolves the real hits (`GameRoom.resolveShot`). It checks head/body/legs hitboxes
    (`shared/game/BodyZones.js`) against where the shooter saw its targets: `shared/game/LagComp.js`
    rewinds them by up to 250 ms.
  - Rate of fire, magazines, reloads and deploy times are enforced on the server too.
- **Game modes (OOP):** `shared/game/modes/GameMode.js` holds the rules the room asks about:
  - spawn loadout and spawn zones;
  - who can hurt whom;
  - what a kill is worth;
  - when you respawn, and whether you're frozen;
  - match end;
  - the extra state clients see.

  `FreeForAll`, `GunGame`, `TeamBuy` and `Zombies` override what they need. Tuning is in
  `shared/config/modes.js`.
- **Maps** (`shared/world/maps/`) are lists of block boxes plus spawn zones, landmarks and a theme
  (sky, fog, what lies below). Block kinds and their properties are in `shared/world/blocks.js`:
  solid, breakable, bullet HP, grip and sound. Water isn't solid, and ice is slippery.
  - **Navigation knows about floors:** a place to stand is a column plus a height, so a house floor
    and its roof are different places for spawns, bots (A* in `Pathfinder.js`) and zombies.
  - **Zombies** are room NPCs. They share one flow field (`FlowField.js`, a BFS from every living
    player), so a horde costs one pass over the map per update, however big it is.
- **Feel:** most of the gun feel comes from the client, all of it pooled so a spray allocates
  nothing:
  - recoil view punch, a dynamic crosshair and weapon sway;
  - muzzle flashes, tracers, instanced bullet holes and impact chips (`client/src/effects/`);
  - layered gunshot sounds with a distant variant, distance low-pass and a shared reverb, plus
    near-miss whizzes, helmet dinks and footsteps by surface (`client/src/audio/`).
- **Characters (OOP):** `client/src/characters/CharacterModel.js` builds and animates a blocky rig
  (walk, crouch, aim, knife, recoil, reload, drink, hurt, death). `RobotModel`, `SquirrelModel`, `MarioModel`,
  `DrOctopusModel`, `BiologistModel` and `ProgrammerModel` override the build hooks. Dr Octopus also
  animates four mechanical tentacles; the biologist's ponytail sways and her sample glows; the
  programmer's glasses glint and the laptop on his back scrolls code.

### Adding a gun

1. Add its numbers to `WEAPONS` in `shared/config/weapons.js`: damage, rate, spread, recoil, ammo
   and price. It's registered as a `Gun` automatically.
2. Add its blocky model to `client/src/items/guns/specs.js`: the parts, the muzzle and the
   ejection port.
3. Optionally add `shot_<id>` and `shot_<id>_far` sounds in `client/src/audio/GunSounds.js`, or
   recorded samples (see below).

### Sounds

Every sound is synthesised by default. To use real recordings, put audio files in
`client/assets/sfx/` and map them in `client/assets/sfx/manifest.json`. Each name can have several
variations, and any name without a file keeps its synthesised version.
[`client/assets/sfx/SOURCES.md`](client/assets/sfx/SOURCES.md) lists every sound name and where to
find free (CC0 / royalty-free) gun recordings.

### Adding a map

1. Create `shared/world/maps/my_map.js`. It's a layout of `box(kind, x0, x1, z0, z1, y0, y1)`
   ranges (helpers such as `ring`, `house` and `stairs` are in `build.js`), plus `spawns` (tile
   rectangles for `t`, `ct` and `zombie`), `landmarks.sniperPerches` and a `theme`.
2. Register it in `shared/world/maps/index.js`, and list it under the modes that should offer it in
   `shared/config/modes.js`.
3. `test/maps.test.js` checks every map automatically: room to spawn, a route between the teams,
   reachable perches, unbreakable walls and a bot match.

### Adding a game mode

Extend `GameMode` in `shared/game/modes/`, register it in `modes/index.js`, describe it in
`MODES` (`shared/config/modes.js`), and give it a view in `client/src/ui/ModePanel.js` and columns
in `Scoreboard.js`.

### Adding a character

1. Add an entry to `shared/characters/definitions.js`.
2. Create a `CharacterModel` subclass in `client/src/characters/` and map it in `registry.js`.

## Development

Requires Node 22+.

```bash
npm install
npm run dev        # game server + game page at http://localhost:3000 (restarts on changes)
npm start          # game server only, as in production
npm test           # unit tests + simulated bot matches
npm run build:pages
```

To point any copy of the page at a different server, add `?server=<url>`, e.g.
`?server=http://localhost:3000`.

Bot behaviour is tuned in `BOT_SETTINGS` (`shared/ai/BotBrain.js`): reaction time, aim error,
burst length, headshot chance. Zombie waves are tuned in `ZOMBIES` (`shared/config/modes.js`). Bots navigate with A* (`shared/ai/Pathfinder.js`). Rules are in
`shared/constants.js`, gun balance in `shared/config/weapons.js`, and the arena layout in
`shared/world/layout.js`.

## Deploy

**Frontend (GitHub Pages):** `.github/workflows/pages.yml` tests and publishes on every push to `master`.
In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.

**Game server (Render free tier):** live at https://fallfightgameserver.onrender.com. It runs only the
multiplayer rooms; opening it in a browser shows a short status message, not the game.

| Render setting | Value |
|---|---|
| Root Directory | *(empty, the repo root)*: the server needs the game code in `shared/` |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |
| Build Filters (included paths) | `server/**`, `shared/**`, `package.json`, `package-lock.json` |
| Environment | `NODE_VERSION=22`, `CORS_ORIGIN=https://caglarsarikaya.github.io` |

**Server capacity** lives in [`shared/config/rooms.json`](shared/config/rooms.json):

```json
{ "maxRooms": 5, "maxPlayersPerRoom": 4 }
```

`maxRooms` is how many rooms can be open at once (quick and custom). `maxPlayersPerRoom` is the most
fighters a room can hold, bots included; room creators can pick fewer. Edit the file and push: the
server, the menu and offline play all read it.

`render.yaml` contains the same settings for a Blueprint deploy. The client finds the server through
`SERVER_URL` in `client/src/config.js`.

Free Render services sleep when idle, so the first visitor waits up to a minute while it wakes up.
The page starts waking the server as soon as it opens. If it isn't up 45 s after pressing Play, the
game starts offline with bots. `Dockerfile` is provided for other hosts.
