# LF2 knockdown recovery and rolling investigation

Static follow-up on 15 October 2026, using the supplied LF2 v2.0a extraction and complete REA evidence already saved for the earlier combat investigation. The installer and game were not executed. No new analysis session was needed. Findings below describe this executable and the ten sampled stock fighters; the browser game's implementation remains independent.

## Evidence and scope

Target: `output/lf2-analysis/extracted/lf2.exe`, SHA-256 `12dfa00f6b767508612550e9ab27ab74b4201ff4cb9ff31d068925924eab8fc5`. Saved native evidence was produced by REA 6.5.0 with Ghidra 12.1.4. Function names below are inferred responsibilities, not recovered source names. Addresses are virtual addresses in this executable.

| Procedure | Local record under `output/lf2-analysis/evidence/` | REA evidence ID |
|---|---|---|
| `0x413080`, input dispatch | `input-dispatch.json` | `ev_319c1cacbe810efdad03558eff011d3d8f10a287c5251e66e74a0057246739cd` |
| `0x40e490`, fighter physics and landing | `fighter-tick.json` | `ev_e41737e9992b34b3006f8c5c3a3f86b1b3b1cd78ac02ce387ebbca34f6aa3646` |
| `0x40d960`, counters and automatic frame progression | `counter-update.json` | `ev_7bfc7706478c5e0b6d57cd48e82fc16b9a644afe38e9e3470b5d146050c46a5c` |
| `0x417400`, interaction/body collision filtering | `input-hit-geometry.json` | `ev_5d6fce286091c9fa1effa478d9736ecefefc093ed614f6bd766bbdceb37fa9a2` |
| `0x41bc90`, world update ordering | `input-world-loop.json` | `ev_f1de0e992ca71d696695d9d5d03dbd13771e5f7b330e34c1970c9ebfee39eaaf` |

Decoded character data: Davis, Dennis, Deep, Woody, Freeze, Firen, Henry, John, Louis and Rudolf in `output/lf2-analysis/decoded/data/`. Assembly was cross-checked against `lf2-objdump.txt`. These ignored local artifacts contain the reproducible evidence; proprietary data and pseudocode are not shipped with the game.

## Observed recovery paths

### Aerial recovery is a specific descending opportunity

Input dispatch at `0x413f8d–0x414080` accepts recovery only when all of these conditions hold:

- The current falling frame is **182 or 188**.
- Health is positive.
- The stored throw-injury field at object offset `0x320` is nonnegative. A negative value blocks this recovery path.
- **Jump is still held**, and its recent-press age at offset `0xbf` is positive.

The earlier input investigation established that a new jump edge sets this age to five and subsequent input updates age it down. Holding Jump does not continually refresh it. This is a short recent-press condition, not a permanent request to recover whenever possible.

Physics at `0x40e7ac–0x40e88a` selects falling frames 182/188 for the early descending velocity band **1 ≤ vertical velocity < 8**, in LF2's native units and sign convention. Other ascent/descent bands select other falling frames. Consequently, the native opportunity is not all airborne time, and the numeric band cannot be directly used as seconds in our game's differently scaled physics.

A successful action enters rowing frame **100 or 108**, both state 6. Facing relative to current horizontal velocity chooses the variant. If horizontal speed has magnitude at least one, recovery preserves its sign and sets its magnitude to the character's `rowing_distance`; at lower speed it moves opposite facing. This branch does not read a left/right input to select a new escape direction. The vertical velocity is limited by `rowing_height`. All ten sampled fighters use `rowing_height: -2` and `rowing_distance: 5`.

Their sequences are 100 → 101 and 108 → 109. Frames 101 and 109 have `next:0`, which the counter routine treats as **stay on the same frame**, not return to neutral (`0x40dba6–0x40dbaf`). Aerial recovery duration therefore depends on the landing path rather than a fixed sum of these animation waits. On landing, state 6 transitions to landing crouch **215**, then neutral through the frame's `next:999`.

### Ground rolling uses Defend from running or landing crouch

The normal running branch, excluding the heavy-weapon running branch, accepts held Defend plus positive recent-defend age and enters frame **102** (`0x413ccd–0x413cdf`). Landing crouch **215** accepts the same action (`0x413e87–0x413e99`). The ground roll uses state 6 and character-authored motion/frame chains.

There is no corresponding generic Defend-to-roll branch for lying frames 230/231 or getup crouch 219 in the inspected input dispatcher. Therefore, a directional recovery roll that starts directly from a grounded knockdown in our game is an intentional usability adaptation, not exact LF2 input emulation.

For Davis, frames 102 → 103 → 104 → 105 → 219 have `wait:2` on each rolling frame and `dvx:9`. The frame counter advances when age exceeds wait (`0x40db77–0x40dbaf`), giving **12 nominal simulation ticks, approximately 400 ms at 30 Hz**, followed by crouch 219 for three nominal ticks, approximately 100 ms. These are nominal simulation durations; hitlag and engine ordering can affect elapsed time.

Character differences matter: Henry uses six rolling frames, `dvx:12`, and exits frame 107 into frame 24. Rudolf uses a different five-frame sequence with waits 1, 1, 4, 1, 1 and varying motion. A universal 400 ms LF2 roll is not established.

### A normal knockdown waits, then gets up

All ten sampled fighters use lying frames **230/231**, state **14**, `wait:30`, `next:219`, with no explicit attack, jump or defend frame transitions. For a living fighter, that is 31 nominal counter updates, approximately **1.03 seconds**, followed by the three-tick getup crouch 219. Dead fighters are held in lying by the counter routine and do not take the ordinary living getup path.

Landing can first bounce rather than immediately enter lying. In the fighter physics routine, vertical impact speed above 11, horizontal speed outside ±9, or burning state 18 selects a bounce; it sets vertical velocity to −3.5, limits horizontal speed to ±7, and uses falling frames 185/191. The lower-impact branch enters 230/231 and reduces horizontal motion. These thresholds are LF2 native units, not our game's speeds.

## Protection during recovery

The sampled rowing/rolling frames **100–109** and lying frames **230/231** have no body collision rectangles. The collision routine requires a positive target body count before intersection tests, so ordinary contact has no body to hit in those frames. This supports bodyless recovery protection; it does not prove immunity to every special scripted effect merely because a frame uses state 6.

Getup also has a separate native protection counter. When automatic frame progression leaves state 14, normally into 219, the routine writes **15** to object offset `0x08` at **`0x40dc8b`**. The condition excludes transition into state 13 and includes special mode/team/object exceptions. Positive values decrease by one on eligible counter updates. For ordinary fighters this is approximately **half a second of nominal post-lying protection**.

The collision resolver checks that field at **`0x4176d6–0x4176e4`**. While nonzero, it rejects ordinary interaction kinds; kinds 8 and 14 are explicit exceptions to that particular filter. Thus body boxes returning in crouch 219 do not by themselves establish immediate vulnerability. This is more specific than saying every recovery state has universal invulnerability.

## Throw landing damage and recovery ordering

The world loop calls input dispatch before fighter physics. During a falling/burning landing, physics applies the absolute stored throw-injury amount, with the existing damage scaling when present, subtracts it from health and recoverable health, and clears it at **`0x40eb23–0x40eb5e`**. This occurs **before** choosing bounce versus lying.

At the end of physics, a fighter whose resulting state is not 12 has the stored throw-injury field cleared at **`0x40ef52–0x40ef5e`**. Combined with the earlier input call, the static control flow implies that a successful aerial recovery into state 6 can avoid a future throw landing injury. That is a control-flow inference, not a live gameplay measurement. Negative stored throw injury blocks the inspected aerial recovery trigger.

Once landing damage has already been applied, a subsequent ground roll does not refund it. Our requested roll for escaping pressure after landing should preserve that ordering: settle the throw's landing consequence, then allow the recovery action. Avoiding damage through the separate early aerial recovery opportunity would be a different feature.

## Independent adaptation for the browser game

Fourfold now supports **Shift + a direction** just before landing or while knocked down. This is an original direct-knockdown option inspired by LF2's committed rolls and protected recovery, rather than its exact Jump/Defend routes.

- A roll starts only while grounded, after a 50 ms landing commitment, with no active throw/grab/freeze. Landing commitment ages during contact pauses so a recent input can survive landing hitlag.
- A recovery request uses the existing five-tick (~167 ms) input buffer. Early airborne presses expire. A near-landing request survives the throw's landing-damage event, but the damage must be applied once and the flight cleared before rolling.
- The roll lasts 420 ms. Its first approximately 300 ms are protected, followed by a vulnerable recovery tail. Direction is chosen once across horizontal/depth axes; Shift alone uses facing. Motion decelerates from 720 toward 180 world units/second, with reduced depth speed and diagonal normalization. A full horizontal roll covers about 189 world units before boundary clamping.
- Rolling costs no energy, crosses fighter bodies, and cannot be cancelled into attacks, grabs, powers or another roll. Inputs made during the roll are discarded. A successful hit during the vulnerable tail interrupts its remaining movement. The normal stand-up path and its existing brief protection remain available.
- Every fall permits one recovery roll. New knockdowns create new opportunities; repeated Shift cannot extend the current roll. Death, respawn and arena placement clear recovery state. The match pause freezes the action.
- The roll has a tucked somersault pose and ground dust. Reduced motion retains a readable low pose without rotation or a trailing dust effect. The HUD explains the landing input, downed recovery and active roll.

The user's follow-up also requested stronger martial-arts presentation. Each element now has a distinct planted/flowing stance and casting pose, with air crescents, water ribbons, rock fists/ground shards and flame lashes following the active limb. Confirmed impacts receive matching elemental accents and stronger bounded camera feedback; blocks and parries retain their own cues. Signatures draw open cyclone rings, curling tidal crests, fractured stone columns or outward flame tongues behind fighters. Their geometry uses bounded loops and the existing effect lifetime. Reduced motion replaces animated signatures with a fixed outline and elemental glyph, and suppresses extra decorative motion. These are original visual changes and do not alter attack damage, hitboxes or combo timing.

## Validation

Sixteen new gameplay tests cover directional rolls, one action per fall, early protection and vulnerable-tail punishment, ordinary and thrown landings, short buffering, preserved landing injury, expiry, input cancellation, crowd-body crossing, pause/reset/respawn, arena bounds and unchanged air dashes. The crowd test uses actual committed melee attacks: an early jab misses while the player rolls through the attacker, and a second timed jab punishes the recovery tail.

Validation completed on 2026-10-15:

- `npm run check` passes; all **206 gameplay tests** pass, including the 16 new recovery tests. `git diff --check` is clean.
- Browser input reproduced a natural enemy grab, punch and throw, then buffered a horizontal roll just before landing. The roll completed, and ordinary depth movement resumed. A second run verified a depth roll with reduced motion.
- All four elements were checked for melee contact, projectile casting and signature effects. Signatures hit nearby opponents in a 12-enemy training scene after spawn protection expired. A reduced-motion signature retained its simple outline without the added animated geometry.
- Browser console: zero errors or warnings. Captured local page, stylesheet and module requests returned HTTP 200. Independent review found no concrete lifecycle or renderer defect.

Local screenshots are retained under ignored `output/playwright/`: `lf2-recovery-roll.png`, `recovery-reduced-motion.png`, `martial-{air,water,earth,fire}-{impact,cast,signature}.png`, and `martial-reduced-signature.png`.

## Limits

No Windows execution, live input latency, exact real-time recovery measurement, or exhaustive special-character/mod behavior was tested. Static evidence establishes branch conditions, frame data and update ordering; it does not establish every global side effect or exceptional interaction. Values above are for this binary and sampled data, and should not be advertised as a frame-perfect LF2 recreation.
