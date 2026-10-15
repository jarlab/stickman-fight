# LF2 aerial attacks and juggling investigation

Static investigation of the supplied LF2 v2.0a executable and extracted character data on 15 October 2026. The goal is to inform independent aerial combat for Fourfold, including distinct launchers, useful air follow-ups and bounded crowd interactions. This is not a frame-perfect recreation. No installer or game process was executed, and no original code, sprites, sounds or character data are used by the browser game.

## Provenance and evidence

Target SHA-256: `12dfa00f6b767508612550e9ab27ab74b4201ff4cb9ff31d068925924eab8fc5`, the previously extracted `output/lf2-analysis/extracted/lf2.exe`. Matching complete REA evidence from earlier investigations was reused. A focused REA 6.5.0/Ghidra 12.1.4 session added two missing contact-processing procedures, then closed successfully with `output/lf2-analysis/aerial-session-snapshot.json` containing those two records. The MCP client exited successfully.

Function names here describe inferred responsibilities. Addresses are virtual addresses in this exact executable. Local records below are under ignored `output/lf2-analysis/evidence/`.

| Procedure | Record | REA evidence ID |
|---|---|---|
| `0x413080`, action routing | `input-dispatch.json` | `ev_319c1cacbe810efdad03558eff011d3d8f10a287c5251e66e74a0057246739cd` |
| `0x417400`, contact geometry and falling-target filter | `input-hit-geometry.json` | `ev_5d6fce286091c9fa1effa478d9736ecefefc093ed614f6bd766bbdceb37fa9a2` |
| `0x42e100`, contact effects, fall pressure and launch vector | `combat-procedure.json` | `ev_a42d5b3575ad4f50601cc7c04af5178c14e13815dd744d8e1af179545e46d298` |
| `0x40e490`, physics and landing | `fighter-tick.json` | `ev_e41737e9992b34b3006f8c5c3a3f86b1b3b1cd78ac02ce387ebbca34f6aa3646` |
| `0x40d960`, frame and counter progression | `counter-update.json` | `ev_7bfc7706478c5e0b6d57cd48e82fc16b9a644afe38e9e3470b5d146050c46a5c` |
| `0x41bc90`, update ordering | `input-world-loop.json` | `ev_f1de0e992ca71d696695d9d5d03dbd13771e5f7b330e34c1970c9ebfee39eaaf` |
| `0x419380`, collision scheduling and rest bookkeeping | `aerial-contact-resolution.json` | `ev_e494b57e46e6057476315d408e9460a32f793a6c28539d729d8b997f8de4bdc5` |
| `0x4196f0`, accumulated hit-velocity resolution | `aerial-velocity-resolution.json` | `ev_78b72fef72121036f5340a92a615560a83bc974c5c96411b7fd35171005cfd79` |

The historical label `aerial-contact-resolution` describes a broader lead; the actual routine schedules contact tests and rest bookkeeping. Assembly offsets were cross-checked against `lf2-objdump.txt`. Extracted frame summaries are retained in `aerial-frame-data.json`, derived from the decoded data for Davis, Dennis, Deep, Woody, Freeze, Firen, Henry, John, Louis and Rudolf.

## Airborne attack routing

**Jumping and dashing have different attacks.** At `0x413a18–0x413a7f`, a character in state 4 with vertical position below ground level can turn using left/right and, when unarmed and Attack is held, enter jump-attack frame **80**. At `0x41408b–0x4141db`, state 5 handles dash-facing changes and enters unarmed dash-attack frame **90** only when horizontal motion agrees with facing and Attack is held. Weapons use different branches and frames.

These aerial action branches check held Attack. They do **not** require the positive five-sample recent-attack age used by ordinary neutral punches. This means LF2 does not use one identical input-buffer condition for every attack state.

The attacks are separate frame chains, not the ground punch sequence drawn higher on screen. The stock data commonly uses state 3 for jump attacks and state 15 for dash attacks, with character-specific exceptions such as Davis's state-3 dash attack.

**The inspected routing does not establish a one-attack-per-jump limit.** Automatic frame progression maps `next:999` to neutral on the ground but to jump frame **212** while a type-0 character is airborne (`0x40dbd2–0x40dbf6`). State 4 can then accept another held Attack if there is enough airtime. Some dash chains explicitly return to state-5 frame 216; other chains wait until landing.

There is also no general direct aerial cancel rule in the sampled data. Most jump/dash attack frames have zero `hit_a`, `hit_j` and `hit_d`; their sequences complete or land. A concrete exception is **Henry jump-attack frame 84 with `hit_a:80`**. Special-command routes are similarly frame-specific: for example, Woody's jump frame 212 offers `hit_Uj:275` and `hit_Dj:290`, and his crouch frames 215/219 offer `hit_Fj:252`. Modern launcher-to-jump cancels or universal chase cancels would be authored additions.

## Launching and hitting an airborne victim

**Airborne is different from already falling.** Normal hit processing accumulates `fall`, substituting 20 when the descriptor is zero. For an otherwise ordinary airborne character, totals above **20** select the falling sentinel 80, where a grounded character normally needs a total above **60**. The relevant airborne checks and stores are at `0x42eb7d–0x42eb89` and `0x42ebed–0x42ebf5`. An already-falling contact snapshot also forces that sentinel (`0x42ead8–0x42eb09`). These values represent reaction pressure and internal state selection, not numbers of hitstun frames.

**Falling targets reject weak follow-ups.** The collision routine at **`0x417abd–0x417add`** tests current target state 12. If the attack's `fall` is **40 or less**, the contact is filtered out, except interaction kinds 10 and 11. Thus an ordinary fall-20 jab cannot repeatedly re-launch an already falling victim through this normal path. Many stock jump/dash attacks use fall 70 and qualify for these follow-ups. Passing that threshold still requires actual hitbox/body overlap and the other contact filters.

The geometry includes facing-transformed horizontal/vertical rectangles and a separate depth bound. Default `zwidth` is 15, with strict depth separation below that bound. A fighter being airborne does not remove depth alignment or body-height requirements. This supports designing air moves with meaningful reach and vertical coverage rather than having every attack hit every nearby height.

## Concrete character differences

These are literal interaction fields from the sampled DAT frames, not measurements of final on-screen speed. Negative vertical values point upward in LF2's coordinates; positive values point downward. The engine adds contact contributions and has special-case adjustments.

| Move/contact | Native `dvx`, `dvy` | Fall | Gameplay implication |
|---|---|---:|---|
| Davis launcher, frame 72 | 3, −10 | 70 | Steep lift with modest horizontal displacement |
| Woody launcher, frame 72 | 5, −13 | 70 | Higher lift |
| Firen launcher, frame 74 | 15, −6 | 70 | Strong forward carry after a light setup contact |
| Freeze launcher, frame 72 | 15, −6 | 70 | Strong forward carry |
| Davis jump hit, frames 83/84 | 9, −5 | 70 | Forward aerial strike |
| Davis dash hit, frames 93/94 | 14, −5 | 70 | Stronger forward aerial strike |
| Woody jump contacts, frames 81 then 83 | −1, −5; then 7, +3 | 70 each | Different directions across one aerial sequence |
| Deep jump hit, frame 81 | 7, +7 | 70 | Downward spike |
| Deep dash hit, frame 91 | 12, +12 | 70 | Strong downward finish |

When falling is selected and `dvy` is zero, the ordinary character contact branch supplies **−7** (`0x42f1fb–0x42f21b`). Nonzero `dvy` contributes its explicit value. The branch at `0x42f1d3–0x42f1f6` also checks projected vertical position and may force a downward value of 12 when it would cross the floor. These details make an omitted vertical field different from a promise of no launch.

**Simultaneous hits are moderated.** Newly inspected procedure `0x4196f0` resolves each accumulated velocity axis as **2 × contact sum / (contact count + 1)** once the fighter's hitlag is zero, then clears the sums and count. The x/y stores are visible at `0x41971b–0x41974a`. One ordinary contact therefore receives its accumulated vector, while several contacts do not simply add without moderation. This is a native explanation for handling crowd impacts; copying the exact formula is unnecessary for Fourfold's different physics.

## Timing, hit reactions and juggle boundaries

Frame waits advance when age exceeds `wait`, so `wait:2` is three nominal counter samples. At nominal 30 Hz, examples before the first damaging frame are:

- Davis jump attack: frames 80, 81 and 82 each wait 1, totaling six nominal samples, approximately 200 ms.
- Deep jump attack: frame 80 wait 1, two samples, approximately 67 ms.
- Woody and Dennis jump attacks: initial wait 2, three samples, approximately 100 ms.
- Firen jump attack: initial wait 2, approximately 100 ms; Freeze initial wait 3, approximately 133 ms.

These are data-derived nominal startup intervals, with first-frame scheduling and hitlag caveats, not measured input-to-contact latency. Active-frame width and movement determine whether contact actually happens.

Accepted normal contact sets approximately three local pause updates for each participant, as established in the earlier combat report. Ordinary injured chains 220–225 in the sampled characters use a wait-2 frame followed by wait 3: seven nominal non-paused updates, approximately 233 ms. The falling reaction instead follows velocity-driven frames and landing/recovery rules; it is not a universal fixed air-stun timer.

Repeated contact is constrained separately by attacker and victim rest. Examples include Davis jump `arest:15`, Davis dash `arest:9`, and Woody/Dennis dash `arest:20`. A positive `vrest` sets a victim-versus-attacker cooldown instead. The contact procedure writes these counters; `0x419380` ages pairwise rest during contact scheduling and clears attacker rest when the current frame has no interactions. Rest values consequently should not be described as universal move cooldowns independent of animation.

No universal finite juggle-hit count was found in the inspected native branches. The evidenced constraints are eligible attack strength, geometry, rest, gravity, landing and recovery. This is not a proof that every character or special effect permits unlimited juggling. A modern juggle budget, diminishing lift, damage scaling or forced ender would be independent balancing rules.

## Landing and escape

Normal character gravity is 1.7 native velocity units per eligible physics update, with object/special-state exceptions. Contact hitlag pauses physics. Falling frames change with vertical velocity, and the previously documented early-descending Jump recovery can interrupt a qualifying fall.

Ordinary landing zeros height and vertical motion, reduces horizontal velocity and resets frame age. Jump frame 212 and state-6 recovery land into crouch **215**; most other normal actions land into crouch **219**, with a special state-100 branch. Sampled crouches have wait 2, three nominal samples, approximately 100 ms. This cuts off an unfinished airborne action rather than preserving an infinite aerial chain through the floor.

Falling/burning landings instead settle stored throw injury, then choose bounce or lying. Their normal getup protection and recovery escape conditions are documented in [the recovery investigation](lf2-recovery-investigation.md). Air-combo additions should retain those exits rather than extending victim control indefinitely.

## Independent adaptation boundaries

The source findings support separate jump/dash attacks, readable launcher vectors, restricted follow-ups against falling targets, local contact pauses, actual lane/height overlap, and explicit landing recovery. They also support distinct upward, carrying and downward elemental styles.

Fourfold-specific elemental attack chains, jump/dash cancel windows, limited aerial actions, juggle budgets, scaling, camera effects and stronger AI decisions are authored gameplay. They should be tuned and tested against our gravity, arena scale and crowd sizes. AI prediction, team coordination and decision cadence are not established by this aerial investigation; the earlier [AI report](lf2-ai-investigation.md) documents the inspected native AI, and any new controller features should distinguish their modern adaptations.

### Implemented routes

Grounded, unarmed **Up + J** selects a dedicated launcher for eight energy, with an 800 ms reuse cooldown. All four elements can jump-cancel its confirmed launch after the contact window; **Space + J** pairs that jump with the first aerial attack. A whiff or intact block does not grant this cancel, while breaking an exhausted guard does. Ordinary Air movement cancels remain available.

| Element | Martial movement | Aerial route |
| --- | --- | --- |
| Air | Circular palms and evasive, turning footwork | Palm, turning heel, descending heel; three light strikes |
| Water | Yielding sweep, pull and redirection | Draw-in palm, outward sweep; two strikes |
| Earth | Rooted uppercut with startup armor, heavy hammer | Air hammer, steep downward smash; two strikes |
| Fire | Driving uppercut and direct advancing kicks | Two flying kicks, strong forward heel; three strikes |

These poses and routes are original stylized movements inspired by the requested elemental martial-arts direction. Air attacks have separate timing and contact poses from the standing jab loop. Confirmed early air strikes provide bounded self-lift once per action to keep the next contact reachable; misses and blocks do not. Lane and height overlap still determine contact. Each move hits a given opponent once. Equipped weapons inherit their wielder's aerial route and retain their existing reach/durability rules.

Weak standing contact with fall below 41 cannot renew an already launched target; dedicated aerial moves, launchers, freezes and knockdowns qualify. This adopts the intent of the native falling-target gate rather than copying every state/kind exception. A victim's qualifying air-hit count is capped at four for ordinary fighters, including the launcher. Additional air damage is divided by `1 + 0.2 × prior juggle count`. Enders force knockdown sooner when applicable. Knocked-down victims retain their existing protection and recovery rolls; throws retain their separate landing consequence. Bosses keep their bounded, shorter stun and existing knockdown resistance.

Each attacker also has a per-flight aerial move budget. Double jumps, input clearing and hit reactions do not renew it; real landing resets it. Landing terminates any unfinished aerial melee action so it cannot become a standing hitbox. Air/Fire enders use three moves; Water/Earth use two. The explicit cap, self-lift and damage scaling are Fourfold balancing rules, not recovered LF2 formulas.

### Aerial validation

Eleven new gameplay tests exercise all four complete launcher-to-air routes using real simulation input and motion; whiffs and blocks; guard-break chase; energy and cooldown limits; lane separation; per-flight limits; diminishing damage and forced knockdown; ground-jab rejection; and ending airborne hitboxes on landing. The prior juggle regression now tests the deliberate four-hit limit. The focused aerial/engine/combat suite passes all 88 tests.

Browser checks completed all four routes using keyboard events against a naturally positioned training opponent. Each produced its expected three- or four-hit total and final knockdown without relocating fighters. Screenshots are retained under ignored `output/playwright/aerial-{air,water,earth,fire}-ender.png`. The modern AI changes and their validation are documented separately in the AI report.

## Limits

No Windows gameplay or frame capture was performed. Static evidence establishes these paths and literal data; it does not measure exact real-time latency, prove universal cancel availability, or cover every special effect, boss and mod. Raw vectors and timings must not be advertised as final Fourfold values unless independently implemented and tested there.
