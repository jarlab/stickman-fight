export const WIDTH = 1280;
export const HEIGHT = 720;

export const ELEMENTS = {
  air: { name: 'Air', title: 'The wanderer', color: '#388e8b', description: 'Circle and evade. Rising palms lead into three aerial strikes and a descending heel.', special: 'Wind bolt', burst: 'Cyclone', speed: 210, hp: 100, damage: 14, knockback: 460, specialCost: 14, specialCooldown: 0.48, burstCost: 45, burstCooldown: 5 },
  water: { name: 'Water', title: 'The tidekeeper', color: '#397fbe', description: 'Yield and redirect. Draw foes into a rising sweep, then send them away with flowing palms.', special: 'Ice shard', burst: 'Healing tide', speed: 185, hp: 115, damage: 15, knockback: 320, specialCost: 18, specialCooldown: 0.6, burstCost: 45, burstCooldown: 6 },
  earth: { name: 'Earth', title: 'The sentinel', color: '#9a7935', description: 'Rooted power. An armored uppercut leads to a heavy air hammer and downward smash.', special: 'Boulder', burst: 'Seismic slam', speed: 160, hp: 145, damage: 22, knockback: 540, specialCost: 24, specialCooldown: 0.85, burstCost: 50, burstCooldown: 6 },
  fire: { name: 'Fire', title: 'The spark', color: '#c5573f', description: 'Direct pressure. A driving uppercut links into advancing flying kicks and a blazing heel.', special: 'Ember fan', burst: 'Flare nova', speed: 195, hp: 105, damage: 18, knockback: 380, specialCost: 18, specialCooldown: 0.46, burstCost: 50, burstCooldown: 5.5 },
};

// Original arena-scale speeds informed by LF2's walk/run ratios. Running
// commits forward: its depth steering is slower than walking (see investigation).
export const MOVEMENT = {
  runMultiplier: 1.8, walkDepth: .5, runDepth: .32,
  dashSpeed: 510, airDashSpeed: 620, recoveryRollSpeed: 560,
};

// Frame rhythms adapted from the LF2 investigation; simulation stays at 120 Hz.
// These are original moves, scaled for our arena, not imported character data.
const tick = 1 / 30;
const strike = (windup, active, recovery, reach, step, damage, knockback, stun, extra = {}) => ({ windup, active, recovery, reach, step, damage, knockback, stun, ...extra });
export const COMBAT = {
  air: { name: 'Rising wind', steps: [
    strike(2*tick, 2*tick, 4*tick, 84, 7, .85, 60, .30, { followThrough: 8, fall: 20 }),
    strike(2*tick, 2*tick, 4*tick, 93, 9, .95, 65, .33, { followThrough: 9, fall: 20 }),
    strike(3*tick, 3*tick, 7*tick, 106, 18, 1.3, 155, .55, { lift: 560, launcher: true, fall: 25 }),
  ] },
  water: { name: 'Tidal counter', steps: [
    strike(3*tick, 3*tick, 4*tick, 96, 6, .9, 55, .35, { followThrough: 4, fall: 20 }),
    strike(3*tick, 3*tick, 4*tick, 108, 7, 1, -105, .39, { followThrough: 3, fall: 20 }),
    strike(4*tick, 3*tick, 7*tick, 116, 12, 1.3, 160, .65, { freeze: .8, fall: 20 }),
  ] },
  earth: { name: 'Mountain breaker', steps: [
    strike(5*tick, 2*tick, 5*tick, 90, 7, .9, 65, .43, { followThrough: 4, fall: 25 }),
    strike(6*tick, 3*tick, 6*tick, 100, 9, 1.1, 75, .49, { armor: true, followThrough: 5, fall: 25 }),
    strike(7*tick, 3*tick, 9*tick, 120, 16, 1.65, 720, .65, { armor: true, knockdown: true, guardBreak: true, lift: 270, spike: 480, fall: 70 }),
  ] },
  fire: { name: 'Blazing rush', steps: [
    strike(2*tick, 3*tick, 4*tick, 80, 12, .85, 65, .31, { followThrough: 10, fall: 20 }),
    strike(2*tick, 3*tick, 4*tick, 92, 16, 1, 75, .34, { followThrough: 12, fall: 20 }),
    strike(4*tick, 3*tick, 7*tick, 108, 34, 1.5, 650, .55, { knockdown: true, lift: 210, fall: 70 }),
  ] },
};

// Original aerial routes informed by LF2's separate jump/dash attacks and
// authored launch/carry/downward vectors. Budgets and jump cancels are ours.
Object.assign(COMBAT.air, {
  launcher: strike(3*tick, 3*tick, 8*tick, 98, 12, 1.05, 75, .8, { pose: 'airLift', lift: 680, launcher: true, fall: 25 }),
  aerial: [
    strike(2*tick, 3*tick, 3*tick, 102, 10, .85, 45, .45, { pose: 'airPalm', lift: 360, selfLift: 340, fall: 0 }),
    strike(2*tick, 3*tick, 3*tick, 112, 12, .95, 60, .45, { pose: 'airHeel', lift: 340, selfLift: 320, fall: 0 }),
    strike(3*tick, 3*tick, 6*tick, 118, 14, 1.35, 180, .55, { pose: 'airHeel', spike: 680, knockdown: true, fall: 70 }),
  ],
});
Object.assign(COMBAT.water, {
  launcher: strike(4*tick, 3*tick, 8*tick, 112, 7, 1, -45, .85, { pose: 'waterLift', lift: 650, launcher: true, fall: 25 }),
  aerial: [
    strike(3*tick, 3*tick, 3*tick, 118, 4, 1, -55, .5, { pose: 'waterPalm', lift: 350, selfLift: 320, fall: 0 }),
    strike(3*tick, 3*tick, 6*tick, 126, 6, 1.5, 420, .55, { pose: 'waterSweep', lift: 160, knockdown: true, fall: 70 }),
  ],
});
Object.assign(COMBAT.earth, {
  launcher: strike(6*tick, 3*tick, 9*tick, 104, 10, 1.2, 60, .9, { pose: 'earthLift', armor: true, lift: 690, launcher: true, fall: 25 }),
  aerial: [
    strike(4*tick, 3*tick, 4*tick, 115, 8, 1.1, 55, .55, { pose: 'earthHammer', lift: 390, selfLift: 360, fall: 0 }),
    strike(4*tick, 3*tick, 7*tick, 124, 12, 1.65, 160, .65, { pose: 'earthSpike', spike: 900, knockdown: true, guardBreak: true, fall: 70 }),
  ],
});
Object.assign(COMBAT.fire, {
  launcher: strike(3*tick, 3*tick, 8*tick, 96, 23, 1.1, 120, .8, { pose: 'fireLift', lift: 650, launcher: true, fall: 25 }),
  aerial: [
    strike(2*tick, 3*tick, 3*tick, 106, 20, .9, 105, .45, { pose: 'fireKick', lift: 350, selfLift: 330, fall: 0 }),
    strike(2*tick, 3*tick, 3*tick, 114, 22, 1, 120, .45, { pose: 'fireKick', lift: 330, selfLift: 310, fall: 0 }),
    strike(3*tick, 3*tick, 6*tick, 122, 26, 1.4, 600, .55, { pose: 'fireHeel', lift: 180, knockdown: true, fall: 70 }),
  ],
});

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
  easy: { name: 'Easy' },
  normal: { name: 'Normal' },
  hard: { name: 'Hard' },
  crazy: { name: 'Crazy' },
};
