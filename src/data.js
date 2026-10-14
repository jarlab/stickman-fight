export const WIDTH = 1280;
export const HEIGHT = 720;

export const ELEMENTS = {
  air: { name: 'Air', title: 'The wanderer', color: '#388e8b', description: 'Quick palms into a rising kick. Jump after contact to chase a launch.', special: 'Wind bolt', burst: 'Cyclone', speed: 350, hp: 100, damage: 14, knockback: 460, specialCost: 14, specialCooldown: 0.48, burstCost: 45, burstCooldown: 5 },
  water: { name: 'Water', title: 'The tidekeeper', color: '#397fbe', description: 'Draw enemies close, freeze, then shatter. Parry to empower your next strike.', special: 'Ice shard', burst: 'Healing tide', speed: 305, hp: 115, damage: 15, knockback: 320, specialCost: 18, specialCooldown: 0.6, burstCost: 45, burstCooldown: 6 },
  earth: { name: 'Earth', title: 'The sentinel', color: '#9a7935', description: 'Planted blows. Armored follow-ups end in a guard-breaking slam.', special: 'Boulder', burst: 'Seismic slam', speed: 265, hp: 145, damage: 22, knockback: 540, specialCost: 24, specialCooldown: 0.85, burstCost: 50, burstCooldown: 6 },
  fire: { name: 'Fire', title: 'The spark', color: '#c5573f', description: 'Advance with every strike. Finish with a blazing rush and cancel into flames.', special: 'Ember fan', burst: 'Flare nova', speed: 325, hp: 105, damage: 18, knockback: 380, specialCost: 18, specialCooldown: 0.46, burstCost: 50, burstCooldown: 5.5 },
};

// Seconds and world units. A move owns its timing, reach, advance and reaction;
// a shared damage multiplier alone cannot give four fighters distinct rhythms.
const strike = (windup, active, recovery, reach, step, damage, knockback, stun, extra = {}) => ({ windup, active, recovery, reach, step, damage, knockback, stun, ...extra });
export const COMBAT = {
  air: { name: 'Rising wind', steps: [
    strike(.055, .07, .16, 84, 9, .85, 65, .30),
    strike(.065, .08, .16, 93, 12, .95, 80, .33),
    strike(.10, .10, .22, 106, 18, 1.3, 175, .55, { lift: 560, launcher: true }),
  ] },
  water: { name: 'Tidal counter', steps: [
    strike(.075, .09, .18, 96, 6, .9, 60, .35),
    strike(.085, .10, .18, 108, 7, 1, -105, .39),
    strike(.13, .10, .22, 116, 12, 1.3, 160, .65, { freeze: .8 }),
  ] },
  earth: { name: 'Mountain breaker', steps: [
    strike(.115, .09, .18, 90, 7, .9, 75, .43),
    strike(.15, .10, .20, 100, 9, 1.1, 95, .49, { armor: true }),
    strike(.22, .11, .28, 120, 16, 1.65, 820, .65, { armor: true, knockdown: true, guardBreak: true, lift: 330 }),
  ] },
  fire: { name: 'Blazing rush', steps: [
    strike(.05, .07, .15, 80, 14, .85, 100, .31),
    strike(.065, .08, .16, 92, 19, 1, 120, .34),
    strike(.11, .10, .23, 108, 34, 1.5, 650, .55, { knockdown: true, lift: 270 }),
  ] },
};

export const ARENAS = {
  air: { name: 'Sky monastery', subtitle: 'Above the clouds', sky: '#e8eee5', ink: '#425c57', accent: '#71a397' },
  water: { name: 'Moonlit harbor', subtitle: 'Between the tides', sky: '#e2eaf1', ink: '#426177', accent: '#719dc1' },
  earth: { name: 'Jade courtyard', subtitle: 'Rooted in stone', sky: '#eeeadb', ink: '#5c644d', accent: '#9d9d67' },
  fire: { name: 'Ember caldera', subtitle: 'At the edge of the flame', sky: '#f0e3d6', ink: '#77584b', accent: '#c78667' },
};

export const MODES = {
  survival: { name: 'Survival', description: 'Endless crowds. A guardian every third wave.', objective: 'Survive the waves. Guardians arrive every 3 waves.' },
  training: { name: 'Training', description: 'Practice movement, combos and parries. Unlimited lives.', objective: 'Practice on the sparring partner. Health regenerates.' },
  tournament: { name: 'Tournament', description: 'Three guardians. One champion.', objective: 'Defeat 3 elemental guardians.' },
  challenge: { name: 'Challenge', description: 'Clear 12 opponents with a single life.', objective: 'Defeat 12 opponents. One life, no time limit.' },
  story: { name: 'Story', description: 'A short journey through the four sanctuaries.', objective: 'Restore balance to the four sanctuaries.' },
};

export const DIFFICULTIES = {
  easy: { name: 'Easy', health: 0.75, damage: 0.65, speed: 0.8, aggression: 1.35 },
  normal: { name: 'Normal', health: 1, damage: 1, speed: 1, aggression: 1 },
  hard: { name: 'Hard', health: 1.3, damage: 1.3, speed: 1.12, aggression: 0.8 },
};
