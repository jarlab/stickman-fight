# LF2 movement and Fourfold's slower pace

Investigated on 15 October 2026 from the previously extracted LF2 v2.0a files and complete retained REA 6.5.0/Ghidra 12.1.4 evidence. The executable was not run, no tools were installed, and no new native session was needed. These are static findings, not measured gameplay speed or a frame-perfect port.

## Provenance

Target: `output/lf2-analysis/extracted/lf2.exe`, SHA-256 `12dfa00f6b767508612550e9ab27ab74b4201ff4cb9ff31d068925924eab8fc5`.

Character headers are in `output/lf2-analysis/decoded/data/*.txt`. The decode manifest records successful byte round trips; Davis's decoded SHA-256 is `609236581cb1f2bdbf4034c8dc722b308408428b62a8a6365180f4fc56c8301a`.

| Retained routine | Evidence | What it establishes |
| --- | --- | --- |
| `0x40d0a0`, character-data text writer | `evidence/frame-parser.json`, `ev_7b2776bfcc7f7b6edfd07c4d6b6e098ddbd8e17cd36cfdb9bcd5f78d97b2123e` | Literal movement field names and their data offsets; despite the historical filename, this routine writes formatted text |
| `0x40e490`, fighter physics | `evidence/fighter-tick.json`, `ev_e41737e9992b34b3006f8c5c3a3f86b1b3b1cd78ac02ce387ebbca34f6aa3646` | Per-update position integration, ordinary airborne gravity and landing handling |

The text writer labels walk x/depth at offsets `0x08/0x10`, run at `0x20/0x28`, jump vertical/x/depth at `0x50/0x58/0x60`, and dash vertical/x/depth at `0x68/0x70/0x78`. These native values use LF2's coordinate system, not Fourfold units per second.

## Observed values and useful ratios

Davis and Woody have the following identical header values:

| Movement | Horizontal field | Depth field | Initial vertical field |
| --- | ---: | ---: | ---: |
| Walking | 5 | 2.5 | — |
| Running | 10 | 1.6 | — |
| Jumping | 10 | 3.75 | −16.3 |
| Dashing | 18 | 5 | −10 |

Across Davis, Dennis, Deep, Woody, Firen, Freeze, Henry, John, Louis and Rudolf, walking is 5 except Rudolf's 6. Running ranges from Deep's 8.5 to Rudolf's 13. The run/walk ratio ranges from 1.7 to 2.24. Walking depth is roughly 42–50% of horizontal walking; running depth is only about 12–19% of horizontal running. In the sampled data, running therefore increases forward speed while reducing depth speed compared with walking. This is the strongest transferable distinction from Fourfold's previous simultaneous boost of both axes.

The ordinary airborne branch adds 1.7 vertical velocity units per eligible physics update (`0x40e788–0x40e791`); hitlag and special object/state branches are exceptions. At a nominal 30 Hz, Davis's −16.3 launch corresponds to approximately 489 native units/s and gravity to 1,530 native units/s². A continuous ballistic approximation gives 0.64 seconds of airtime. This is an approximation, not an exact discrete frame count or observed input-to-landing time. Fourfold's ordinary 600-unit launch under 1,800-unit gravity gives approximately 0.67 seconds, so slowing ordinary horizontal traversal does not require slowing jump or combat timing.

The earlier [recovery investigation](lf2-recovery-investigation.md) also found Davis ground-roll frames with `dvx:9` over twelve nominal updates, approximately 108 native units before the landing crouch. Different characters have different roll sequences; this is not a universal LF2 recovery distance.

## Independent Fourfold tuning

The following values are authored for Fourfold's 1280-wide arena and elemental styles:

| Movement rule | Value |
| --- | --- |
| Base horizontal walk | Air 210, Water 185, Earth 160, Fire 195 units/s |
| Horizontal running | 1.8 × base walk |
| Walking depth | 0.5 × base walk |
| Running depth | 0.32 × base walk; not multiplied by the run boost |
| Dash | Air 620, others 510 units/s for the existing 0.17-second burst |
| Recovery roll | Initial speed 560 units/s, retaining its existing deceleration and 0.42-second duration |

Walking is approximately 40% slower than the previous values. Dash impulse travel is approximately 105 units for Air and 87 for other elements, before ordinary post-dash motion. A purely horizontal complete roll travels approximately 147 units. Jump arcs, launch vectors, hit reactions, input buffering and committed combat windows remain separate from this traversal tuning.

Difficulty changes AI skill and decisions only. An equivalent fighter receiving the same inputs has the same movement, health, damage, attack windows and mechanical cooldowns on Easy, Normal, Hard and Crazy. Boss warning, recovery and technique reuse timing likewise remain equal across difficulty. Elemental differences and boss phase patterns still exist. This equality is a Fourfold design requirement, not a claim that the original LF2 applies the same difficulty rules.

Validation should retain useful projectile evasion, complete aerial routes, crowd-body escape and punishable roll recovery after the slower movement. The Crazy integration tests compare matched inputs and move commitments across all difficulties, alongside natural crowd and boss-phase simulations. Runtime outcomes belong to Fourfold's tests and browser checks; the LF2 findings above remain static evidence.
