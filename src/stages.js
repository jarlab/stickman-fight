import { ARENAS, WIDTH } from './data.js';
import { clamp } from './physics.js';

const chapters = ['air', 'water', 'earth', 'fire'];
const encounterStride = 1100;
const stageWidth = WIDTH + encounterStride * 2;

// Journey uses world coordinates. Each encounter holds one screen; clearing it
// opens the road, and walking forward commits the next checkpoint.
export class StageDirector {
  begin(game) {
    const s = game.state;
    s.arena = chapters[s.wave - 1];
    s.cameraX = 0;
    s.stage = {
      chapter: s.wave, encounter: 0, encounters: 3, phase: 'fight',
      width: stageWidth, checkpointX: 280, gateX: 1250, nextX: 1560,
    };
    // Relics travel with the party; floor effects and rescue objectives belong
    // to the previous sanctuary. Reposition drops into the new world's bounds.
    s.weapons = s.weapons.filter(w => w.relic).map(w => ({ ...w, x: 370 }));
    s.bounds = { left: 30, right: 1250 };
    for (const key of ['enemies', 'projectiles', 'bossHazards', 'captives', 'auras', 'corpses', 'particles', 'effects', 'floaters']) s[key] = [];
    game.placePlayer();
    s.player.facing = 1;
    s.player.invulnerable = 1.5;
    this.engage(game, 0);
    game.banner(`Stage ${s.wave} · ${ARENAS[s.arena].name}`);
  }

  engage(game, encounter) {
    const s = game.state, stage = s.stage;
    const origin = encounter * encounterStride;
    stage.encounter = encounter;
    stage.phase = 'fight';
    stage.checkpointX = encounter ? origin + 460 : 280;
    stage.gateX = origin + WIDTH - 30;
    stage.nextX = encounter < 2 ? origin + encounterStride + 460 : stage.width - 100;
    s.bounds = { left: origin + 30, right: stage.gateX };
    s.cameraX = origin;
    s.player.x = clamp(s.player.x, s.bounds.left + s.player.w / 2, s.bounds.right - s.player.w / 2);
    // Old drops behind a closed checkpoint must not consume the pickup limit.
    s.weapons = s.weapons.filter(w => w.x >= s.bounds.left && w.x <= s.bounds.right);
    s.corpses = s.corpses.filter(c => c.x >= s.bounds.left);
    s.captives = s.captives.filter(c => c.x >= s.bounds.left && c.x <= s.bounds.right);
    const boss = encounter === 2;
    const count = s.settings.enemyCount === 'auto' ? (boss ? 3 : 3 + encounter) : s.settings.enemyCount;
    const ordinary = count - Number(boss);
    const mix = game.archetypeMix(ordinary);
    for (let i = 0; i < count; i++) {
      const ambush = encounter === 1 && i === count - 1 && count > 1;
      const archetype = i >= count - mix.length ? mix[i - count + mix.length] : null;
      game.spawnEnemy({
        boss: boss && i === 0, element: s.arena, archetype,
        x: origin + (ambush ? 170 : 760 + i % 4 * 76),
        depth: 540 + (i % 3 - 1) * 24 + Math.floor(i / 4) * 20,
      });
    }
    if (encounter === 0 && game.captiveWave() && mix.includes('bandit')) game.spawnCaptive(origin + 1040, 600);
    if (encounter === 0 && s.wave % 3 === 0) game.dropOrb(s.arena, origin + 640, 560);
    s.objective = boss ? 'Defeat the guardian to open the stage exit.' : `Clear encounter ${encounter + 1} / 3 to open the road.`;
    if (encounter) game.banner(boss ? 'Guardian · the final stand' : 'Ambush · clear the road');
    game.spawnWeapon(true);
    if (encounter) game.sound('waveGong', origin + 640);
    s.weaponTimer = 12;
  }

  tick(game, dt) {
    const s = game.state, stage = s.stage;
    if (stage.phase === 'fight' && !s.enemies.length) {
      stage.phase = stage.encounter === 2 ? 'exit' : 'advance';
      // The exit is beyond the closed boss gate. Even a victory at the right
      // wall leaves a short, deliberate walk offscreen before changing stages.
      if (stage.phase === 'exit') stage.nextX = stage.width + 20;
      s.bounds = { left: stage.encounter * encounterStride + 30,
        right: stage.width + (stage.phase === 'exit' ? 60 : -30) };
      s.projectiles = [];
      s.bossHazards = [];
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 22);
      s.player.energy = Math.min(s.player.maxEnergy, s.player.energy + 25);
      s.objective = stage.phase === 'exit' ? 'Head right to the stage exit.' : 'Follow the road right to the next encounter.';
      game.banner(stage.phase === 'exit' ? 'Guardian defeated · GO →' : 'Road clear · GO →');
    }
    if (stage.phase !== 'fight') {
      const cameraLimit = Math.min((stage.encounter + 1) * encounterStride, stage.width - WIDTH);
      const target = clamp(s.player.x - 460, stage.encounter * encounterStride, cameraLimit);
      s.cameraX += (target - s.cameraX) * Math.min(1, dt * 8);
      // Reach the next group on foot. No timer can skip a section or end a stage.
      if (s.player.x >= stage.nextX && s.player.knockdown <= 0 && !s.player.thrown) {
        if (stage.phase === 'advance') this.engage(game, stage.encounter + 1);
        else if (stage.chapter < chapters.length) game.beginWave();
        else {
          s.status = 'won';
          s.objective = 'Four roads cleared. Balance restored across the sanctuaries.';
        }
      }
    }
  }
}
