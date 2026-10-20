# Fourfold — Elemental Beat-em-up

A local, single-player browser beat-em-up inspired by Little Fighter 2's crowd combat and elemental martial arts. Four original stick fighters, four side-scrolling stages plus arena modes, zero runtime dependencies or external assets.

## Play locally

With Node.js installed, run:

```sh
npm start
```

Open **http://127.0.0.1:5173** in a desktop browser. No `npm install`, game editor, or build step is needed. Use `PORT=5174 npm start` to choose another port. Keep the server running while playing. Inputs use physical key positions.

Choose **Journey** for the side-scrolling game. Clear each group, then follow **GO →** along the road. Every stage has two crowd encounters and an elemental guardian; walk through the exit to reach the next stage. Journey is the default for new players; existing browsers keep their saved mode selection.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move across the arena and through its depth |
| Double-tap left/right | Run while the direction remains held |
| Space | Jump; press again in the air for a double jump |
| Shift | Directional dodge / air dash |
| Shift + direction near landing / while down | Recovery roll; no energy cost |
| J | Tap with each jab's recovery; a recent tap queues the next strike |
| J while holding an enemy | Punch once; tap late in recovery to queue another punch |
| J while running / airborne | Running attack / aerial attack |
| Up + J while grounded and unarmed | Elemental launcher; costs 8 energy |
| Space + J after a launcher hits | Jump follow-up into an aerial chain |
| K | Elemental shot |
| L | Signature ability |
| I | Guard; raise it just before a frontal hit to parry |
| I → left/right → J | Elemental shot command |
| I → up → J | Signature command |
| E | Grab a nearby dizzy enemy while unarmed / release; otherwise pick up, drink or drop |
| U | Throw a held enemy into the crowd, or throw your weapon |
| Escape | Pause / resume |
| R after a run | Retry |
| Tab / Enter | Navigate / activate menus |

**Match an opponent's lane to land melee and projectile hits.** Shadows show where jumping fighters will land. Watch enemy windups, guard toward an attacker, and move through depth to evade. Energy regenerates; melee hits and knockouts restore more. Weapons wear out. Knockdowns provide a brief protected recovery. Switching tabs automatically pauses.

Movement uses a deliberate LF2-inspired pace. Walk to adjust your lane; double-tap left/right to run forward with shallower depth steering. Air remains the quickest and Earth the most grounded. Dodges and recovery rolls cover a short escape distance. Jump arcs and combo input windows retain their responsive timing. The [movement investigation](docs/lf2-movement-investigation.md) records the extracted LF2 ratios and our original arena tuning.

Tap **J** toward the end of each jab to keep attacking. One recent input is remembered for about **167 ms**, including time spent in a contact pause; holding the key does not repeat attacks. Ordinary jabs complete their recovery before the next strike. They alternate until an opponent's stagger or broken guard opens a close-range elemental finisher, so the third press is not automatically a heavy attack. The small hit streak beside your score counts confirmed hits and expires after a pause in contact.

After a melee hit connects, **K** or **L** can cancel during its follow-up window if you have enough energy and the power is ready. Air can jump or dash out of a confirmed hit; Fire can dash. These elemental options are deliberate additions to the LF2-inspired jab rhythm. Commands such as **I → right → J** remember their ordered steps without a time limit; a conflicting fresh input or a second **I** clears the pending sequence.

**Launch and follow:** hold **W / ↑** and tap **J**, release up, then press **Space + J** after the launch connects. Tap **J** late in each aerial strike's recovery to continue. All elements can chase a confirmed launcher; a whiff or successful block must recover. Air and Fire have three aerial strikes, Water and Earth have two. Contacts earn a brief lift to keep the route reachable, while the final strike knocks the target away or down. Weak standing jabs cannot extend a launched victim. Damage scales down across a juggle, and four qualifying hits force ordinary opponents into protected knockdown. The aerial attack budget resets on landing, not double jumps. Weapons share their wielder's aerial route, but launchers require empty hands.

After an enemy staggers and shows stars, approach unarmed and press **E** to grab. Press **J** to punch without releasing your grip. Each punch has startup, a single impact and full recovery; a late J or U queues the next punch or throw. Turn left or right, then press **U** to throw; hold up/down with U to aim through depth. The flying body can knock down multiple opponents, then takes damage on landing. **E** releases without throwing. You stand still and remain vulnerable while holding someone; they escape after a short time, and guardians break free faster. Punches do not renew the hold. Enemies can catch you after making you dizzy, pause, punch once and throw you. Other enemies stop starting attacks while you are held or thrown; landing leads into the normal protected knockdown recovery.

**Recovery rolls:** tap **Shift + a direction** just before landing or while knocked down. You briefly settle, then roll across the floor or into another depth lane. The roll carries you through a crowd, protects its opening, and has a short vulnerable finish. Direction is committed; attacks cannot cancel it. A near-landing tap uses the normal short input buffer, while an early airborne tap expires. Throw landing damage still applies before recovery. Waiting for the normal get-up remains available.

Contact briefly holds the two fighters while the surrounding crowd keeps moving. Quick, connected jabs build stagger pressure and step forward during recovery; leaving a gap lets pressure drain. Sustained pressure can make an opponent dizzy, then knock them down. Projectiles hold their victim without stopping the caster.

## Fighters

- **Air / The wanderer — Rising wind:** circular palms, evasive footwork and a rising lift. Three quick aerial strikes end in a descending heel. Wind bolts and a cyclone control crowds.
- **Water / The tidekeeper — Tidal counter:** yielding sweeps and redirection draw foes close, then flowing aerial palms push them away. The ground finisher freezes; a successful parry empowers the next strike. Ice shards and a healing tide support counterattacks.
- **Earth / The sentinel — Mountain breaker:** rooted stances, armored uppercuts and heavy hammers. The two-strike aerial route ends in a steep downward smash. Ground finishers break guards; boulders and seismic slams punish opponents who stay in range.
- **Fire / The spark — Blazing rush:** direct uppercuts and advancing flying kicks. Three aerial strikes carry opponents forward into a forceful heel finish. Cancel confirmed hits into embers or a flare nova to sustain pressure.

## Modes

All modes, classes, arenas and difficulties are available immediately. **Enemies per group** in Journey, or **Enemies per wave** in arena modes, offers Auto or **1–12** opponents. Custom counts include the guardian on boss encounters. Training replenishes that many sparring partners. Counts persist between visits and have separate personal bests.

- **Survival:** endless waves; an elemental guardian every third wave.
- **Training:** sparring opponents, regenerating health/energy, unlimited lives; one partner on Auto.
- **Tournament:** three consecutive guardian fights; custom counts add supporting enemies.
- **Challenge:** three waves with one life; twelve opponents on Auto, or three times your selected count.
- **Journey:** travel right through Air, Water, Earth and Fire stages. The camera locks during a fight and follows you between encounters. Auto spawns three opponents in the first group, four in an ambush, then a guardian with two supporters. Clearing a group opens the route and restores some health and energy. Death returns you to that encounter's checkpoint, preserving damage to surviving enemies. This is a short combat campaign.

Normal runs have three lives and no time limit. Regular enemies have the same health as a playable fighter of their element: Air 100, Water 115, Earth 145, Fire 105, on every difficulty. Difficulty scales AI skill: awareness, prediction, defensive choices, combo use and crowd coordination. Movement speed, damage, health, attack animation windows and mechanical cooldowns remain identical for an equivalent fighter across all difficulties. Bosses retain larger encounter health pools with the same values on every difficulty. A cleared wave restores some health and energy.

**Crazy** is available immediately above Hard. Up to four enemies coordinate attacks, with the strongest awareness and prediction. They evaluate projectile escape lanes and recognize visible guard-breaking attacks when choosing a defense. Their attacks keep the same windup and recovery as on Easy, Normal and Hard; boss warnings and pauses also remain consistent. Crazy has its own saved personal bests.

Each guardian has two situational techniques and a new pattern at half health. Fire charges and sweeps before unleashing Wildfire eruptions. Air retreats into gusts and then surrounds space with cyclones. Earth braces for quakes and pillars before opening sequential faultlines. Water yields behind a guarded counter, then fills alternating lanes with rising tides. Floor markings lock when a move starts: sidestep lanes, jump low waves, leave pillar/eruption marks, and attack during the clearly labeled recovery. Boss phase changes grant no healing or invulnerability.

Enemy decisions use visible movement and short-lived attack history. Repeated projectiles encourage flanking, repeated jabs encourage a defensive beat and counter, and retreating targets can provoke a dash pursuit. Nearby fighters receive useful attack turns while crowds retain their Easy/Normal/Hard/Crazy limits of 1/2/3/4 simultaneous offensive commitments. Normal/Hard/Crazy enemies also use recovery rolls after knockdown.

See [the LF2 boss investigation](docs/lf2-boss-investigation.md) for the REA evidence and the distinction between recovered behavior and our original elemental encounters.

Enemies line up with your lane before striking, move around blocked approaches, and spread to both sides when there is room. Easy, Normal, Hard and Crazy allow one, two, three and four simultaneous attack commitments respectively, including aerial pursuits. Fire rushes in and keeps pressure on; Air stays outside the pocket, evades diagonally and probes for openings; Earth holds its ground and guards approaches; Water guards, redirects and returns with a counter. Normal/Hard/Crazy enemies predict visible movement and projectile paths, choose attacks by their usefulness in the current situation, punish missed attacks or exposed landings, complete earned air combos and roll out of knockdowns. Decisions have reaction delays, committed movement and normal resource costs. Easy retains slower decisions and ordinary get-up recovery. Enemies respect protected knockdowns and wait for you to become vulnerable.

Crowds approach as a main group with up to two flankers. Nearby reserves form compact second rows, so existing multi-target punches, elemental finishers and body throws can catch several opponents. Reserves keep approaching when front fighters anticipate a jab, but still defend against an actual incoming strike. The closer formations do not increase attack speed, damage or simultaneous attack limits.

Settings, best scores, furthest stages and completed runs save in this browser's local storage by mode/difficulty. Active fights restart after reload. Optional synthesized sound distinguishes landed hits, heavy impacts, blocks, parries and landings; all art is drawn in code. Distinct martial stances, casting windups, air crescents, water ribbons, stone fists and flame lashes make each element read differently. Confirmed hits add elemental splashes and stronger local impact cues. Signatures produce cyclones, curling tidal crests, stone columns and flame novas. Reduced motion removes the roll spin, gathering orbit and extra debris while keeping clear action silhouettes and simple signature outlines.

## Development

```sh
npm test       # Node gameplay tests
npm run check  # JavaScript syntax checks
```

- `src/engine.js`: combat, waves, pickups, lives and modes.
- `src/stages.js`: scrolling Journey routes, encounter gates, checkpoints and stage exits.
- `src/enemy-ai.js`: enemy approach, crowd spacing, reactions and attack selection.
- `src/grapples.js`: linked holds, held punches, escape, body throws, crowd contacts and landing injury.
- `src/physics.js`: ground-plane movement, bounds and jump height.
- `src/data.js`: classes, arenas and balance values.
- `src/renderer.js`: Canvas scenes, fighters and effects.
- `src/input.js`: physical key state, press edges and directional command recognition.
- `src/main.js`: fixed timestep, browser events, DOM HUD and local records.
- `server.mjs`: localhost static server.

The initial platform-arena direction was replaced with LF2-style depth movement at the user's request. There are no floating platforms, wall climbs or ring-outs in this version. Original artwork and characters are used; the supplied LF2 Windows executable is not required to play.

The [LF2 combat investigation](docs/lf2-combat-investigation.md) records the extracted character-data findings, REA/Ghidra evidence and the adaptations made here. Original LF2 assets and analysis tools are excluded from the game source.

The [LF2 enemy AI investigation](docs/lf2-ai-investigation.md) records native targeting, spacing, attack and defense findings. Surrounding positions and coordinated attack turns are original adaptations for Fourfold, rather than claims of a recovered LF2 formation system.

The [LF2 grab and throw investigation](docs/lf2-grab-investigation.md) records the native dizzy-state catches, grip budget, thrown-body attacks and separate landing injury behind our E/U adaptation.

The [LF2 held-punch and enemy-grab investigation](docs/lf2-grab-punch-investigation.md) records single-contact grip strikes, their startup/recovery, shared AI action inputs, and the limits of the recovered enemy policy.

The [LF2 knockdown and rolling investigation](docs/lf2-recovery-investigation.md) distinguishes native aerial recovery, ground rolling and get-up protection from our directional roll after knockdown.

The [LF2 aerial combat investigation](docs/lf2-aerial-investigation.md) records separate airborne attacks, contact eligibility, launch vectors and landing behavior, alongside our original elemental chains and juggle limits.
