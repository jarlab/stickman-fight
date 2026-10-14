export const WIDTH = 1280;
export const HEIGHT = 720;

export const ELEMENTS = {
  air: { name: 'Air', title: 'The wanderer', color: '#388e8b', description: 'Light on your feet. Turn a crowd into a cyclone.', special: 'Wind bolt', burst: 'Cyclone', speed: 350, hp: 100, damage: 14, knockback: 460, attackSpeed: 0.31, specialCost: 14, specialCooldown: 0.48, burstCost: 45, burstCooldown: 5 },
  water: { name: 'Water', title: 'The tidekeeper', color: '#397fbe', description: 'Slow your enemies. Recover in a healing tide.', special: 'Ice shard', burst: 'Healing tide', speed: 305, hp: 115, damage: 15, knockback: 320, attackSpeed: 0.36, specialCost: 18, specialCooldown: 0.6, burstCost: 45, burstCooldown: 6 },
  earth: { name: 'Earth', title: 'The sentinel', color: '#9a7935', description: 'Stand your ground. Break theirs with a seismic slam.', special: 'Boulder', burst: 'Seismic slam', speed: 265, hp: 145, damage: 22, knockback: 540, attackSpeed: 0.48, specialCost: 24, specialCooldown: 0.85, burstCost: 50, burstCooldown: 6 },
  fire: { name: 'Fire', title: 'The spark', color: '#c5573f', description: 'Fast, fierce pressure. Leave the whole arena burning.', special: 'Ember fan', burst: 'Flare nova', speed: 325, hp: 105, damage: 18, knockback: 380, attackSpeed: 0.33, specialCost: 18, specialCooldown: 0.46, burstCost: 50, burstCooldown: 5.5 },
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
