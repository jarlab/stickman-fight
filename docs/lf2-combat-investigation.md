# LF2 combat investigation

Static investigation of the supplied Little Fighter 2 v2.0a installer, conducted on 15 October 2026. The findings below informed an independent adaptation for our elemental browser fighter. The Windows installer and game were not executed, and no original graphics, sounds, character files, or decompiled code are included in the game.

## Provenance and method

- Input: `/Users/balraj/Downloads/LF2_v2.0a.exe`; SHA-256 `540c485547e234b0d09595f54d067aafd7176092c308aca61868f3cbc03030e1`.
- Extracted executable: `lf2.exe`, PE32 x86, 3,424,256 bytes; SHA-256 `12dfa00f6b767508612550e9ab27ab74b4201ff4cb9ff31d068925924eab8fc5`.
- Recovered 690 ordinary files from the Clickteam v24 installer. The other table record is an installer shortcut. The extraction manifest records every file's size and digest.
- Inspected 79 DAT files, decoding encrypted files and retaining already-plaintext files. Encrypted payloads passed byte-identical decode/encode roundtrips. Extraction and decoding used local Python scripts based on the formats documented in [cicdec](https://github.com/Bioruebe/cicdec/blob/42c3c9d030d75ed9096e3c84ef5ffd19bde51b37/cicdec/Program.cs) and [lf2_codec](https://github.com/azriel91/lf2_codec/blob/00a5ed2f8603bdb940ec2d6b2a1d28a2b0b5d8b7/src/lib.rs).
- Native analysis used REA 6.5.0 with Ghidra 12.1.4, Node 24.16.0 and JDK 21.0.12.1 on macOS arm64. A persistent REA MCP session retained the imported executable across queries. This follows REA's [native investigation workflow](https://github.com/morluto/rea/blob/main/docs/native-investigation.md).

Local research is under ignored [`output/lf2-analysis/`](../output/lf2-analysis/): `extraction-manifest.json`, `decode-manifest.json`, `rea-doctor.json`, `data-findings.md`, `combat-data.json`, `input-frame-data.json`, `input-research-notes.md`, and `evidence/*.json`. Those files include the reproducible details and proprietary material and are deliberately outside the tracked source and distributed assets.

## Native evidence

The names below describe inferred responsibilities; the executable does not supply these source-level names. Addresses are virtual addresses in this exact executable, whose image base is `0x400000`.

| Address | Observed responsibility | Local evidence artifact |
|---|---|---|
| `0x42e100` | Contact processing, participant hitlag, fall accumulation and reaction selection | `evidence/combat-procedure.json` |
| `0x40e490` | Per-object hitlag countdown and movement | `evidence/fighter-tick.json` |
| `0x40d960` | Rest/fall/guard counter decay and frame wait/next progression | `evidence/counter-update.json` |
| `0x40de30` | Sprite drawing, including shake while the victim's hitlag is negative | `evidence/frame-update.json` |
| `0x40d0a0` | Data **exporter**, whose named output fields corroborate frame-structure offsets | `evidence/frame-parser.json` |

The last two filenames are historical query labels, not accurate function descriptions. The exporter is not the data parser, and the drawing function is not the frame-counter update.

REA evidence IDs, in the same order:

1. `ev_a42d5b3575ad4f50601cc7c04af5178c14e13815dd744d8e1af179545e46d298`
2. `ev_e41737e9992b34b3006f8c5c3a3f86b1b3b1cd78ac02ce387ebbca34f6aa3646`
3. `ev_7bfc7706478c5e0b6d57cd48e82fc16b9a644afe38e9e3470b5d146050c46a5c`
4. `ev_f7f4290f7366892ca54764f21cce857c0c0b4b5dc9c4039079d6cc1dc2ddfe3d`
5. `ev_7b2776bfcc7f7b6edfd07c4d6b6e098ddbd8e17cd36cfdb9bcd5f78d97b2123e`

### Hit contact pauses the participants

The normal contact branch writes `+3` to the attacker's signed hitlag field at object offset `0xb4` and `-3` to the victim's. The blocked-contact branch writes `+3` and `-5`. Raw-byte evidence separately confirms these stores at `0x42f2b7`, `0x42f2cc`, `0x4300a6`, and `0x4300b7` (`hitlag-bytes.json` and `block-hitlag-bytes.json`).

The movement function counts this field toward zero and returns before normal movement while it is nonzero. The counter function also skips ordinary fighter progression during hitlag; it has a separate exception for type-3 objects. Drawing uses the negative sign to apply a small local shake. These are object-local mechanisms: pausing the entire crowd is not required to reproduce this contact effect.

This independently corroborates the original experiments in [Dragon5 and STM1993's shaking investigation](https://lf-empire.de/forum/showthread.php?tid=8740). At a nominal 30 updates/second, three updates correspond to approximately 100 ms, and five to 167 ms. These are conversions, not measured wall-clock durations from a running copy of LF2.

### Damage and reaction pressure are separate

The contact procedure adds the attack's fall value to object offset `0xb0`, substituting 20 when the descriptor value is zero. In the inspected ordinary grounded branch, positive totals are snapped into 20/40/60 reaction bands: frame 220, alternate frames 222/224, and dizzy frame 226 respectively. A total above 60 becomes the internal falling value 80. Airborne handling has a different threshold. The counter function reduces positive fall and guard counters by one per eligible update; its hitlag gate precedes that decay.

Consequently, a sequence's reaction depends on attack strength, contact spacing and the target's existing state. It is not explained by a universal third-button-press knockdown. Health injury, horizontal/vertical hit velocity, fall pressure and guard pressure are distinct data fields.

### Frame timing and follow-through

The exporter identifies frame `wait` and `next` at offsets `0x7b0` and `0x7b4`, with frame stride `0x178`. The counter procedure resets the elapsed counter on a frame change, increments it, and follows `next` when it exceeds `wait`. State-specific branches can alter this progression.

Selected first-jab data illustrates different rhythms:

| Character | Literal wait sequence | Damaging frame(s) |
|---|---|---|
| Davis / Woody | 1, 1, 1, 1 | 61 |
| Dennis | 2, 1, 1, 1 | 61 |
| Firen | 2, 3 | 61 |
| Freeze | 2, 2 | 61 |
| Deep | 3, 1, 1 | 61, 62 |
| Louis | 4, 2 | 61 |

Davis, Woody and Dennis also specify forward attacker motion on recovery frames, independently of the victim's small jab recoil. Stronger attacks use substantially different launch vectors; Firen explicitly has a light setup contact followed by a stronger launch. These observations support moving the attacker with a connecting sequence and differentiating elemental attack rhythms.

The community [character-format reference](https://www.lf-empire.de/lf2-empire/data-changing/types/167-type-0-characters) interprets ordinary frames as `(wait + 1) / 30` seconds, with a first-frame scheduling caveat. Our evidence verifies counter mechanics, but does not measure live input-to-hit latency. The follow-up investigation below establishes how recent inputs are stored and when ordinary jabs can transition.

### Follow-up: input age and combo transition windows

The same extracted executable was reopened through REA for this investigation. These observations come from static decompilation, corroborated against its disassembly and decoded character data; LF2 was not run under Windows.

| Address | Observed responsibility | Local evidence artifact | REA evidence ID |
|---|---|---|---|
| `0x413080` | Input age, fresh presses, command dispatch and ordinary actions | `evidence/input-dispatch.json` | `ev_319c1cacbe810efdad03558eff011d3d8f10a287c5251e66e74a0057246739cd` |
| `0x41bc90` | World update ordering, including input dispatch before movement | `evidence/input-world-loop.json` | `ev_f1de0e992ca71d696695d9d5d03dbd13771e5f7b330e34c1970c9ebfee39eaaf` |
| `0x40e2d0` | Explicit frame transition and input-counter consumption | `evidence/input-frame-transition.json` | `ev_8526dc8904c08cd5899202547e928df1edf0332b8014b01af7f0dab5e2f1d017` |
| `0x412800` | Defend → right → attack recognition | `evidence/input-command-forward.json` | `ev_3266445ea23a5a7a7c64e6f833948d5bd43d25edc5287d6ea200b0c067059e46` |
| `0x417400` | Interaction/body overlap and depth eligibility | `evidence/input-hit-geometry.json` | `ev_5d6fce286091c9fa1effa478d9736ecefefc093ed614f6bd766bbdceb37fa9a2` |

**Basic input is remembered for five update samples.** The attack dispatcher compares previous input at object offset `0xca` with current input at `0xd1`. A fresh press writes 5 to the attack-age byte `0xbe` at `0x4131fc`; subsequent calls decrement it before checking actions. Its positive values are 5, 4, 3, 2 and 1, including the initial press sample. A held key does not refresh this counter. Five nominal 30 Hz updates correspond to approximately 167 ms, rather than an independently measured wall-clock deadline.

The neutral standing/walking branch checks both positive attack age and attack still held. A tap fully released before neutral is therefore insufficient on that path. Explicit frame `hit_a` transitions use recent-input ages instead, choosing attack only when its age is greater than the competing jump and defend ages. They can accept a released tap. A successful explicit transition clears the relevant input counters. These are distinct mechanisms, not one universal input queue.

**Input age continues during contact hitlag.** The world loop calls input dispatch for active objects without a per-object hitlag gate; the dispatcher ages inputs before action handling. Movement and frame progression use their separate hitlag gates described above. A very early press can consequently expire while a fighter is still paused by contact.

**Ordinary jabs complete their recovery.** In all seven inspected characters, ordinary punch frames 60–68 use state 3, zero `hit_a`, `hit_d` and `hit_j`, and eventually `next:999` to return to neutral. They provide no direct jab-to-jab cancel. The next jab is selected by neutral input handling. Explicit exceptions are present elsewhere: Woody's running-attack frame 78 has `hit_a:70`, and Dennis's super-punch frame 75 exposes selected special-command transitions. The character data defines those opportunities frame by frame.

**The finisher depends on a nearby opening.** Neutral unarmed attacks randomly choose frame 60 or 65 unless the marker at `0xea` is positive, in which case they choose super-punch frame 70. The kind-6 collision branch at `0x43057a` sets this marker to 3 on the receiving fighter. Broken-guard and dizzy frames emit these interactions: for example, Davis frames 112–114 and 226–229 contain kind-6 rectangles. Continued overlap refreshes the marker; after leaving it, the marker decays over three eligible counter updates, pausing during hitlag. This is proximity-based vulnerability, not a fixed third-press finisher. The neutral selection itself has no extra facing check.

**Special commands keep ordered state separately.** The defend → right → attack recognizer advances a stage byte on fresh input and executes only when the current frame offers a matching transition. Its stages do not have the basic five-tick expiry. If the current frame cannot execute a completed command, it can remain pending until a valid frame or an incompatible fresh input; a second defend is one way to clear it. The related reset helper at `0x40e170` checks new edges, and a disassembly audit found no separate countdown for the command-stage bytes. This supports persistent command recognition; it is not a proof of every special-case interaction or aliasing write.

[STM1993's original input experiments](https://lf-empire.de/forum/showthread.php?tid=10499) proposed a five-TU neutral buffer but marked it unverified. The native evidence above establishes the counter and narrows that claim with its held-input condition. The same researcher's observations about command ordering and cancellation are consistent with the inspected recognizer. No live keyboard-latency, operating-system polling or network timing was measured.

## Adaptation for our game

The implementation follows these findings while preserving our elemental mechanics:

- Apply approximately 100 ms of local contact hitlag, with approximately 167 ms for a blocked victim; keep unrelated fighters moving.
- Separate reaction pressure from health damage. Use 20/40/60 bands and nominal decay of 30 points/second. Reaching the 60 band causes a longer dizzy reaction; a subsequent hit that exceeds 60 causes knockdown and clears pressure. Our simplified model omits LF2's internal falling sentinel and several special-state rules.
- Preserve the air launcher's and water freeze's reaction priority instead of replacing them with generic pressure reactions.
- Advance the attacker through a connected jab's recovery so modest victim recoil does not repeatedly break the sequence.
- Express distinct elemental startup, active and recovery rhythms in nominal 30 Hz units, then tune them to our game's scale. These are authored adaptations, not imported character data or a claim of frame-perfect LF2 emulation.
- Give Earth's overhead finisher a downward spike against airborne enemies, while Air lifts vertically and Fire drives enemies sideways. Retain Water's pull, freeze and parry counter.
- Hold each fighter's animation clock during local hitlag, with a small victim-only shake and a distinct dizzy pose. Reduced motion disables the shake.
- Keep one basic action for `5 / 30` seconds and age it during contact hitlag. Accept released taps as a deliberate browser-game convenience; this is more forgiving than LF2's inspected neutral held-input condition. Holding a button does not repeatedly enqueue it.
- Finish ordinary jab recovery before starting the next jab. Alternate the two ordinary elemental strikes deterministically; LF2 randomly selects its two variants. Choose the stronger elemental finisher from a nearby frontal dizzy or guard-broken opponent, with a three-tick grace period after that opening. The frontal requirement and our stagger categories are adaptations of LF2's interaction-marker rule.
- Retain the game's explicit elemental-power and mobility cancel windows after confirmed contact. A simultaneous dash + attack is an explicit paired move: its attack buffer begins after the dash; an eligible mobility cancel releases the old melee cooldown for the chase. These authored options are additions to LF2's ordinary jab rules, not recovered native cancellations.
- Recognize the supported defend/direction/attack commands without the former 700 ms deadline. A conflicting fresh input or explicit input clear cancels the sequence. Match, focus and interruption resets remain game-specific policy.

The first REA session's evidence is saved to `output/lf2-analysis/lf2-native-snapshot.json`; the follow-up input session is saved to `output/lf2-analysis/evidence/input-session-snapshot.json`. REA, Ghidra and the analysis JDK are local research tools under the ignored output folder; the game still has zero runtime dependencies.

This investigation did not run LF2 under Windows, measure live frame pacing, recover every input transition, or reproduce every rest, airborne, armor and special-state rule. Five-tick recency and the inspected transition conditions are static findings; frame-perfect LF2 input emulation is not claimed. The browser implementation and its tests remain the evidence for how our adaptation behaves.


## Browser adaptation validation

On 15 October 2026, all 112 Node tests and JavaScript syntax checks passed. New timing regressions were verified failing before implementation. Coverage includes the input expiry boundary during hitlag, full recovery before jab follow-ups, whiffs and blocks, target eligibility and marker grace, ordered commands and interruption, quick-tap direction capture, and physical guard/parry edges.

Keyboard-driven Chromium checks at the local game URL confirmed Air and Water finishers after four contacts, Earth after three, and Fire after four. The corresponding reactions were launch, freeze, slam and forward knockdown. A held/repeated J produced one attack; a command with 950 ms and 850 ms gaps still cast; an incompatible direction invalidated the command. Survival crowd play with full motion remained finite, all game assets returned HTTP 200, and the browser console had zero errors or warnings. Screenshots and test output remain in ignored `output/` directories.
