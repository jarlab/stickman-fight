# LF2 grabbing and throwing investigation

Static analysis of the supplied LF2 v2.0a on 15 October 2026, used to guide an independent implementation in Fourfold. The Windows installer and game were not executed. Original character files, graphics, sounds and decompiled code remain outside the browser game's source and assets.

## Provenance and evidence

The extracted `lf2.exe` is the same PE32 x86 executable used in the [combat investigation](lf2-combat-investigation.md), SHA-256 `12dfa00f6b767508612550e9ab27ab74b4201ff4cb9ff31d068925924eab8fc5`. REA 6.5.0 with Ghidra 12.1.4 supplied the native analysis. Decoded DAT files and x86 disassembly corroborate the findings. Supporting proprietary material is kept in ignored `output/lf2-analysis/`; `grab-research-notes.md` records detailed offsets and limitations, and `grab-frame-data.json` records the selected character frames.

| Function | Observed role | Local REA evidence |
|---|---|---|
| `0x417400` | Interaction geometry, ordinary grab eligibility, thrown-body contact eligibility | `evidence/input-hit-geometry.json` |
| `0x42e100` | Bind catcher and victim; process body collisions | `evidence/combat-procedure.json` |
| `0x418c30` | Grip lifetime, held-input actions, throw release and invalid-link cleanup | `evidence/grab-lifecycle.json` |
| `0x4187b0` | Synchronize held poses; apply an individual grab strike | `evidence/grab-position.json` |
| `0x40e490` | Suppress held movement; apply throw injury on landing | `evidence/fighter-tick.json` |
| `0x40d0a0` | Export named cpoint fields, corroborating structure offsets | `evidence/frame-parser.json` |

The fresh REA evidence IDs are `ev_267779490196ce53dd8d0c3a20afdfd605eeb38914d611be9fb8dd92d004a50e` (lifecycle) and `ev_be5aa3c8c5b55d737b750f02da57b9e6afbf604ce72eda88e1b55330cc17d34b` (held positioning). Supporting earlier records and their IDs are listed in the combat investigation.

These are descriptive labels, not recovered source function names. The last artifact's historical filename is misleading: it contains the data exporter.

## What the executable establishes

**Ordinary grabs require a dizzy opening.** The kind-1 interaction branch requires geometric overlap, horizontal movement toward the opponent, and target frame state 16. Stock walking frames provide this interaction, so walking into a dizzy opponent can catch them without a dedicated grab button. This is narrower than every brief damage flinch. Kind-3 special catches follow a separate branch and are not evidence that ordinary grabs work in every state.

**A grab binds two fighters and consumes a finite grip budget.** Contact assigns the catcher and caught frame numbers, reciprocal links, opposite facing and a grip budget of 300. Cpoint kind 1 controls the hold; kind 2 marks the held victim, whose ordinary movement routine returns early. The lifecycle routine verifies the relationship and releases invalid holds. The sampled basic hold reduces its budget by seven per eligible update; strike frames use different values, and hitlag changes progression. This is a state-dependent budget, not a universal fixed real-time duration.

**The holder can strike or choose a throw.** The cpoint action routine checks both an attack still held and a positive recent-attack age. An available attack action handles a grab strike; attack with a direction selects the throw action. The stock throw startup exposes direction control, and up/down at release can add depth velocity. That is directional choice before release, not steering the victim during flight.

**A thrown fighter becomes a damaging body, then takes landing injury.** Release assigns horizontal velocity according to facing, vertical velocity, the victim's falling animation and an optional depth velocity. A positive `throwinjury` value is stored on the thrown victim. That state enables the falling body's kind-4 contact rectangles, which can strike other fighters. Collision injury comes from those rectangles; landing separately subtracts the stored throw injury from the thrown victim once and clears it. The two damage sources must not be confused.

## Character-data examples

Davis, Dennis, Deep, Woody, Freeze, Firen, Henry, John, Louis and Rudolf were sampled. All ten have a throw startup frame with `wait:3`, followed by a release descriptor with horizontal velocity 13, vertical velocity −7, depth velocity 3 and landing injury 30. Four nominal 30 Hz updates correspond to about 133 ms for that startup frame; this conversion is not a live measurement of input latency or the entire throw animation.

Davis's falling frames illustrate body attacks with injury 30, fall pressure 70 and per-victim rest 20. Their rectangles change with the pose. His basic grab strike specifies injury 15. These values explain the structure of the mechanic; they are not copied wholesale into Fourfold or presented as every character's rule.

Some otherwise-unused original fields contain the sentinel-looking value `−842150451`. Those values were not interpreted as intentional throw speeds or damage.

## Adaptation for Fourfold

The implementation uses the vulnerable opening, linked hold, committed directional launch, body collision and separate landing injury demonstrated above. Its tuning and controls are original:

- **E** grabs a nearby grounded enemy in front while unarmed, after the current jab finishes recovery. A dizzy opening is required; an ordinary flinch is insufficient. E during a hold releases the victim. This explicit input preserves control over whether the player takes a grab or continues attacking, instead of LF2's automatic walk-to-catch.
- A hold lasts at most 1.8 seconds, or 0.9 seconds for a boss. The stationary holder can turn. Interruption or invalid participants end the relationship. These simple deadlines replace LF2's state-dependent grip budget.
- **U** commits a throw with a 0.2-second windup and a chosen horizontal direction. Up/down supplies modest depth aim. Horizontal speed is 760 world units/second, or 550 for bosses, with a 420-unit upward launch. These values suit Fourfold's arena scale and gravity rather than importing LF2's coordinate system.
- A flying victim can hit each crowd member once for 22 base damage, then takes 18 base damage on landing or a wall impact. The per-flight target list, exclusion of player self-hits, boss tuning and explicit release are authored rules. An ordinary knockdown does not turn every enemy into another thrown projectile.
- This pass implements grabbing and throwing; LF2's separate grab-punch action is documented but not added.

REA established these structural mechanics through static evidence. No Windows runtime comparison, live input-latency measurement or frame-perfect emulation is claimed. Gameplay tests and browser validation accompany the implementation.

## Validation

All **155 gameplay tests** and JavaScript syntax checks pass, including 18 grab/throw tests and 8 enemy-count tests. The grab tests exercise naturally earned dizzy openings for all four elements, input timing, turning, finite holds, interruption, burn/death/respawn cleanup, directional release, multiple crowd contacts, lane separation, landing/wall damage and existing weapon controls. The count tests cover all modes, boss-inclusive totals, Auto fallback and training replacement positions.

Keyboard-driven Chromium play confirmed two Earth jabs into E grab, the held pose/HUD, U launch, crowd knockdown and clean landing/release. Separate setup checks confirmed counts 1/3/12 and Auto, training/tournament/story/challenge totals, persistence after reload and separate personal bests. The browser console had zero errors or warnings. Screenshots remain in ignored `output/playwright/lf2-grab-held.png`, `lf2-body-throw.png`, `lf2-throw-crowd.png` and `enemy-count-setup.png`.

The new session snapshot is retained at `output/lf2-analysis/grab-session-snapshot.json`. REA initially reported unconfirmed provider cleanup during close; after the client closed, the reported owned process was no longer present. The individual evidence records and snapshot were saved successfully. Original binaries and analysis output are not part of the playable game.
