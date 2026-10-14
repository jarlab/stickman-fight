# LF2 held punches and enemy grabs

Static follow-up on 15 October 2026 to the [grabbing investigation](lf2-grab-investigation.md). The question was how a holder can punch without releasing the victim, and whether the enemy controller can use the same mechanics. This pass reuses the complete retained REA records for the exact executable, then checks selected instructions and decoded character frames. It does not repeat already-complete decompilations or execute LF2.

## Evidence and boundaries

The extracted PE32 x86 executable has SHA-256 `12dfa00f6b767508612550e9ab27ab74b4201ff4cb9ff31d068925924eab8fc5`. Each reused record identifies this digest and Ghidra 12.1.4 as its provider; REA version is 6.5.0. Native names below describe observed roles, not original source names. Proprietary records and character data remain in ignored `output/lf2-analysis/`.

| Question | Procedure / source | REA Evidence ID |
|---|---|---|
| Damage, hit reaction and linked positioning | `0x4187b0`, `evidence/grab-position.json` | `ev_be5aa3c8c5b55d737b750f02da57b9e6afbf604ce72eda88e1b55330cc17d34b` |
| Held attack selection and grip lifetime | `0x418c30`, `evidence/grab-lifecycle.json` | `ev_267779490196ce53dd8d0c3a20afdfd605eeb38914d611be9fb8dd92d004a50e` |
| General enemy targeting, movement and attack inputs | `0x4094b0`, `evidence/ai-fighter.json` | `ev_2f04f55cd40df0334a691bea9077413c1eec984fba84e86bbc2bf58932627f45` |
| Additional general attack decisions | `0x4034f0`, `evidence/ai-other-decision.json` | `ev_c26766b99268012ce15810a0930344230e53b37b88225aaab8f86c6bd20a058a` |
| Character-specific holding action | `0x403a40`, `evidence/ai-specials.json` | `ev_6c1926badbd5e3a04fd04bba9ec23c401c63d049dd62308aa830bdee29f22755` |
| Grab eligibility | `0x417400`, `evidence/input-hit-geometry.json` | `ev_5d6fce286091c9fa1effa478d9736ecefefc093ed614f6bd766bbdceb37fa9a2` |

`lf2-objdump.txt` corroborates the addresses below. Ten decoded stock files were checked: Davis, Dennis, Deep, Woody, Freeze, Firen, Henry, John, Louis and Rudolf. These selected files establish their basic hold/punch frames, not every special catch or character variation.

## Held punches

**One strike damages the held victim once.** In `0x4187b0`, the holder must be in state 9 with cpoint kind 1, and the victim must have the reciprocal link and cpoint kind 2. At `0x4188ad–0x4188c2`, nonzero cpoint injury is gated by the holder's frame-age field being zero. Positive injury is subtracted from victim health at `0x418951`; the routine then sets the holder's frame age to one at `0x418979`. The injury descriptor therefore does not damage on every update that displays the striking frame. Normal frame advancement resets the age for a later action; holding the same pose is not a continuous damage source.

**The strike keeps the relationship intact.** That routine continues synchronizing the victim with the holder's cpoint geometry after applying injury. It assigns hitlag counters of +2 to the holder and −3 to the victim at `0x418986` and `0x418997`. These are the native signed counter values, not measurements of browser latency. The victim pose is selected through `vaction`; the sampled strike uses caught frame 132. Unlike an ordinary free-standing hit, there is no launch impulse from this basic grab punch.

**Attack is a committed action before another punch or throw.** The held-input interpreter checks attack held plus a positive recent-attack age at `0x418dc5`. The hold frame's `aaction` selects punch frame 122; directional attack can instead select `taction` 232. Both participants' frame ages are reset when choosing the action. The sampled punch frames do not expose another `aaction` or `taction`, and advance back to the basic hold before those choices become available again. This supports a recovery-gated punch/throw transition. It does not establish an arbitrary long queue or an early cancel during a punch.

| Sampled stage | Character-data values | Nominal duration before hitlag |
|---|---|---|
| Punch startup, frame 122 | All ten: `wait:5`, next 123, no positive injury, grip decrease 7 | Six 30 Hz updates, about 200 ms |
| Strike/recovery, frame 123 | All ten: injury 15, victim pose 132, next 121, grip decrease 3 | Davis/Dennis/Woody: five updates, about 167 ms; the other seven: four updates, about 133 ms |
| Return to hold, frame 121 | Attack selects 122; directional throw selects 232; grip decrease −7 | Held-state control, not a fixed-duration recovery frame |

The nominal conversions use the previously established `wait + 1` update convention. Hitlag and frame scheduling affect elapsed time, so summing this table is not a measured end-to-end repeat interval. Positive injury can be scaled by the victim's damage-scaling field when present.

**Punching does not replenish the grip.** In `0x418c30`, `0x418ceb` subtracts a positive decrease; `0x418cfe` adds a negative decrease, also reducing the budget. The action-selection branches do not reset the initial 300-point grip budget. Expiration is checked in the negative-decrease branch of the hold. Because startup and strike use different costs, and hitlag affects progression, a punch is not accurately modeled as an exact fixed number of grip points without further simulation. A fixed deadline or an extra per-punch cost in Fourfold is deliberate tuning.

## Enemy control

**The grab resolver is shared by human and AI fighters.** Its eligibility checks use movement input, contact geometry and a state-16 dizzy victim, rather than requiring a human controller. The same reciprocal hold, injury and throw routines process the resulting pair. This establishes that an enemy can enter the same hold and execute its attack actions.

**Enemy attacks are expressed through the normal inputs.** In the main enemy controller, `0x40b22b–0x40b298` checks horizontal/depth proximity and a difficulty-dependent chance before setting the ordinary attack flag. This path does not exclude the holder's state 9. The additional decision helper likewise writes the same attack flag. Once a fighter is holding, the cpoint interpreter gives that input its held-punch or directional-throw meaning. This is static evidence for shared action semantics; it is not a measured frequency of enemy punches or throws.

**State 9 affects targeting, and characters can add holding behavior.** At `0x40a196`, a state-9 holder skips a secondary target scan that considers fallen or elevated candidates. The rest of the targeting logic still exists, so this is not proof of a universal hard target lock. In the Louis-specific branch (`data/data.txt` maps character ID 6 to Louis), `0x4045c6–0x4045f5` checks state 9 and a chance gate with bound eight, then generates a fresh jump input. Louis's basic hold declares a jump action. This confirms character-specific decisions during holds; it must not be generalized into a rule for every fighter.

No fixed “always punch N times, then throw” strategy was established in the inspected general controller, helper, or character-special routine. Exact enemy grab frequency, the distribution of chosen throws, and reactions under live crowd conditions remain unmeasured. Fourfold's short decision pause, punch count, throw choice, and any protection against the rest of the crowd piling onto a held player are authored gameplay decisions.

## Fourfold adaptation and validation

Fourfold now uses the same grapple controller for both teams, with the following adaptation:

- **E** catches a nearby grounded dizzy enemy when unarmed and **E** releases. **J** during a hold performs a single 15-base-damage punch; **U** throws. Existing difficulty and Earth defense modifiers still apply to damage.
- The held punch has 6/30 seconds of startup and a total action duration of 11/30 seconds before contact pauses, following the sampled Davis-style interval. One marked contact applies injury and recoil without movement, ordinary fall-pressure accumulation, or releasing the pair. The victim recoils while the holder's other hand maintains the grip.
- Another J or U waits for full recovery. The existing five-tick input buffer ages on the world clock, including hitlag. Commands and mobility are discarded during a hold. These explicit keys and short press buffer are Fourfold's controls, not LF2's directional-attack input encoding.
- The existing 1.8-second hold (0.9 seconds for a boss victim) continues to expire through punches and contact pauses. This fixed deadline is an authored simplification of LF2's state-dependent grip budget; punches never renew it.
- Unarmed enemies stop extending a combo when it produces a dizzy opening, close to within 50 world units and 15 depth units, and wait out the player's hit protection before catching. They retain their difficulty-based reaction cadence and attack-slot limits.
- Enemy holders pause for roughly 0.25–0.39 seconds according to difficulty, punch once, then throw after recovery. This readable sequence is an original policy, not a recovered LF2 punch-count rule. Other enemies reposition and stop queuing new attacks while the player is held or thrown; already committed attacks remain committed and normal interruption rules apply.
- Enemy throws launch the player through the same flight/landing system. Landing injury remains pending even if the thrower is defeated, and respawn clears the old flight. The existing opposing-team collision rule is preserved: thrown enemies hit the enemy crowd; a thrown player does not damage the thrower's teammates or generate self-hits.
- Unrelated unblocked hits interrupt a hold; death, release, expiration and placement clear paired links and queued actions. Training dummies retain their simple sparring behavior; active fighters and guardians use the new grapple decisions.

All **190 gameplay tests** and JavaScript syntax checks pass. Thirteen new engine regressions cover held-punch windup, one-shot injury, reaction, late buffered J/U, finite grip, interruption, KO, enemy-held punches, enemy throws, missing throwers, landing once, respawn and input cleanup. Twenty-two new AI regressions include natural combo → dizzy → grab → punch → throw → landing sequences for all four elements, difficulty-specific decision pauses, eligibility and crowd attack-slot behavior. Two tests start from untouched normal-survival spawns with the browser seed, covering the spacing issue found during browser testing. After a confirmed dizzy hit, enemies can close during recovery while retaining their facing and completing the entire attack before catching.

Keyboard-driven Chromium play confirmed two Earth jabs → E grab → J held punch → late U throw into the crowd. A fresh normal-survival run also confirmed an Earth enemy naturally grabbing the Air player at about 4.26 seconds, pausing, punching, throwing, applying landing injury, and restoring player movement after knockdown. The final inspected state had no orphaned links or flight and allowed depth movement. The browser console had zero errors/warnings, and the local page and modules returned HTTP 200. Screenshots are retained in ignored `output/playwright/lf2-held-punch.png`, `lf2-punch-into-throw.png`, `lf2-enemy-grab.png`, `lf2-enemy-held-punch.png` and `lf2-enemy-body-throw.png`. No new native session was opened for this follow-up because the retained REA evidence already covers the selected questions; there is no additional provider process to close. No Windows runtime comparison or frame-perfect emulation is claimed.
