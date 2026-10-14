# LF2 combat investigation

Static investigation of the supplied Little Fighter 2 v2.0a installer, conducted on 15 October 2026. The findings below informed an independent adaptation for our elemental browser fighter. The Windows installer and game were not executed, and no original graphics, sounds, character files, or decompiled code are included in the game.

## Provenance and method

- Input: `/Users/balraj/Downloads/LF2_v2.0a.exe`; SHA-256 `540c485547e234b0d09595f54d067aafd7176092c308aca61868f3cbc03030e1`.
- Extracted executable: `lf2.exe`, PE32 x86, 3,424,256 bytes; SHA-256 `12dfa00f6b767508612550e9ab27ab74b4201ff4cb9ff31d068925924eab8fc5`.
- Recovered 690 ordinary files from the Clickteam v24 installer. The other table record is an installer shortcut. The extraction manifest records every file's size and digest.
- Inspected 79 DAT files, decoding encrypted files and retaining already-plaintext files. Encrypted payloads passed byte-identical decode/encode roundtrips. Extraction and decoding used local Python scripts based on the formats documented in [cicdec](https://github.com/Bioruebe/cicdec/blob/42c3c9d030d75ed9096e3c84ef5ffd19bde51b37/cicdec/Program.cs) and [lf2_codec](https://github.com/azriel91/lf2_codec/blob/00a5ed2f8603bdb940ec2d6b2a1d28a2b0b5d8b7/src/lib.rs).
- Native analysis used REA 6.5.0 with Ghidra 12.1.4, Node 24.16.0 and JDK 21.0.12.1 on macOS arm64. A persistent REA MCP session retained the imported executable across queries. This follows REA's [native investigation workflow](https://github.com/morluto/rea/blob/main/docs/native-investigation.md).

Local research is under ignored [`output/lf2-analysis/`](../output/lf2-analysis/): `extraction-manifest.json`, `decode-manifest.json`, `rea-doctor.json`, `data-findings.md`, `combat-data.json`, and `evidence/*.json`. Those files include the reproducible details and proprietary material and are deliberately outside the tracked source and distributed assets.

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

The community [character-format reference](https://www.lf-empire.de/lf2-empire/data-changing/types/167-type-0-characters) interprets ordinary frames as `(wait + 1) / 30` seconds, with a first-frame scheduling caveat. Our evidence verifies counter mechanics, but does not recover the complete caller ordering or measure input-to-hit latency. We did **not** establish an exact LF2 input-buffer/cancel window or prove that the listed stronger attacks automatically follow two jab presses.

## Adaptation for our game

The implementation follows these findings while preserving our elemental mechanics:

- Apply approximately 100 ms of local contact hitlag, with approximately 167 ms for a blocked victim; keep unrelated fighters moving.
- Separate reaction pressure from health damage. Use 20/40/60 bands and nominal decay of 30 points/second. Reaching the 60 band causes a longer dizzy reaction; a subsequent hit that exceeds 60 causes knockdown and clears pressure. Our simplified model omits LF2's internal falling sentinel and several special-state rules.
- Preserve the air launcher's and water freeze's reaction priority instead of replacing them with generic pressure reactions.
- Advance the attacker through a connected jab's recovery so modest victim recoil does not repeatedly break the sequence.
- Express distinct elemental startup, active and recovery rhythms in nominal 30 Hz units, then tune them to our game's scale. These are authored adaptations, not imported character data or a claim of frame-perfect LF2 emulation.
- Give Earth's overhead finisher a downward spike against airborne enemies, while Air lifts vertically and Fire drives enemies sideways. Retain Water's pull, freeze and parry counter.
- Hold each fighter's animation clock during local hitlag, with a small victim-only shake and a distinct dizzy pose. Reduced motion disables the shake.

The REA session was closed with its evidence saved to `output/lf2-analysis/lf2-native-snapshot.json`. REA, Ghidra and the analysis JDK are local research tools under the ignored output folder; the game still has zero runtime dependencies.

This investigation did not run LF2 under Windows, measure live frame pacing, recover all input transitions, or reproduce every rest, airborne, armor and special-state rule. The browser implementation and its tests remain the evidence for how our adaptation behaves.
