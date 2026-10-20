# Fourfold — Elemental Arena

A local, single-player browser brawler inspired by Little Fighter 2's crowd combat and elemental martial arts. Four original stick fighters, seven enemy archetypes, eight Canvas arenas, zero runtime dependencies or external assets: all art is drawn in code and all sound is synthesised in WebAudio.

## Play locally

With Node.js installed, run:

```sh
npm start
```

Open **http://127.0.0.1:5173** in a desktop browser. No `npm install`, game editor, or build step is needed. Use `PORT=5174 npm start` to choose another port. Keep the server running while playing. Inputs use physical key positions.

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
| J while carrying a mill stone or lantern | Throw it (neither one swings) |
| Up + J while grounded and unarmed | Elemental launcher; costs 8 energy |
| Space + J after a launcher hits | Jump follow-up into an aerial chain |
| K | Elemental shot |
| L | Signature ability |
| I | Guard; raise it just before a frontal hit to parry |
| I → left/right → J | Elemental shot command |
| I → up → J | Signature command |
| E | Grab a nearby dizzy enemy while unarmed / release; otherwise pick up a weapon or the bracer, use a consumable (drink, eat, swallow, plant or absorb it), or drop (the weapon first, then the bracer) |
| Hold E beside a bound villager | Free him (0.6 s; letting go, a blow or being knocked out of reach starts over, with a fresh press). Or break his cangue: your blows never hurt him, and three cracks free him. Keep E held from a press further off and he is freed as you step up to him; close to him E never drops your weapon |
| U | Throw a held enemy into the crowd, or throw your weapon |
| Escape | Pause / resume |
| R after a run | Retry |
| Tab / Enter | Navigate / activate menus |

**Match an opponent's lane to land melee and projectile hits.** Shadows show where jumping fighters will land. Watch enemy windups, guard toward an attacker, and move through depth to evade. Energy regenerates; melee hits and knockouts restore more. Weapons wear out (see [Weapons and items](#weapons-and-items)). Knockdowns provide a brief protected recovery. Switching tabs automatically pauses.

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

## Enemy archetypes

Seven original non-elemental foes fight beside the elemental enemies. They have no element: their hits, sparks and KO bursts are plain ink, their trails and guard bubble take their own accent, and their health bars their own colour. Each reads by silhouette alone (head gear, weapon, build). The drawings live in `src/enemy-art.js`; their numbers in `ARCHETYPE_STATS`, `ARCHETYPE_COMBAT`, `ARCHETYPE_MOVES` and `ARCHETYPE_RULES` (`src/data.js`).

| Archetype | Health | Fights by | Beat it by |
| --- | --- | --- | --- |
| **Road Cutthroat** (bandit, plum head wrap, cleaver) | 70 | A quick slash, then the Cleaver Drop: the cleaver goes up behind his head (the tell) and comes down in a leaping chop that knocks down. He races you to a dropped consumable (only a race he clearly wins) and runs off with it; he drops it where he falls. Below a quarter of his health he drops a smoke pellet at his feet once (the 0.2 s throw is armoured: a light blow does not stop it): a 40 px smoke puff swallows him and he holds still inside it for 1 s (no health bar, nothing can hit him), then he flees for 1.6 s. A heavy blow that cuts the throw short, or knocks him out of the puff before it bursts, leaves him the escape for another try. Bandits grab dizzy opponents like the elements. | Finishing him before he reaches a quarter, a heavy blow during the throw, or catching him as the smoke thins. |
| **Reed Archer** (hunter, moss hood, recurve bow) | 75 | Keeps 330 px away on your lane and backs off when rushed (pinned at a wall he fights with a bow jab). Flat shots fly level at 900 px/s and are gone after 520 px. Every third shot is the Three-Reed Volley: three arrows loosed 45° up, falling under gravity (1400 px/s²) to land 34 px apart around your feet; they stick in the floor for 4 s, quivering as they land. Their floor shadows show where they come down. On Normal and above he also lobs a volley over his own crowd, at most every 4 s. | Changing lanes against flat shots; moving off the shadows against a volley; closing in. |
| **Chain Ox** (brute, bare torso, chain and ball) | 220 | The Chain Lash (116 px, knocks down) is armoured through its wind-up: no flinch, 60% damage. The Meteor Whirl swings the ball overhead and hits both sides within 70 px. His chain hook (380 px) reels a victim in to 62 px in front of him, into his lane. He catches dizzy opponents and throws them; nobody can grab him. He never runs. From Survival wave 4 or the last trial; one per wave. | Heavy blows (they still flinch him), keeping out of the whirl, punishing the hook's recovery. |
| **Talisman Priest** (sorcerer, tall cap, slips) | 80 | Stays 320 px back. Heals the most hurt ally below 70% of its health (an easy priest the first he sees) within 380 px: a ward under the ally and a tether from his slip hand, +10 health per second for 2 s; any blow that lands on him cuts it; the next heal can start 6 s after this one began. His slow homing talisman (300 px/s, turning 2.4 rad/s) seals your shot and signature (K and L) for 2 s: a slip floats by your head and the HUD counts it down. One per wave. | Going for him first; hitting him mid-heal. |
| **Gate Warden** (guard, helmet, tall round shield) | 140 | Every frontal blow and shot stops on his shield (a clang and BLOCK, no damage), while he advances and cuts over the shield with his sword or barges with a Shield Rush. A glint runs along the shield rim while you stand in front of him (within 220 px). He turns to a foe behind him only after 0.35 s, and never runs. | Getting behind him (or over him), guard breaks (Earth's finisher, the guandao), throwing him or throwing someone into him, a lantern blast or a signature burst. |
| **Mendicant Monk** (monk, bald head, crescent-spade staff) | 120 | Staff jabs and the Crescent Thrust (122 px). He plants his staff for the Iron Bell: for 2.4 s the next blow on him is nullified (a shot or a signature burst too: nothing follows it, no lift, slow, stun or seal), the bell rings, and a striker in contact reels dizzy for 0.9 s (so another enemy can grab you). He raises it against a jab rhythm, a blow he sees coming or a shot. When he falls his staff drops as a real staff pickup about a third of the time. | Baiting the bell and waiting it out (or hitting it from range), then striking. |
| **Bound Villager** (captive, wooden cangue) | 40 | No foe: the bandits left him on the far side of the arena. Only bandits can hurt him; one goes for him whenever you are over 300 px away, chopping slowly (a 1.1 s beat plus its reaction), and he calls for help (a come bubble) as they close in, unless you stand by him. While he waits the HUD shows the rescue under the stage. **Hold E** beside him for 0.6 s (a gauge fills over his tag), or crack his cangue with three blows (they never hurt him), to free him: the cangue bursts off, a herbal tonic drops beside him, the rescue scores 300, he cheers (a join bubble) and hobbles off the nearest edge. Cut down, he lies curled up and the rescue is lost. He kneels where he is until freed or lost, through later waves. | Staying near him, or clearing the bandits. |

Archetypes use the same crowd turns as the elements: their attacks count against the difficulty's limit of simultaneous commitments, they line up with your lane before striking, and their wind-ups and recoveries are the same on every difficulty. Errands (stealing, healing, smoking out, going for the villager) take no attack turn. Difficulty changes only their decisions: reaction time, how far the archer leads a moving target with his volley (not at all on Easy, fully on Crazy), whether he lobs over his crowd (not on Easy), the race a bandit will run for an item, how slowly he chops at the villager, how often the monk reads a blow and which ally the priest heals.

## Modes

All modes, classes, arenas and difficulties are available immediately. **Enemies per wave** offers Auto (the original mode progression) or **1–12** opponents. Custom counts include the guardian on boss waves. Training replenishes that many sparring partners. Counts persist between visits and have separate personal bests.

- **Survival:** endless waves; an elemental guardian every third wave. From wave 2 two archetypes take ordinary slots (three from wave 5); waves 2, 5, 8 … bring two bandits and a bound villager to free.
- **Training:** sparring opponents, regenerating health/energy, unlimited lives; one partner on Auto.
- **Tournament:** three consecutive guardian fights; custom counts add (elemental) supporting enemies.
- **Challenge:** three waves with one life; twelve opponents on Auto, or three times your selected count. Each trial mixes in as many archetypes as its number (the second brings a bound villager).
- **Story:** four short combat stages through the elemental sanctuaries, each with a guardian, whichever arena is selected. From chapter 2 an archetype joins the guardian's supporters (two with larger counts); chapter 3 brings a bound villager. This is a combat prototype, not a narrative campaign.

An archetype takes a slot of the wave's total, so every count stays as selected, and at least one ordinary foe stays elemental (a single opponent always is). The kinds are drawn from the seeded random stream: at most one Chain Ox and one priest per wave.

In every mode but Training, every third wave (Survival's 3rd, 6th, 9th and so on; the third trial, guardian or chapter elsewhere) opens with a spirit orb of the arena's element at its heart (see [Arenas](#arenas)), and a guardian breaking into its second phase sheds an orb of its own element on your side of it (see [Consumables](#consumables)).

Normal runs have three lives and no time limit. Regular enemies have the same health as a playable fighter of their element: Air 100, Water 115, Earth 145, Fire 105, on every difficulty; archetypes have their own (see [Enemy archetypes](#enemy-archetypes)). Difficulty scales AI skill: awareness, prediction, defensive choices, combo use and crowd coordination. Movement speed, damage, health, attack animation windows and mechanical cooldowns remain identical for an equivalent fighter across all difficulties. Bosses retain larger encounter health pools with the same values on every difficulty. A cleared wave restores some health and energy.

**Crazy** is available immediately above Hard. Up to four enemies coordinate attacks, with the strongest awareness and prediction. They evaluate projectile escape lanes and recognize visible guard-breaking attacks when choosing a defense. Their attacks keep the same windup and recovery as on Easy, Normal and Hard; boss warnings and pauses also remain consistent. Crazy has its own saved personal bests.

Each guardian has two situational techniques and a new pattern at half health. Fire charges and sweeps before unleashing Wildfire eruptions. Air retreats into gusts and then surrounds space with cyclones. Earth braces for quakes and pillars before opening sequential faultlines. Water yields behind a guarded counter, then fills alternating lanes with rising tides. Floor markings lock when a move starts: sidestep lanes, jump low waves, leave pillar/eruption marks, and attack during the clearly labeled recovery. Boss phase changes grant no healing or invulnerability.

Enemy decisions use visible movement and short-lived attack history. Repeated projectiles encourage flanking, repeated jabs encourage a defensive beat and counter, and retreating targets can provoke a dash pursuit. Nearby fighters receive useful attack turns while crowds retain their Easy/Normal/Hard/Crazy limits of 1/2/3/4 simultaneous offensive commitments. Normal/Hard/Crazy enemies also use recovery rolls after knockdown.

See [the LF2 boss investigation](docs/lf2-boss-investigation.md) for the REA evidence and the distinction between recovered behavior and our original elemental encounters.

Enemies line up with your lane before striking, move around blocked approaches, and spread to both sides when there is room. Easy, Normal, Hard and Crazy allow one, two, three and four simultaneous attack commitments respectively, including aerial pursuits. Fire rushes in and keeps pressure on; Air stays outside the pocket, evades diagonally and probes for openings; Earth holds its ground and guards approaches; Water guards, redirects and returns with a counter. Normal/Hard/Crazy enemies predict visible movement and projectile paths, choose attacks by their usefulness in the current situation, punish missed attacks or exposed landings, complete earned air combos and roll out of knockdowns. Decisions have reaction delays, committed movement and normal resource costs. Easy retains slower decisions and ordinary get-up recovery. Enemies respect protected knockdowns and wait for you to become vulnerable.

Settings (including Sound and Music), best scores, furthest stages and completed runs save in this browser's local storage by mode/difficulty. Active fights restart after reload. All art is drawn in code. Distinct martial stances, casting windups, air crescents, water ribbons, stone fists and flame lashes make each element read differently. Signatures produce cyclones, curling tidal crests, stone columns and flame novas.

## Arenas

Pick any of eight arenas in the setup menu; the choice is saved with your other settings. Every arena has the same floor: back ledge, depth limits, walls and floor rows are identical, so an arena never changes how a fight plays. Each arena has its own element, used for the third-wave spirit orb. Story chapters always visit the four sanctuaries, whichever arena is selected.

- **Elemental sanctuaries:** Sky monastery (air), Moonlit harbor (water), Jade courtyard (earth) and Ember caldera (fire).
- **Bamboo grove** (air) · *Where the wind bends*. A misty grove on both sides of an open clearing, a whitewashed wall with a moon gate, a lashed bamboo railing and cut-bamboo edge posts. Leaf sprays sway on the frame stalks, while 12 leaves fall and 5 wind streaks cross the air.
- **Dusk rampart** (earth) · *Along the endless wall*. A dusk sky with a low sun, the wall riding three ridge bands, a beacon tower and a watchtower, and the back parapet. Swallowtail war banners with a compass star flutter on the edge poles, a V of geese crosses, beacon smoke rises and bends, and dust motes drift.
- **Lantern market** (fire) · *After the last bell*. A dusk street of nine lit shophouses, a hillside pagoda and a rising moon. 19 paper, ochre and grey-maroon lanterns sway on strings, eaves and lamp posts, 5 sky lanterns rise and the wok steams. The lanterns hang above the centre of the arena, out of the way of fire effects there.
- **Tidewater keep** (water) · *Behind the sea gate*. A masonry keep with an arched sea gate, barred cells, gallery chains and weed under a sea-rock overhang. Drips fall into the tide channel, swell moves through the gate, gulls glide past, glints slide along the quay and mooring chains swing.

Moving parts that hang from the scenery (banners, lanterns, chains, leaf sprays, drips, smoke) do not move with screen shake; only the fighters and free air particles do. Reduced motion holds every arena still. The first banner of a run on one of the four new arenas carries a name card below it (*BAMBOO GROVE · Where the wind bends*), which fades out with the banner; a run that opens with a guardian (every Tournament) skips it, so the guardian's health bar never covers it. All four new arenas are drawn in code (`src/arena-art.js`).

## Weapons and items

Pickups appear at the start of every wave and every 12 seconds (at most three on the floor). Each weapon swings with its own reach, bonus and weight, and **U** throws it with its own flight. A worn-out weapon snaps in the hand; a thrown one breaks where it hits, lands or reaches the arena wall, and its pieces fly and settle on the floor. A knocked-down fighter keeps its weapon and bracer, drawn lying with the body. All art is drawn in code (`src/weapon-art.js`); the numbers live in `WEAPON_SPECS` (`src/data.js`).

| Item | Hits | Reach | In the hand | Thrown |
| --- | --- | --- | --- | --- |
| Waxwood staff | 20 | 118 | +9 damage | 32 damage, spins end over end, knockdown |
| Red-tassel spear | 14 | 142 | +9 damage, a straight thrust | 34 damage, point-first, runs through the first body and hits the next |
| Sealed crate | 1 | fist | one smash: 650 knockback, knockdown | 48 damage, 800 knockback, shatters; a broken crate (thrown or smashed) spills two steamed buns |
| Twin moth knives | 16 | 86 | +6 damage, windup x0.8 | the pair spins out: two blows of 14, no knockdown |
| Iron crescent guandao | 10 | 158 | +16 damage, windup x1.4, breaks guards, sweeps a wider depth band (48 vs 32); walking x0.85 | 44 damage, slow heavy spin, short range |
| River stone | 1 | fist | +4 on one punch | 18 damage at the fastest speed (1050), staggers, no knockdown |
| Mill stone | 1 | — | none: J or U throws it; walking x0.7 | 52 damage, knockdown; lands and rolls 1.1 s down the lane, then splits |
| Thunder lantern | 1 | — | none: J or U throws it; its 4 s fuse lights as you lift it and bursts in your hand when it runs out | bursts on contact, landing or at the wall: 30 fire damage plus burn to every opponent within 70 px (and to you, if it bursts in your hand) |
| Gale chakram | 12 | 96 | +7 damage | 22 damage on the way out and 22 on the way back; turns after 0.55 s and returns to your hand in your lane (each cut wears it); a parried chakram flies straight on and breaks |
| Frost jian | 18 | 126 | +10 damage; every blow chills (slow 0.4 s), every third that lands freezes for 0.6 s | 36 damage in a straight line, freezes; shatters into ice that melts away |
| Jade bracer | 6 | — | worn on the lead forearm with your fists free (a weapon can still be held): frontal hits take half damage and a blocked hit never chips; the sixth frontal hit breaks it (it cannot shield you from a lantern bursting in your own hand) | never thrown: E takes it off and it tumbles to the floor as a pickup |

The **frost jian** is a relic: it never appears as an ordinary pickup and drops only where the Water guardian falls (in Story it travels on to the next sanctuary). Ordinary drops are weighted: staff, spear, knives and stone most often, then the crate and chakram, then the guandao, mill stone, lantern and bracer; about two in five of the 12-second drops are a consumable instead (the drop at the start of a wave is always a weapon or the bracer). A dropped weapon keeps its wear, and a dropped lantern keeps what is left of its fuse (unlit on the floor). Every pickup lies on the floor for 28 seconds (a dropped weapon or a crate's buns 20, a relic 30) and blinks out over its last five, faster as it runs out, then dissolves in a paper wash.

### Consumables

Press **E** over a consumable to use it: you turn to it, lift it and use it, and its effect lands about two thirds of the way through (the censer as it touches the floor). While an item is in use you stop where you stand and cannot move, guard, jump or attack, and pressing **E** again does nothing. A held weapon is slung across your back (a crate, mill stone or lantern rides like a pack; the twin knives and a throwing stone are tucked into your sash) until you finish. A use still playing when a new Story chapter begins finishes at once. A blow before the effect lands knocks the item out of your hand and it is lost: a flask or jar shatters, food and the censer bounce away, an orb bursts. Drained tonics and wine jars are smashed at your feet and an empty gourd is tossed aside. With several items in reach, **E** takes the nearest one. Only the item **E** would take shows its prompt (a consumable's ink E seal, a weapon's E badge): none while you are in the air, stunned or using an item, or when **E** would grab a dizzy opponent instead. The HUD names the item in use and counts down the elixir and qi flow. The drawings live in `src/pickup-art.js`; use times, effect points and spawn weights in its `CONSUMABLES`, the effects in `ITEM_EFFECTS` (`src/data.js`).

| Item | Use | Effect | Found |
| --- | --- | --- | --- |
| Herbal tonic (celadon flask) | drink, 0.5 s | +40 health | common (weight 22) |
| Qi wine jar | uncap and pour, 0.6 s | +55 energy | common (18) |
| Steamed bun | eat, 0.3 s (the quickest) | +15 health | common (26); two spill from every broken crate |
| Ginseng tea gourd | drink, 0.5 s | +20 energy, then qi flow: +6 energy per second for 8 s | uncommon (12) |
| Sandalwood censer | set down, 0.7 s | plants a regen field 90 px in radius (180 px across) for 10 s: +4 health per second for you while you stand in it | uncommon (8) |
| Longevity peach | eat, 0.55 s | +80 health; clears burn and slow (a freeze, like a blow, knocks it out of your hand) | rare (4) |
| Golden elixir pill | pinch, flick and swallow, 0.45 s | power for 8 s: your blows deal +30% damage and +20% knockback | rare (4) |
| Spirit orb (air, water, earth, fire) | draw into the chest, 0.5 s | +50 energy; an orb of your own element gives +100 and readies your signature at once | drops only: a guardian's phase break and every third wave |

As the effect lands a dashed ring and sparks converge on your chest, then a soft ring pulses out, motes spiral up and the item's badge rises beside your head. The elixir circles your waist with a gold countdown ring, qi flow spirals up your torso as a blue ribbon (both blink in their last 20%), and the censer field turns its dashed ring with smoke at the rim and rising crosses, which also rise around you while you regenerate in it. A lost life ends the elixir and qi flow.

## Ink effects

Every effect is an original wuxia-ink brush drawing (`src/vfx-art.js`). Inked shapes never fade out: they shrink, thin or erode.

- **Hits:** a light paper star or a heavy three-layer burst, over the attacker's element layer: wind crescents, a water splash whose droplets splat on the floor, earth rubble that lands and settles, or a fire burst with embers and smoke.
- **Guard and parry:** a block shows a guard spark and a parry a lopsided blade glint, each hiding the guard bubble while it plays.
- **Brush slashes:** these replace the attack trail for weapon swings (staff sweep, spear thrust, crate or running-charge cleave), earth and fire uppercut launchers, hammer/spike/dive aerials and Water's sweeping palms (the first ground palm and the aerial palm swirl around the body). Other strikes, including the elemental finishers, keep their trail, which drops to 35% once it connects.
- **World:** a freeze finisher raises an ice column that holds the target until it cracks, thaws or shatters. Wildfire eruptions and thrown weapons explode where they hit or land (a mill stone full size, a crate a little over half, a staff, spear or guandao smaller, knives, chakram and stone smallest; the frost jian shatters into ice instead, and a mill stone that rolls to a stop splits in a small puff of dust), and fire finishers and Wildfire marks leave a burning floor patch where the body comes to rest.
- **Weapons:** a breaking weapon snaps with an ink puff and its pieces (planks, splinters, blade tips, ring arcs, jade fragments) fly, bounce once and settle; the thunder lantern bursts into a brushed fireball with flame tongues, paper scraps and rising smoke. Thrown weapons aim along their flight and are mirrored, never upside down, when flying left. The ice lance raises a line of ice columns. Knockdowns land in heavy dust, and running, dodges, jumps and recovery rolls kick up foot dust. Burning fighters smoke.
- **Arrivals and KOs:** enemies arrive through an elemental summoning swirl and hold still inside it until it reveals them; a wave's arrivals at one edge appear one after another, each a step further in. The player respawns through a swirl too. Guardians changing phase are wreathed in one. A KO stamps a brushed enso and a red seal in the finishing element (the run-ending fall included; effects finish playing behind the result screen), and fallen bodies dissolve into a pale ink puff.
- **Projectiles:** energy balls trail an inked element ribbon that sheds air curls, water drips, earth grit or flame licks. The ribbon keeps one size behind every ball and starts just inside its rim.

- **Archetypes:** a volley's arrows stick in the floor where they land; the bandit's smoke puff bursts out, holds and dissolves over him; the priest's octagonal ward lies under the ally he heals, with a dashed tether from his slip hand; the monk's Iron Bell closes round him (a highlight sweeps it) and rings out in ripples when struck; the warden's shield clangs; a freed villager's cangue splits and tumbles off. Their swing trails are their own: tapered crescents for the cleaver, chain, sword and slip throw, speed lines for the staff thrust, a bowstring twang for the archer, impact arcs for the shield rush.

Team command bubbles (come, stay, move, join) come from `game.commandIcon(fighter, command)`: an enemy rotated out of the fight for another's turn shows stay, one the crowd sends to your other side shows move (at most one bubble per fighter every 5 s), and the bound villager uses come (calling for help) and join (freed). Reduced motion removes the roll spin, gathering orbit, camera shake, focus lines, debris (weapon pieces and flung or knocked-out consumables included), flecks and rotating rings, and stills thrown-weapon spin, pickup bobbing and glints, weapon tassels, steam and smoke, the consume sparkle (its pulse ring and badge stay) and the buff rings; a pickup running out fades steadily instead of blinking, without the dissolve. It also stills the archetypes' extras: the talisman's tumble, the heal ward's spin and its tether's dashes and motes, the bell's highlight, a stuck arrow's quiver, the smoke's wobble and the rescue tag's bob; their swing trails become a contact chevron. It keeps clear action silhouettes, sparks, break puffs, the lantern burst and simple signature outlines.

## Sound and music

Sound is **off by default**; the **Sound** toggle (header or pause panel) turns it on, and no audio is created until then. **Music** turns the two loops on or off on their own, and the **Vol** slider in the header sets the overall volume (saved with your settings). Every sound is an original WebAudio synthesis (`src/audio.js`): oscillators, one cached noise buffer and one cached crackle buffer, no audio files. Sounds pan with the fighter's position across the arena.

- **Strikes and guard:** light and heavy punches tinted by the attacker's element, kicks for foot strikes (aerial heels, flying kicks, Air and Fire kick finishers), a swing whoosh for every attack (longer for the staff, spear and frost jian, darker and heavier for the crate and guandao), a forearm block clack and a bell-like parry ting.
- **Grapples and movement:** grab rustle, throw heave (body throws and thrown weapons), knockdown and soft jump landings, jump flap, dodge and recovery-roll scuff.
- **Items:** weapon pickup (wooden clacks, a hollow thonk for the crate and the mill stone), weapon break (last use, a thrown weapon bursting or the bracer cracking; the frost jian shatters like ice) and the thunder lantern bursting like a flare nova. A mill stone landing thuds before it rolls. Drinks (the tonic, wine jar and tea gourd) gulp twice and food (the bun and peach) bites twice, then chime as the effect lands; the elixir pill, a spirit orb and a planted censer sparkle as their effect lands. A use knocked away before its effect never chimes or sparkles, and one knocked away before the first gulp is silent; a tonic or wine jar knocked from your hand smashes like porcelain.
- **Archetypes** voice through the same bank: their swings whoosh like a fist, or like the staff (the monk), the jian (the warden's sword) or the crate (the Ox's chain); an arrow or talisman leaves with a light whoosh and a volley with a stronger one; the chain hook and the smoke pellet are thrown with the throw heave and the smoke bursts with a scuff; the warden's shield clangs with the block clack, the Iron Bell goes up with a soft clack and rings with the parry ting; the priest's heal begins with the item sparkle; a theft rustles like a grab; a freed villager's cangue splits like a crate, with the sparkle; a lost one falls with the ordinary kill thud.
- **Elements:** each element's shot and signature (Wind bolt and Cyclone, Ice shard and Healing tide, Boulder and Seismic slam, Ember fan and Flare nova), heard when the shot or burst is released. Guardian waves reuse them: Wildfire eruptions, Eye of the storm cyclones, Rising tide pools and faultline fractures sound as their element's signature, the ice lance as a freeze, other waves as the element's shot.
- **Status and ceremony:** freeze, shatter and burn ticks; an ordinary kill thuds, while the last kill of a wave, a guardian's fall and a lost life ring a temple bowl (KO). A gong opens every wave, and tanggu drums sound as a guardian steps out of its swirl, at every guardian tell and at its phase change.
- **Menus:** pentatonic plucks for element, mode, arena, difficulty and enemy-count changes, a joining arpeggio for entering the arena (a new run or a retry), a confirm for turning sound on, and a cancel for closing the pause panel or going back to setup.
- **Music:** *Paper Lantern Courtyard* (calm, 86 bpm, G gong mode) plays during stage waves; *Ink Storm* (132 bpm, E yu mode) crossfades in at bar 1 when a guardian arrives and plays through a whole tournament, then the calm loop returns where it left off. Pausing fades the loop and resuming continues on the beat; a run's end fades it out, and every new run starts from bar 1.

A single mixer routes everything: sound-effect and music volumes, a shared courtyard reverb, a limiter and a soft ceiling, plus a per-sound rate limit and a voice cap: beyond 24 voices in a big brawl only the key sounds still start (heavy punches, parries, shatters, kills and KOs, signature bursts, drinks and item sparkles, weapon breaks, the gong and the drums), up to 32 voices, while every other new sound is skipped. Turning Sound off fades everything out and then suspends the audio context, so nothing keeps running in the background.

## Development

```sh
npm test       # Node gameplay tests
npm run check  # JavaScript syntax checks
```

- `src/engine.js`: combat, waves, pickups and consumable uses (`startConsume`, `updateConsume`, `applyConsumable`, censer fields in `state.auras`), lives and modes; the archetypes (`archetypeMix` per wave, `startArchetypeAction`, `archetypeMove`, the shots, `startChannel`, `raiseBell` / `ringBell`, `shieldBlocks`, `updateBrace`, `steal`, `hookPull`) and the bound villagers in `state.captives` (`spawnCaptive`, `startRescue`, `updateRescue`, `freeCaptive`, `updateCaptives`).
- `src/enemy-ai.js`: enemy approach, crowd spacing, reactions and attack selection; the archetypes' styles (`ARCH_STYLES`: range, back-liners, shield / bell / armour defence), their errands (`archetypeErrand`: hold the heal or bell, smoke out, flee, `stealInput`, `harassInput`, `healInput`) and their attack choices (`archetypeAttack`).
- `src/bosses.js`: the four guardians (`BOSSES`: names, phases and moves) and `BossDirector`: phase breaks (with the spirit orb they shed), technique wind-ups and recoveries, floor warnings and their released waves (`updateHazards`; `releaseEffect` voices each wave with the element's shot, signature or freeze sound and draws its ink effect).
- `src/grapples.js`: linked holds, held punches, escape, body throws, crowd contacts and landing injury; `grabCandidate` (the dizzy opponent **E** would grab, shared with the renderer's E prompt; only grab-capable archetypes catch, and `canBeGrabbed` keeps the Chain Ox and the villager out) and `rescueCandidate` (the bound villager **E** would start freeing).
- `src/physics.js`: ground-plane movement, bounds and jump height.
- `src/data.js`: classes, arenas (`ARENAS`, each with its element; `arenaElement(key)` is the one way to read an arena as an element) and balance values, including `WEAPON_SPECS` (durability, reach, damage, windup and walking multipliers, spawn weights, relics and each weapon's thrown flight), the consumables' `ITEM_EFFECTS`, `ITEM_SPAWN` weights and `PICKUP_REACH`, and the archetypes' `ARCHETYPE_STATS`, `ARCHETYPE_COMBAT` (their strings and signature steps), `ARCHETYPE_MOVES` (specials and bursts), `ARCHETYPE_RULES` (arrows, volley, talisman, hook, smoke, heal channel, Iron Bell, shield, staff drop, theft) and `CAPTIVE`; `fighterSpec(f)` / `fighterCombat(f)` read either kind of fighter.
- `src/renderer.js`: Canvas scenes, fighters and effects; archetypes draw through `src/enemy-art.js` (bodies, KO bodies, trails, the Iron Bell, their shots and effects, the rescue tag and gauge). It routes ink effects by layer: split world effects sandwich the fighter on their floor point, and command icons draw over everything.
- `src/fighter-art.js`: Wuxia fighter bodies (`drawFighterBody`, `KO_POSE`) plus the metrics used to place overlays (HP bar, dizzy stars, armour, ice). Its construction helpers (`wxCapsuleXY`, `wxTail`, `wxToe`, `wxMix` ... and `wxClothState`) are shared with `src/enemy-art.js`.
- `src/enemy-art.js`: the seven archetypes as pure ctx functions: `ARCHETYPES` (names, cloth, bar and accent colours, heights), `ARCHETYPE_POSES` (stance, run, wind, strike, special, hit), `drawArchetypeBody` (the body for any pose, its KO silhouettes from `ARCHETYPE_KO`, gear dropped on the floor), `drawArchetypeTrail`, the shots (`drawEnemyProjectile`, `drawEnemyProjectileShadow`), the effects (`drawEnemyEffect`: heal sigil and tether, stuck arrow, smoke puff, Iron Bell ring, shield clang, freed burst), `ironBellSize` / `drawIronBell` and `drawRescuePrompt`. No DOM, gradients, shadowBlur or per-draw allocation beyond one transform read for the detail level.
- `src/audio.js`: the procedural sound bank (`SFX`, 34 `sfx(ctx, destination, when, params)` functions; `drink` also plays its gulps or its chime alone with `part`), the two music loops with their look-ahead scheduler and crossfade, and `createMixer()`. No DOM, no timers and no game knowledge.
- `src/game-audio.js`: `GameAudio`, which plays the engine's cues through the mixer every frame, steers the music from game state and owns the Sound/Music gates. The engine only records cues (`game.sound(name, x, params)` into `state.sounds`, plus `state.impacts`); it never touches WebAudio or the simulation's random stream.
- `src/weapon-art.js`: the weapon and throwable drawings as pure ctx functions: ground pickups (`drawWeaponPickupArt`), held weapons (`drawHeldWeaponArt`), the worn bracer (`drawWornArmorArt`), thrown flight (`drawThrownWeaponArt`), broken pieces (`WEAPON_SHARDS`, `drawWeaponShardArt`), the break puff and the lantern burst, plus `WEAPON_ART` render hints (shadow, bob, spin, rest angle). No DOM, gradients or per-call allocation beyond one transform read for the detail level.
- `src/pickup-art.js`: the consumables as pure ctx functions: `CONSUMABLES` (use style and time, effect point, rarity, spawn weight), ground pickups with the E seal and despawn (`drawConsumable`, `consumableFade`, `drawDespawnPuff`), the use poses and item track (`consumePose`, `drawConsumeHeld`), the weapon stow (`consumeStow`), flung and knocked items (`consumeFling`, `drawFlung`), the consume sparkle, the censer field and the buff overlays. No DOM, gradients or text.
- `src/arena-art.js`: the four pack arenas (`ARENA_PACK`, `ARENA_PACK_PALETTES`) as pure ctx functions: `drawArenaPackBackground` (drawn once into the renderer's cached background), `drawArenaPackScenery` (moving parts that hang from the scenery, drawn before the screen-shake offset), `drawArenaPackAmbient` (free air particles) and `drawArenaPackTitleCard` (the stage card under the wave-1 banner, shown while the engine's `state.stageCard` is set). Per-frame passes use no gradients, shadowBlur or allocation.
- `src/vfx-art.js`: the ink effect set as pure `fx(ctx, x, y, t, p)` draw functions, plus the `VFX` table of each effect's life, anchor and render layer. The engine spawns them with `game.vfx(key, x, y, params)`. They never use the simulation's random stream.
- `src/input.js`: physical key state, press edges and directional command recognition.
- `src/main.js`: fixed timestep, browser events, DOM HUD, menu sounds and local records.
- `server.mjs`: localhost static server.

The initial platform-arena direction was replaced with LF2-style depth movement at the user's request. There are no floating platforms, wall climbs or ring-outs in this version. Original artwork and characters are used; the supplied LF2 Windows executable is not required to play.

The [LF2 combat investigation](docs/lf2-combat-investigation.md) records the extracted character-data findings, REA/Ghidra evidence and the adaptations made here. Original LF2 assets and analysis tools are excluded from the game source.

The [LF2 enemy AI investigation](docs/lf2-ai-investigation.md) records native targeting, spacing, attack and defense findings. Surrounding positions and coordinated attack turns are original adaptations for Fourfold, rather than claims of a recovered LF2 formation system.

The [LF2 grab and throw investigation](docs/lf2-grab-investigation.md) records the native dizzy-state catches, grip budget, thrown-body attacks and separate landing injury behind our E/U adaptation.

The [LF2 held-punch and enemy-grab investigation](docs/lf2-grab-punch-investigation.md) records single-contact grip strikes, their startup/recovery, shared AI action inputs, and the limits of the recovered enemy policy.

The [LF2 knockdown and rolling investigation](docs/lf2-recovery-investigation.md) distinguishes native aerial recovery, ground rolling and get-up protection from our directional roll after knockdown.

The [LF2 aerial combat investigation](docs/lf2-aerial-investigation.md) records separate airborne attacks, contact eligibility, launch vectors and landing behavior, alongside our original elemental chains and juggle limits.
