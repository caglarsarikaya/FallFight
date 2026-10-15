# Sound samples

Every sound in the game has a synthesised version built in, so the game works with this folder empty. Dropping in real recordings makes the guns sound far more real. This file lists the sound names the game asks for and where to find recordings you're allowed to ship.

## How to add a sound

1. Put the file in this folder. Use `.ogg` (small and plays in every browser); `.mp3` and `.wav` also work.
2. Map its name in `manifest.json`. Listing several files under one name gives each play a random pick, so repeated shots don't sound like a loop:
   ```json
   { "shot_ak47": ["ak47_1.ogg", "ak47_2.ogg", "ak47_3.ogg"] }
   ```
3. Reload the page. A file that's missing or broken falls back to the synthesised sound.

Keep files short and trim the silence at the start. A gunshot should start on its very first sample, or the shot feels laggy. Mono files at 44.1 kHz and roughly 64–96 kbps are plenty, since the game does the stereo panning itself.

**Don't use Counter-Strike's own sounds.** They're Valve's copyright. Use CC0 or royalty-free recordings and keep a note of where each one came from below.

## Names the game asks for

### Gunshots
Each gun has a close sound and a far sound. Past about 50 blocks the game plays `_far`, which should be the muffled boom and echo of the same gun heard from a distance.

| Gun | Close | Far |
|---|---|---|
| Glock-18 | `shot_glock` | `shot_glock_far` |
| USP .45 (suppressor off) | `shot_usp` | `shot_usp_far` |
| Desert Eagle | `shot_deagle` | `shot_deagle_far` |
| MP5 | `shot_mp5` | `shot_mp5_far` |
| P90 | `shot_p90` | `shot_p90_far` |
| M3 shotgun | `shot_m3` | `shot_m3_far` |
| AK-47 | `shot_ak47` | `shot_ak47_far` |
| M4A1 | `shot_m4a1` | `shot_m4a1_far` |
| Scout (bolt rifle) | `shot_scout` | `shot_scout_far` |
| AWP (.338 magnum) | `shot_awp` | `shot_awp_far` |

### Handling
| Name | What it is |
|---|---|
| `dryfire` | trigger click on an empty gun |
| `clipout` / `clipin` | magazine out / in |
| `boltpull` | charging handle or bolt cycling (rifles after reload, snipers after each shot) |
| `pump` | shotgun pump |
| `shellIn` | one shotgun shell loaded |
| `shell` | a spent casing tinkling on the floor |
| `deploy` | drawing a weapon |
| `zoom` | scope click |

### Knife
| Name | What it is |
|---|---|
| `knifeSlash` / `knifeStab` | swishes |
| `knifeHit` | blade into a body |
| `knifeWall` | blade hitting stone or wood |

### Hits and impacts
| Name | What it is |
|---|---|
| `hitFlesh` | bullet into an unarmoured body |
| `hitKevlar` | bullet into a vest |
| `headshotHelmet` | the helmet "dink" |
| `headshotFlesh` | headshot without a helmet |
| `impactStone` / `impactWood` / `impactDirt` | bullets hitting blocks |
| `whiz` | a bullet passing just past your head |

### Body and world
| Name | What it is |
|---|---|
| `step` / `stepStone` / `stepWood` | footsteps on grass, stone and planks |
| `jump` / `land` | jumping and landing |
| `hurt` / `death` | getting hurt / dying |
| `heartbeat` | at low health |
| `crack` / `break` / `restore` | a block cracking, breaking and regrowing |
| `ammoPickup` / `armorUp` / `pickup` / `heal` / `drink` | pickups and the potion |

## Where to find free recordings

- **Freesound** (https://freesound.org): filter the licence to *Creative Commons 0*. Useful searches are "rifle shot outdoor", "AK47", "9mm pistol", "shotgun pump", "magazine reload", "bullet impact concrete", "bullet whiz" and "casing drop".
- **Sonniss GDC Game Audio Bundles** (https://gdc.sonniss.com): several free, royalty-free packs with professional firearm recordings, licensed for commercial games.
- **OpenGameArt** (https://opengameart.org): check that each file's licence is CC0 or CC-BY, and credit CC-BY authors below.

## Credits

List every file you add here, with its author, source link and licence.

| File | Author | Source | Licence |
|---|---|---|---|
| | | | |
