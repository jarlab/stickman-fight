# LF2 enemy AI investigation

Investigated 15 October 2026 with REA 6.5.0 and Ghidra 12.1.4. This follows the [combat and input investigation](lf2-combat-investigation.md) and uses the same extracted LF2 v2.0a executable, SHA-256 `12dfa00f6b767508612550e9ab27ab74b4201ff4cb9ff31d068925924eab8fc5`.

This is static native-code analysis, corroborated against disassembly and the extracted character registry. LF2 was not executed. The findings describe inspected branches, not an exhaustive reconstruction of every character or mode. Proprietary files and decompiler output remain under ignored `output/lf2-analysis/`; the browser game does not load them.

The REA session was closed after saving `output/lf2-analysis/ai-session-snapshot.json`, containing seven evidence records. The input-poll evidence reused below belongs to the earlier input investigation.

## Evidence

Artifacts below are relative to `output/lf2-analysis/`. Their filenames are investigation labels, not recovered function names.

| Address | Observed responsibility | Evidence artifact | REA evidence ID |
|---|---|---|---|
| `0x4094b0` | Computer fighter target selection, approach, item choices and ordinary attacks | `evidence/ai-fighter.json` | `ev_2f04f55cd40df0334a691bea9077413c1eec984fba84e86bbc2bf58932627f45` |
| `0x403a40` | Character-specific special-action decisions | `evidence/ai-specials.json` | `ev_6c1926badbd5e3a04fd04bba9ec23c401c63d049dd62308aa830bdee29f22755` |
| `0x408cb0` | Held-weapon decisions, including a conditional obstruction check | `evidence/ai-threats.json` | `ev_9ca550c8a581ba8f689d0310eb9e6909b7bade88eb712c14c0a5578de9c23688` |
| `0x4034f0` | Additional close attacks and directional special-command setup | `evidence/ai-other-decision.json` | `ev_c26766b99268012ce15810a0930344230e53b37b88225aaab8f86c6bd20a058a` |
| `0x419a60` | Input polling, including dispatch to computer fighters | `evidence/input-poll.json` | `ev_de1785d7f88a1e1286d105b46d6107f7b536b60c123c3777836c77c7d40bb10e` |

The input-poll caller at `0x419df4` invokes `0x4094b0` for active objects whose file type is 0 (characters). The adjacent call to `0x406ba0` applies to non-character objects with a positive frame field; it is not the primary enemy-fighter AI. Likewise, `0x417400` is interaction geometry, and `0x403270` is teleport destination selection. Neither is an enemy-AI dispatcher.

## What the inspected code establishes

**Fighters choose a target and tend to retain it.** The initial target scan at `0x40a0b8–0x40a128` checks health, team relationships, lying state and invulnerability, then ranks eligible objects by `abs(dx) + abs(depth difference)`. A second scan also considers nearby lying or invulnerable opponents; therefore the first scan's exclusions are not a universal rule. At `0x40a29e–0x40a31f`, a valid living character target stored at object offset `0x360` usually survives the next selection pass. A random check with bound 30 occasionally permits replacement. This is persistent individual targeting, not a fresh choice of the nearest fighter every update.

**Positioning distinguishes horizontal reach from depth alignment.** In an ordinary melee approach branch, horizontal movement closes distances greater than 60 native units. The depth branch at `0x40b02d–0x40b0c0` corrects errors outside approximately ±3 units, subject to hazard and state checks. A usual melee opportunity at `0x40b232–0x40b298` requires depth difference below 5 and horizontal distance below 80 after accounting for two samples of the attacker's horizontal velocity. Disassembly explicitly loads the attacker's velocity here. This is motion-aware reach handling, not evidence that all attacks predict the player's future position.

**Ranged characters keep a different distance.** IDs 4, 5 and 31 resolve in the extracted `data/data.txt` to Henry, Rudolf and Hunter. Their approach branch around `0x40af4d` uses 170-unit and facing-dependent 150-unit boundaries rather than the ordinary 60-unit boundary. Other branches choose retreat, guarding, jumping or attacks according to character, current state, health and range. There is no single range shared by the entire cast.

**Difficulty changes the frequency of opportunities.** The AI derives several probability parameters from global `0x450c30`: a common attack gate uses `random(3 × penalty + 3) == 0`. Menu code around `0x42cdc2` and literal strings map penalty 2 to Easy, 1 to Normal and 0 to Difficult. That branch therefore accepts approximately one in nine, six or three eligible samples respectively. Mode and character exceptions can force the penalty to zero. These are conditional random gates, not measured reaction delays or proof that every action uses the same odds.

**Defense responds to visible attack state and lane.** Around `0x40b0fc–0x40b17b`, a probabilistic guard branch checks the opponent's attack state, facing and depth difference below 9. The additional helper at `0x4034f0` examines character identity, range, current frame and direction when constructing special commands. It does not simply choose a random action irrespective of geometry.

**There is local hazard avoidance, but no recovered crowd formation system.** The horizontal/depth obstruction flags consumed by the main movement branches originate from specific objects: John-ball shield/healing states, Firen flame and Freeze column (`0x40a450–0x40a6b0`). They can suppress a direction and redirect movement along the depth axis. These flags do not prove that ordinary teammates receive surrounding positions or coordinate attack turns.

The weapon helper `0x408cb0` includes a narrow-depth, between-horizontal-positions test across the first 20 object slots. Its team condition compares the chosen target's team with the acting fighter's team in the inspected assembly, so it should not be described as a proven universal friendly-fire avoidance system. Neither this branch nor the inspected main fighter routine established attack reservations, flanking slots or a maximum simultaneous-attacker count.

## Translation into Fourfold

The useful transferable behavior is deliberate lane alignment, distinct preferred distances, stable intent, state-aware attacks and difficulty-dependent willingness to act. Native coordinate distances and per-update random odds are reference values; Fourfold has different character proportions, movement speeds, combat frames and a 120 Hz simulation.

The implemented controller is [`src/enemy-ai.js`](../src/enemy-ai.js). It translates those findings as follows:

- **Approach deliberately.** Each enemy keeps an assigned side of the player while its destination follows the player's position continuously. Enemies close to an elemental preferred range, align depth, and stop movement input when committing an attack. Movement braking projects the enemy's own momentum by 100 ms; melee reach accounts for roughly two nominal LF2 samples of its own horizontal velocity. Neither predicts the player's future movement.
- **Use distinct elemental decisions.** Air favors aerial pursuit; Water has a longer preferred melee distance, greater ranged willingness and a healing burst below 55% health; Earth approaches more conservatively and uses fewer ranged attacks; Fire closes more aggressively and begins running at a shorter chase distance. Powers check energy and cooldowns. Bosses retain wider reach and additional burst opportunities.
- **Choose attacks at a bounded cadence.** Easy, Normal and Hard reconsider discretionary combat actions at base intervals of 250, 170 and 110 ms, each varied by ±20%. These intervals and the authored attack chances replace the native per-update random gates; the native odds are not copied into a 120 Hz loop. Connected melee attacks may queue a follow-up late in recovery, subject to facing, lane, height and chain-length checks.
- **Guard recognizable frontal melee pressure.** A probabilistic guard decision requires a nearby melee attack, compatible facing, close depth and more than 60 ms of the opponent's attack progression. Water is more willing to guard. A guard lasts 240 ms and has a 1.2-second reuse delay. The existing combat system handles guard energy and breaks. This controller does not react to projectiles.
- **Respect opponent and resource state.** Enemies stop acquiring attack opportunities while the player is knocked down and cease pursuing a dead player. Ranged attacks require suitable range, depth, height, resources and an unobstructed teammate lane. After a shot or throw, that fighter must close toward melee range before shooting again, as well as waiting at least three seconds.

**Our crowd coordination is an original adaptation.** Easy, Normal and Hard allow one, two and three concurrent offensive commitments respectively, including buffered follow-up attacks. Finished attackers step back briefly; fighters that have waited longer receive priority for the next opening. An approach that cannot produce an attack within four seconds yields its turn so a blocked pair cannot hold up the whole crowd. Stable left/right positions, depth routes when crossing the player's front, temporary teammate detours and clear-shot checks keep crowds readable. When the player is near a horizontal arena boundary, enemies choose the available side instead of seeking a position beyond the edge. Assignments rebalance when the player returns to the center.

Those assignments, detours, rotations and attack limits are Fourfold gameplay choices, not recovered LF2 algorithms. They translate the observed attention to range, lane and obstruction into fights against larger crowds. The single-player game has only one human target, so it does not recreate LF2's multi-opponent target-switching probabilities.

The original [xsoameix reverse-engineering notes](https://github.com/xsoameix/lf2) supplied address and structure leads. Behavior claims above were checked against the supplied executable rather than accepted solely from community labels.

## Validation

- All **129 gameplay tests** pass, including **17 enemy-AI behavior tests** covering same-side crowds, ally detours, attack limits and rotation, target escape, knockdowns, reaction windows, committed attacks, per-element energy costs, screened shots, depth-boundary pressure and corner exits. The boundary and corner regressions failed before the routing corrections.
- Independent simulations of **144 seeded boundary scenarios** sustained attacks through 18 seconds, involved at least four distinct fighters per run, and stayed within Normal's two-attacker limit.
- Browser checks at `http://127.0.0.1:5173/` exercised Survival, Normal/Hard difficulty, movement, jumping, dodging, melee and powers. Live Hard sampling observed attacks and enemies on both sides without exceeding three active attacks. Screenshots are retained under ignored `output/playwright/lf2-ai-*.png`; the browser console had no errors or warnings and local modules loaded successfully.
- JavaScript syntax checks pass. LF2 itself was not run: native findings remain static-analysis conclusions, while the browser behaviors above were tested in Fourfold.
