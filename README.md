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
| J | Tap with each jab's recovery; a recent tap queues the next strike |
| J while running / airborne | Running attack / aerial attack |
| K | Elemental shot |
| L | Signature ability |
| I | Guard; raise it just before a frontal hit to parry |
| I → left/right → J | Elemental shot command |
| I → up → J | Signature command |
| E | Pick up an item, drink a potion, or drop a held weapon |
| U | Throw your weapon or crate |
| Escape | Pause / resume |
| R after a run | Retry |
| Tab / Enter | Navigate / activate menus |

**Match an opponent's lane to land melee and projectile hits.** Shadows show where jumping fighters will land. Watch enemy windups, guard toward an attacker, and move through depth to evade. Energy regenerates; melee hits and knockouts restore more. Weapons wear out. Knockdowns provide a brief protected recovery. Switching tabs automatically pauses.

Tap **J** toward the end of each jab to keep attacking. One recent input is remembered for about **167 ms**, including time spent in a contact pause; holding the key does not repeat attacks. Ordinary jabs complete their recovery before the next strike. They alternate until an opponent's stagger or broken guard opens a close-range elemental finisher, so the third press is not automatically a heavy attack. The small hit streak beside your score counts confirmed hits and expires after a pause in contact.

After a melee hit connects, **K** or **L** can cancel during its follow-up window if you have enough energy and the power is ready. Air can jump or dash out of a confirmed hit; Fire can dash. These elemental options are deliberate additions to the LF2-inspired jab rhythm. Commands such as **I → right → J** remember their ordered steps without a time limit; a conflicting fresh input or a second **I** clears the pending sequence.

Contact briefly holds the two fighters while the surrounding crowd keeps moving. Quick, connected jabs build stagger pressure and step forward during recovery; leaving a gap lets pressure drain. Sustained pressure can make an opponent dizzy, then knock them down. Projectiles hold their victim without stopping the caster.

## Fighters

- **Air / The wanderer — Rising wind:** quick palms build an opening for a rising kick that launches the opponent. Jump after contact to follow up in the air. Wind bolts and a cyclone control crowds.
- **Water / The tidekeeper — Tidal counter:** alternating strikes draw opponents close; the finisher freezes a vulnerable opponent. Strike frozen enemies to shatter them. A successful parry empowers the next strike. Ice shards and a healing tide support this counterattacking style.
- **Earth / The sentinel — Mountain breaker:** deliberate, planted blows gain armor on follow-ups. The finisher is a guard-breaking slam that spikes airborne opponents down. Boulders and seismic slams punish opponents who stay in range.
- **Fire / The spark — Blazing rush:** fast strikes advance into a vulnerable opponent, opening a forceful rush finisher. Cancel a confirmed hit into an ember volley or flare nova to maintain pressure and burn opponents.

## Modes

All modes, classes, arenas and difficulties are available immediately.

- **Survival:** endless waves; an elemental guardian every third wave.
- **Training:** one sparring opponent, regenerating health/energy, unlimited lives.
- **Tournament:** three consecutive guardian fights.
- **Challenge:** defeat twelve opponents across three waves with one life.
- **Story:** four short combat stages through the elemental sanctuaries, each with a guardian. This is a combat prototype, not a narrative campaign.

Normal runs have three lives and no time limit. Easy/normal/hard adjust enemy strength and aggression. Bosses gain a second phase below half health. A cleared wave restores some health and energy.

Settings, best scores, furthest stages and completed runs save in this browser's local storage by mode/difficulty. Active fights restart after reload. Optional synthesized sound distinguishes landed hits, heavy impacts, blocks, parries and landings; all art is drawn in code.

## Development

```sh
npm test       # Node gameplay tests
npm run check  # JavaScript syntax checks
```

- `src/engine.js`: combat, AI, waves, pickups, lives and modes.
- `src/physics.js`: ground-plane movement, bounds and jump height.
- `src/data.js`: classes, arenas and balance values.
- `src/renderer.js`: Canvas scenes, fighters and effects.
- `src/input.js`: physical key state, press edges and directional command recognition.
- `src/main.js`: fixed timestep, browser events, DOM HUD and local records.
- `server.mjs`: localhost static server.

The initial platform-arena direction was replaced with LF2-style depth movement at the user's request. There are no floating platforms, wall climbs or ring-outs in this version. Original artwork and characters are used; the supplied LF2 Windows executable is not required to play.

The [LF2 combat investigation](docs/lf2-combat-investigation.md) records the extracted character-data findings, REA/Ghidra evidence and the adaptations made here. Original LF2 assets and analysis tools are excluded from the game source.
