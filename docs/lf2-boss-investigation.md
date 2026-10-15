# LF2 boss encounters, special selection and armor

Investigated on 15 October 2026 using REA 6.5.0, Ghidra 12.1.4 and the locally extracted LF2 v2.0a executable. The target is `output/lf2-analysis/extracted/lf2.exe`, SHA-256 **`12dfa00f6b767508612550e9ab27ab74b4201ff4cb9ff31d068925924eab8fc5`**. The game executable was not launched. This report interprets static evidence; decompiler output is not the original source.

## Evidence and scope

Complete matching REA records were reused rather than decompiling the same routines again. Two focused new queries followed the stage-update caller into encounter spawning. All raw records, decoded character files and assembly excerpts remain in ignored `output/lf2-analysis/`; none become browser assets.

| Routine | Retained evidence file | Evidence ID |
| --- | --- | --- |
| `0x403a40`, character-specific special decisions | `evidence/ai-specials.json` | `ev_6c1926badbd5e3a04fd04bba9ec23c401c63d049dd62308aa830bdee29f22755` |
| `0x42e100`, contact response and armor | `evidence/combat-procedure.json` | `ev_a42d5b3575ad4f50601cc7c04af5178c14e13815dd744d8e1af179545e46d298` |
| `0x40d960`, counter decay | `evidence/counter-update.json` | `ev_7bfc7706478c5e0b6d57cd48e82fc16b9a644afe38e9e3470b5d146050c46a5c` |
| `0x41bc90`, world update and resources | `evidence/input-world-loop.json` | `ev_f1de0e992ca71d696695d9d5d03dbd13771e5f7b330e34c1970c9ebfee39eaaf` |
| `0x412f40`, Defend–Jump–Attack recognition | `evidence/input-command-last.json` | `ev_612132879b108b31212a37a9a07b0d6d62c988f2d5c9b5fa9eb0d6189110b057` |
| `0x437860`, stage encounter update (new) | `evidence/boss-stage-update.json` | `ev_97e615c01a4a9afe5de62df723c705da36e2f42b542b71702fdd5a753cca23d2` |
| `0x437400`, stage entry spawning (new) | `evidence/boss-stage-spawn.json` | `ev_060d57ab9310903c12b433ad18deaaaa341239ae0bce56be8de433b63a1883fb` |

The extracted registry maps Julian to character ID 52, Firzen to 51, LouisEX to 50, Justin to 39 and Knight to 37. Character summaries are retained in `boss-frame-data.json`; relevant assembly in `boss-assembly-notes.txt`. Literal frame names below are identifiers from the data, not imported art or code.

## Bosses choose different tools for different situations

The native special controller does not simply make a normal fighter faster. It checks character identity, resources, target position and sometimes the target's current state. It then completes the same command-stage bytes used by ordinary command handling. Execution still depends on the current character frame accepting that command.

These are examples of eligible opportunities, not guaranteed actions on every update. Random gates and earlier branches also apply. Distances are native horizontal/depth units and should not be copied directly into Fourfold's arena.

| Character / opportunity | Observed conditions | Result established by command and DAT mapping |
| --- | --- | --- |
| Justin close attack | MP >100; horizontal gap <120; depth gap <10; target ahead of current facing | Down-Attack route to frame 240, a driving uppercut chain |
| Justin ranged attack | MP >100; horizontal gap <250; depth gap <10 | Forward-Attack route to frame 250, projectile startup |
| LouisEX ranged attack | MP >150; horizontal gap >90 and <500; depth gap <4 | Forward-Attack route to frame 260, air-push projectile; additional target-frame exceptions apply |
| LouisEX close attack | MP >75; horizontal gap <100; depth gap <7 | Down-Attack route to frame 240, spear chain |
| Julian close area attack | MP >125; horizontal gap <100; depth gap <30 | Up-Jump route to frame 310, explosion; this inspected branch additionally requires the target to be to Julian's right |
| Julian projectile volley | MP >125; horizontal gap <700; depth gap <150 | Forward-Attack route to frame 260 |
| Julian large projectile | MP >125; depth gap <20 | Forward-Jump route to frame 280; this branch has no additional horizontal-distance test |
| Firzen area attack | MP >300; horizontal gap <300; depth gap <200 | Up-Jump route to frame 249, volcano |
| Firzen ranged options | MP >300 and horizontal gap <950, or MP >250 with gap >40 and <1200 and depth gap <13 | Up-Attack disaster route, or Forward-Jump beam route respectively |

Justin's checks are at `0x405c2a–0x405d07`; LouisEX's at `0x405768–0x405860`; Julian's at `0x405d1a–0x405fc2`; Firzen's at `0x406043–0x406175`. The Julian right-side asymmetry is visible at `0x405def–0x405df5`; it should not be silently described as a symmetric area-defense rule.

Firzen also stops his beam when the target leaves its narrow lane: while his frame lies between 266 and 279, a depth gap above 13 or a non-character target causes a Defend input (`0x405fd4–0x40602c`). The beam frames explicitly expose a Defend/Jump exit to frame 280. This supports an enemy abandoning a committed ranged pattern when its aim becomes unsuitable.

## Commitment and reaction windows come from move data

Large attacks have different startup and recovery from ordinary punches. With the previously established `wait + 1` counter convention and nominal 30 Hz updates:

- Julian's explosion enters frame 310 and spawns its effect at frame 318 after **12 nominal samples, about 400 ms**. Frames 318–322 then occupy **31 samples, about 1.03 seconds**, before neutral. Those samples include the effect-spawning frame; they are not all guaranteed safe time because the spawned effect has its own lifetime.
- Julian's large ball at frame 280 similarly reaches its spawn frame 289 after **12 samples**. Its subsequent actor commitment is much shorter than the explosion's.
- Firzen's volcano goes through **state 7** during frames 250–257, then enters state 3 and spawns its effect at 258. This is explicit guarding during part of startup, not proof of total invulnerability. The spawn frame alone waits 20, giving 21 samples of commitment before its recovery tail.
- Justin's driving punch has nine nominal samples before frame 242's damaging uppercut. That contact specifies injury 55, fall 70 and a `(9, -10)` horizontal/upward vector. His ranged move has eight samples before spawning its projectile at 252.

These are static frame-chain intervals, not measurements of real input latency. Hitlag, body overlap, projectile travel and interruption affect actual contacts. The transferable principle is that a dangerous attack has a recognizable setup and a distinct commitment window.

## Julian's armor is pressure-sensitive

The contact handler checks Julian's ID 52 and his guard-pressure field at offset `0xb8`. While that field is **15 or less**, eligible contacts take the armor/blocked-response branch instead of the ordinary injury branch (`0x42e7ce–0x42e804`). Attack-object IDs 214 and 208 bypass this particular Julian armor test. Other interaction filters still apply; this is not a statement that every possible hit behaves identically.

Within the ordinary interaction-kind-0 reduced-response branch, damage is divided by **10** after any configured damage multiplier (`0x42ff52–0x42ff6a`), and the attack's `bdefend` is added to accumulated pressure (`0x43008e`). Contact pause is also assigned. Subsequent contacts can therefore encounter a broken armor threshold. Pressure decays by one on eligible counter updates at `0x40da28–0x40da35`; hitlag precedes that decay gate. A single weak attack followed by a long pause is different from sustained pressure.

Knight and ordinary Louis have separate conditions. Louis's ID is **6**, not LouisEX's 50, and his smaller armor allowance depends on state and attack effects. This investigation does not establish that every boss, or LouisEX, inherits Julian's armor.

The useful adaptation is a visible, breakable defensive resource with a real punish opportunity. Permanent stun immunity plus high HP would lose the pressure/response relationship demonstrated here.

## Health changes pressure without proving modern boss phases

At `0x41fa74–0x41faf2`, eligible MP regeneration samples use current HP clamped to 500. Julian and Firzen halve that clamped HP before calculating the increment:

`1 + floor((500 - floor(min(HP, 500) / 2)) / 100)`

Ordinary characters omit the inner halving. Thus Julian/Firzen receive 3 MP per eligible sample at HP 500 or above, and 5 at HP 100. Resource eligibility, a global cadence gate and the MP ceiling still apply; these numbers are **not MP per simulation frame or per second**. This can sustain more special attacks as a fight progresses, but is not a recovered discrete rage-phase state machine.

There is a specific health-gated transformation elsewhere: ordinary Louis's Defend–Jump–Attack transition to frame 300 requires **HP <=177** when the inspected override flag is zero (`0x412ffc–0x41300f`). Its data eventually reaches state 9995, and the world loop replaces his character data with LouisEX. This is a character-specific transformation route. It does not prove Julian or Firzen automatically acquire new attacks at particular health percentages.

No two- or three-phase HP script for Julian/Firzen was established in the inspected special-selection, resource and contact paths. Any explicit elemental phase thresholds, new move unlocks, phase-transition immunity or rage multipliers in Fourfold are authored design decisions.

## Encounter composition is separate from a boss's internal phases

`decoded/data/stage.txt` explicitly composes encounter `<phase>` blocks, with bosses, soldiers, health values and repeat entries. These are stage-wave records, not evidence of a single boss changing phase at low HP.

The first survival boss sequence configures LouisEX with 400 HP, Firzen with 500 and Julian with 600, together with soldier entries. Later survival entries raise those values and combine bosses. Stage 5-5's final block configures Julian with **2500 HP** alongside repeated soldier entries, including Knight and Justin. The `<boss>` tag is also attached to other character entries elsewhere, so it should not be interpreted as a unique hardcoded class containing only Julian/Firzen/LouisEX.

The newly queried spawn routine at `0x437400` consumes a stage entry's configured health and writes current, recoverable and maximum HP together (`0x437745–0x43775f`), with MP initialized to 500. For Easy (difficulty value 2), non-ID-300 entries scale HP by **0.75**; the value -1 branch scales by **1.5**. Normal/Hard use the unmodified value in this routine. The multiply instructions are at `0x437466–0x437489`; the referenced PE constants at `0x4479a0` and `0x449d28` decode to 1.5 and 0.75. This illustrates why a DAT health value should be identified as configured health, not an unconditional gameplay measurement.

The stage update iterates explicit entry quotas and calls the same spawn routine again for eligible exhausted slots. Its final phase-clear scan refuses to declare the encounter clear while an active type-0, team-5 character remains in enemy slots (`0x438070–0x438111`). It also tracks a separate role field and repeat quotas; this investigation has not traced the parser sufficiently to assign every numeric role to the literal `<boss>`/`<soldier>` tags or fully derive participant-dependent `ratio` rules. Thus killing the named boss alone should not be described as the only universally proven completion condition.

## Adaptation boundaries for Fourfold

The investigation supports range-aware special selection, distinguishable attack commitments, interruptible or breakable defensive states, resource-dependent pressure and deliberate boss/add composition. The following elemental design directions are independent adaptations of those principles and the user's requested styles:

| Element | Tactics to preserve | Readable counterplay |
| --- | --- | --- |
| Fire | Aggressive pursuit, driving combinations, advancing bursts | Sidestep the committed rush; punish its recovery |
| Air | Evasive spacing, fewer initiations, displacement and whiff punishment | Close space during recovery; avoid chasing its retreat blindly |
| Earth | Defensive anchoring, temporary armor and heavy area strikes | Build pressure to break its guard; leave the announced impact area |
| Water | Yielding movement, reactive guards, redirection and counters | Bait the counter, change lane, then attack the recovery |

Explicit phase thresholds and tactics should be reported as Fourfold behavior after implementation and tests. Crowds must retain bounded attack commitments, and boss moves should preserve the existing knockdown/recovery exits. Native distances, resources, damage values and proprietary character frames are references, not copied implementation constants.

## Limits and validation

Target identity was checked on reused and new evidence, and critical thresholds were cross-checked against retained x86 disassembly. Character/encounter observations come from the supplied game's decoded files. The focused native session was closed and retained as `boss-session-snapshot.json`. No Windows gameplay, frame capture or live boss fight was performed. This research does not establish every projectile exception, full armor coverage, every stage parser rule or exact human-perceived difficulty.


## Implemented Fourfold encounters

The browser game now has original named guardians and twelve techniques:

| Guardian | First phase | Second phase at 50% HP |
| --- | --- | --- |
| Zephyr / Air | Fixed wind lane; quick retreat into a low counter gust | Three staggered cyclones with gaps, plus a short retreat when crowded |
| Neris / Water | Guarded yielding tide; narrow ice lance | Alternating low tide pools across lanes |
| Boros / Earth | Armored quake startup; marked stone pillars | Sequential faultline fractures |
| Cinder / Fire | Advancing charge; sweeping flame with one light-hit poise | Three delayed eruption marks |

Warnings lock their coordinates when the move starts. Floor waves can be jumped, lane attacks sidestepped, and tall eruptions/pillars escaped by leaving their marks. Startup lasts at least 0.5 seconds; normal recovery lasts 0.8–1.1 seconds. Emitted pulses contact once. The existing guard/parry, damage, hitlag, knockdown, life and crowd systems still apply. Earth startup armor drops before recovery; Fire sweep loses its poise after one light contact and heavy strikes interrupt it immediately. Water can complete its counter after blocking a hit, but a flank or guard break interrupts it. Phase transitions wait for an available crowd commitment, grant neither healing nor invulnerability, and unlock authored patterns rather than reproducing an LF2 phase script.

Ordinary opponents now use their playable element's health on every difficulty (100/115/145/105 for Air/Water/Earth/Fire). Boss health remains a separate larger encounter pool.

Validation: 275 gameplay tests pass, including 28 boss tests for natural AI activation, all four phase changes, telegraph timing, jump/lane/guard counterplay, interruption, finite Fire poise, Water counter continuation, crowd reservations and death/respawn cleanup. Independent 30-second simulations of each boss on each difficulty with nine ordinary enemies kept state finite and offensive peaks within 1/2/3. Browser keyboard fights exercised every guardian and half-health transitions. Full and reduced motion were checked, with warnings and recovery hints inspected. The browser console reported zero errors/warnings; screenshots and raw evidence remain in ignored output folders. LF2 itself was not executed.
