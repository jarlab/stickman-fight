# Fourfold prototype specification

## Current direction

The user initially requested a 2D elemental platform fighter, then supplied Little Fighter 2 as the reference and explicitly selected a switch to LF2-style ground-plane movement. This supersedes platforming, climbing and ring-outs. Preserve single-player AI crowds, bosses, the four elemental classes, minimal cartoon assets, desktop keyboard controls, local browser delivery and saved records.

## Acceptance

- WASD/arrows move in screen-horizontal and ground-depth directions. Jump height is independent; characters sort by ground depth with grounded shadows.
- Lane-aware combat: forward melee, three-hit chains, running/aerial attacks, timed directional parries, projectiles, signature powers, knockdowns and protected recovery.
- Four unique elemental characters; four original sanctuary backgrounds. No downloaded art or native game engine.
- Staffs, spears and crates can be picked up and thrown; healing/energy pickups; weapon wear.
- Survival, training, three-guardian tournament, one-life twelve-enemy challenge, short four-stage story. All unlocked; easy/normal/hard. No time limit.
- Local settings, records and completions persist; active fights restart after reload. Optional synthesized SFX and reduced motion.

## Architecture

Plain ES modules and Canvas 2D. World coordinates 1280×720. Fighter x is lateral, depth is ground Y 395–650, z is jump height, y=depth-z is projected feet. vy is vertical jump velocity (negative upward), vDepth changes lanes. Engine is DOM-free, deterministic for a seed/input stream. Main advances at 120Hz and consumes edge inputs once. Renderer caches scenery and paints effects without game logic.

Game({element,arena,mode,difficulty}) exposes start(), tick(input,dt), togglePause() and state. Statuses: ready/playing/paused/won/lost. Primary state: player,enemies,projectiles,weapons,particles,effects,floaters,corpses,wave,kills,score,lives. Fighter fields: hp,maxHp,energy,cooldowns,comboIndex,action,guard,parryTimer,knockdown,weapon,weaponHits. Projectiles carry depth/z and projected y. Held input: left,right,up,down,guard,run; edge input: jump,dash,attack,special,burst,interact,throw.

## Commands and checks

- npm start: Node localhost server 127.0.0.1:5173; no install/build.
- npm test: Node built-in runner, gameplay outcome tests in tests/engine.test.js.
- npm run check: syntax checks.

Verify movement, lane/height hit detection, parries, throws, resource limits, knockdowns, lives/modes and bounded long simulation. In a real browser verify keyboard sequences, overlays, focus, persistence, rendering, viewport fit and console/network errors. All content generated in source. Always preserve user files. Ask before external publication or paid services. Never add credentials or native game editor dependencies.
