# FallFight

A Minecraft-style arena fighter that runs in the browser. Pick a fighter, then shoot, chop and
**break the floor under your opponents** so they fall into the lava.

**▶ Play: https://caglarsarikaya.github.io/FallFight/**

- **Quick Play** puts you in a public room. Rooms are always full: bots fill the empty seats, and a bot
  steps out whenever a person joins. If the game server can't be reached (or is full), you play the
  same game against bots in your browser.
- **Rooms**: create your own room with a name, an optional password, a player count, and a choice to
  **fill empty seats with bots** or play **friends only**. Friends see it in the room list and join it
  (entering the password if there is one).

## How to play

| Key | Action |
|---|---|
| WASD | Move |
| Space | Jump |
| Mouse | Look |
| Left click | Use the selected item. Hold to draw the bow, hold to keep chopping |
| 1 / 2 / 3, mouse wheel | Bow / Axe / Health potion |
| V (or F5) | Switch between first and third person |
| Tab | Scoreboard |
| Esc | Menu: change character or nickname, camera, sound, mouse sensitivity |

**Characters:** Robot, Squirrel, Mario, Dr Octopus. They all have the same stats; only the looks differ.
Your nickname, character and settings are remembered in the browser.

### Rules

| | |
|---|---|
| Health | 100 HP. Respawn after 3 s with 2 s of spawn protection. Attacking ends the protection |
| 🏹 Bow | Hold to draw: a longer draw flies faster and hits harder. Arrows fly straight (no drop). Start with 20 arrows |
| 🎯 Hit zones | Legs 8–24, body 12–35, head 50–80 (scaled by draw). A **full-draw arrow to the head kills in one shot**; two slow head shots kill |
| 🪓 Axe | 10 damage at close range. Hit any block to crack it: it breaks after 0.4 s and regrows after 20 s |
| 🧱 Arena | 60 × 60 blocks over lava: a central stone plaza with cover walls, four plank lookouts (2 high), crates and low walls to hide behind. Walls stop arrows and axes, and they can be chopped too |
| 🏰 Sniper towers | Four 8-high stone towers near the corners. Climb the plank stairs (one jump per step) to a top with a parapet: hide in the middle, step to the edge to shoot down. Chop the stairs to cut a sniper off |
| 🧪 Health potion | Heals 20 HP, one use. Every kill rewards **one** potion |
| Pickups | Every 15 s: +3 arrows. Every 60 s: a health potion. They can appear on platforms too. The first player to walk through one gets it, and the bots race you for them |
| Falling | Fall into the void and you die. Whoever hit you or broke your block in the last 10 s gets the kill |

On respawn you get 100 HP, 20 arrows and no potions.

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
  Item ─┬─ Weapon ─┬─ MeleeWeapon ── Axe
        │          └─ RangedWeapon ── Bow
        └─ Consumable ── HealthPotion
  ```

  Each item has a matching `ItemView` on the client (`client/src/items/`): its 3D model,
  first-person animation and hotbar icon. Players carry an `Inventory`: a hotbar with one selected
  item, plus counters for ammo and stacks.
- **Characters (OOP):** `client/src/characters/CharacterModel.js` builds and animates a blocky rig
  (walk, chop, bow draw, drink, hurt, death). `RobotModel`, `SquirrelModel`, `MarioModel`,
  `DrOctopusModel`, `BiologistModel` and `ProgrammerModel` override the build hooks. Dr Octopus also
  animates four mechanical tentacles; the biologist's ponytail sways and her sample glows; the
  programmer's glasses glint and the laptop on his back scrolls code.

### Adding a weapon

1. `shared/items/MyWeapon.js`: extend `MeleeWeapon` or `RangedWeapon` (or `Item`) and implement `use(ctx)`.
2. Register it in `shared/items/ItemRegistry.js`. Add it to `DEFAULT_HOTBAR` if everyone should carry it.
3. `client/src/items/MyWeaponView.js`: extend `ItemView` (model, poses, animation, icon) and add it
   to `client/src/items/registry.js`.

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

Bot behaviour is tuned in `BOT_SETTINGS` (`shared/ai/BotBrain.js`). Bots navigate with A*
(`shared/ai/Pathfinder.js`). Rules and balance are in `shared/constants.js`, and the arena layout
(platforms and walls) is in `shared/world/layout.js`.

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
