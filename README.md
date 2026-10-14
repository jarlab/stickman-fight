# Fourfold — Elemental Arena

A local, single-player browser brawler inspired by Little Fighter 2's crowd combat and elemental martial arts. Four original stick fighters, four Canvas arenas, zero runtime dependencies or external assets.

## Play locally

With Node.js installed, run:

```sh
npm start
```

Open **http://127.0.0.1:5173** in a desktop browser. No `npm install`, game editor, or build step is needed. Use `PORT=5174 npm start` to choose another port. Keep the server running while playing. Inputs use physical key positions.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move across the arena and through its depth |
| Double-tap left/right | Run while the direction remains held |
| Space | Jump; press again in the air for a double jump |
| Shift | Directional dodge / air dash |
| J | Melee; chain three taps for a knockdown finisher |
| J while running / airborne | Running attack / aerial attack |
| K | Elemental shot |
| L | Signature ability |
| I | Guard; raise it just before a frontal hit to parry |
| I → left/right → J | Elemental shot command (within 0.7 seconds) |
| I → up → J | Signature command (within 0.7 seconds) |
| E | Pick up an item, drink a potion, or drop a held weapon |
| U | Throw your weapon or crate |
| Escape | Pause / resume |
| R after a run | Retry |
| Tab / Enter | Navigate / activate menus |

**Match an opponent's lane to land melee and projectile hits.** Shadows show where jumping fighters will land. Watch enemy windups, guard toward an attacker, and move through depth to evade. Energy regenerates; melee hits and knockouts restore more. Weapons wear out. Knockdowns provide a brief protected recovery. Switching tabs automatically pauses.

## Fighters

- **Air / The wanderer:** fast movement, wind bolts, and a crowd-scattering cyclone.
- **Water / The tidekeeper:** slowing ice shots and a signature that heals while striking nearby enemies.
- **Earth / The sentinel:** armor, boulders, and a heavy seismic slam.
- **Fire / The spark:** a spreading ember volley, burning hits, and a damaging flare nova.

## Modes

All modes, classes, arenas and difficulties are available immediately.

- **Survival:** endless waves; an elemental guardian every third wave.
- **Training:** one sparring opponent, regenerating health/energy, unlimited lives.
- **Tournament:** three consecutive guardian fights.
- **Challenge:** defeat twelve opponents across three waves with one life.
- **Story:** four short combat stages through the elemental sanctuaries, each with a guardian. This is a combat prototype, not a narrative campaign.

Normal runs have three lives and no time limit. Easy/normal/hard adjust enemy strength and aggression. Bosses gain a second phase below half health. A cleared wave restores some health and energy.

Settings, best scores, furthest stages and completed runs save in this browser's local storage by mode/difficulty. Active fights restart after reload. Sound effects are optional synthesized tones; all art is drawn in code.

## Development

```sh
npm test       # Node gameplay tests
npm run check  # JavaScript syntax checks
```

- `src/engine.js`: combat, AI, waves, pickups, lives and modes.
- `src/physics.js`: ground-plane movement, bounds and jump height.
- `src/data.js`: classes, arenas and balance values.
- `src/renderer.js`: Canvas scenes, fighters and effects.
- `src/main.js`: fixed timestep, keyboard input, DOM HUD and local records.
- `server.mjs`: localhost static server.

The initial platform-arena direction was replaced with LF2-style depth movement at the user's request. There are no floating platforms, wall climbs or ring-outs in this version. Original artwork and characters are used; the supplied LF2 Windows executable is not required to play.
