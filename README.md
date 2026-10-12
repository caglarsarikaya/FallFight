# FallFight

A Minecraft-style arena fighter that runs in the browser. Pick a fighter, then shoot, chop and
**break the floor under your opponents** so they fall into the lava.

**▶ Play: https://caglarsarikaya.github.io/FallFight/**

- **Play vs Bots** works anywhere, with no server: the whole game runs in your browser.
- **Play Online** turns on once a multiplayer server is configured (see [Deploy](#deploy)).

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
| 🏹 Bow | 20 damage. Hold to draw (longer = faster, flatter arrow). Arrows fly with gravity. Start with 5 arrows |
| 🪓 Axe | 10 damage at close range. Hit the floor to crack a block: it breaks after 0.4 s and regrows after 20 s |
| 🧪 Health potion | Heals 20 HP, one use. Every kill rewards **one** potion |
| Pickups | Every 15 s: +3 arrows. Every 60 s: a health potion. The first player to walk through it gets it |
| Falling | Fall into the void and you die. Whoever hit you or broke your block in the last 10 s gets the kill |

On respawn you get 100 HP, 5 arrows and no potions.

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
  (walk, chop, bow draw, drink, hurt, death). `RobotModel`, `SquirrelModel`, `MarioModel` and
  `DrOctopusModel` override the build hooks. Dr Octopus also animates four mechanical tentacles.

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
npm start          # http://localhost:3000. Serves the game and hosts online rooms
npm run dev        # same, restarting on changes
npm test           # unit tests + simulated bot matches
npm run build:pages
```

Bot behaviour is tuned in `BOT_SETTINGS` (`shared/ai/BotBrain.js`). Rules and balance are in
`shared/constants.js`.

## Deploy

**Frontend (GitHub Pages):** `.github/workflows/pages.yml` tests and publishes on every push to `master`.
In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.

**Multiplayer server (Render free tier):**
1. On render.com, choose **New → Blueprint** and select this repo. `render.yaml` sets everything up.
2. Copy the service URL (e.g. `https://fallfight.onrender.com`) into `SERVER_URL` in
   `client/src/config.js` and push.

Free Render services sleep when idle, so the first visitor waits about a minute while it wakes up.
The menu shows the server status. Empty rooms are topped up with bots (`BOTS_FILL`, default 4
players), so there is always someone to fight. `Dockerfile` is provided for other hosts.
