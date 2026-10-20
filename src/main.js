import { Game } from './engine.js';
import { BOSSES } from './bosses.js';
import { Renderer } from './renderer.js';
import { KeyboardInput, PLAY_KEYS } from './input.js';
import { ELEMENTS, COMBAT, ARENAS, MODES, DIFFICULTIES } from './data.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'fourfold:v1';
const STEP = 1 / 120;
const symbols = { air: '≋', water: '◡', earth: '◇', fire: '⋀' };
const defaults = { element: 'air', arena: 'air', mode: 'story', difficulty: 'normal', enemyCount: 'auto', sound: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
const fields = { element: ELEMENTS, arena: ARENAS, mode: MODES, difficulty: DIFFICULTIES };
const storage = loadStorage();
const preferences = storage.settings;
const canvas = $('game-canvas');
const renderer = new Renderer(canvas);
const keyboard = new KeyboardInput();
let game;
let lastStatus = 'ready';
let lastTime = 0;
let accumulator = 0;
let runRecorded = false;
let audioContext;
let audioSnapshot;
let hudSignature = '';

function loadStorage() {
  const result = { settings: { ...defaults }, records: {} };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || typeof parsed !== 'object') return result;
    for (const [key, options] of Object.entries(fields)) {
      if (Object.hasOwn(options, parsed.settings?.[key])) result.settings[key] = parsed.settings[key];
    }
    for (const key of ['sound', 'reducedMotion']) {
      if (typeof parsed.settings?.[key] === 'boolean') result.settings[key] = parsed.settings[key];
    }
    if (Number.isInteger(parsed.settings?.enemyCount) && parsed.settings.enemyCount >= 1 && parsed.settings.enemyCount <= 12) {
      result.settings.enemyCount = parsed.settings.enemyCount;
    }
    if (parsed.records && typeof parsed.records === 'object') {
      for (const mode of Object.keys(MODES)) {
        for (const difficulty of Object.keys(DIFFICULTIES)) {
          for (const enemyCount of ['auto', ...Array.from({ length: 12 }, (_, index) => index + 1)]) {
            const key = settingsRecordKey({ mode, difficulty, enemyCount });
            const saved = parsed.records[key];
            if (!saved || typeof saved !== 'object') continue;
            result.records[key] = Object.fromEntries(['score', 'wave', 'completions', 'runs'].map((field) => [field, Number.isFinite(saved[field]) && saved[field] >= 0 ? Math.floor(Math.min(saved[field], 1e9)) : 0]));
          }
        }
      }
    }
  } catch {
    // Private browsing, unavailable storage, and old malformed saves remain playable.
  }
  return result;
}

function saveStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    $('save-status').textContent = 'Local play. Your bests stay with you.';
  } catch {
    $('save-status').textContent = 'Browser storage unavailable. This session is still playable.';
  }
}

function recordKey() {
  const settings = game?.state.settings || preferences;
  return settingsRecordKey(settings);
}

function settingsRecordKey(settings) {
  const base = `${settings.mode}:${settings.difficulty}`;
  return Number.isInteger(settings.enemyCount) ? `${base}:enemies:${settings.enemyCount}` : base;
}

function recordRun(finished = false) {
  if (!game || game.state.status === 'ready') return;
  const state = game.state;
  const key = recordKey();
  const record = storage.records[key] || { score: 0, wave: 0, completions: 0, runs: 0 };
  record.score = Math.max(record.score, Math.floor(state.score || 0));
  record.wave = Math.max(record.wave, state.wave || 0);
  if (finished && !runRecorded) {
    record.runs += 1;
    if (state.status === 'won' && state.settings.mode !== 'training') record.completions += 1;
    runRecorded = true;
  }
  storage.records[key] = record;
  saveStorage();
  updateRecord();
}

function updateRecord() {
  const record = storage.records[recordKey()];
  $('record-label').textContent = record ? `BEST ${record.score.toLocaleString()}${record.completions ? ` · ${record.completions} CLEAR${record.completions > 1 ? 'S' : ''}` : ''}` : 'PERSONAL BEST —';
}

function updatePreferences() {
  for (const button of document.querySelectorAll('[data-element]')) {
    button.setAttribute('aria-pressed', String(button.dataset.element === preferences.element));
  }
  for (const name of ['mode', 'arena', 'difficulty', 'enemyCount']) $(name + '-select').value = preferences[name];
  for (const [key, values] of [['arena', ARENAS], ['mode', MODES], ['difficulty', DIFFICULTIES]]) {
    for (const option of $(key + '-select').options) option.textContent = values[option.value].name;
  }
  const element = ELEMENTS[preferences.element];
  $('sound-button').setAttribute('aria-pressed', String(preferences.sound));
  $('sound-button').innerHTML = `Sound <span>${preferences.sound ? 'on' : 'off'}</span>`;
  $('sound-button').setAttribute('aria-label', `Sound ${preferences.sound ? 'on' : 'off'}. Toggle sound.`);
  $('motion-button').setAttribute('aria-pressed', String(preferences.reducedMotion));
  $('motion-button').innerHTML = `Motion <span>${preferences.reducedMotion ? 'reduced' : 'full'}</span>`;
  $('motion-button').setAttribute('aria-label', `Motion ${preferences.reducedMotion ? 'reduced' : 'full'}. Toggle reduced motion.`);
  for (const name of ['sound', 'motion']) {
    const source = $(`${name}-button`);
    const target = $(`pause-${name}-button`);
    target.innerHTML = source.innerHTML;
    target.setAttribute('aria-pressed', source.getAttribute('aria-pressed'));
    target.setAttribute('aria-label', source.getAttribute('aria-label'));
  }
  document.body.classList.toggle('reduced-motion', preferences.reducedMotion);
  document.documentElement.style.setProperty('--accent', element.color);
  $('player-symbol').textContent = symbols[preferences.element];
  $('player-name').textContent = element.title;
  $('intro-description').textContent = MODES[preferences.mode].description;
  const journey = preferences.mode === 'story';
  if (journey) $('arena-select').value = 'air';
  $('intro-start-button').innerHTML = `${journey ? 'Begin the journey' : 'Enter the arena'} <kbd>Enter</kbd>`;
  document.querySelector('.intro-tip').textContent = journey ? 'Clear each group. Follow GO to move right.' : 'Match their lane to land a hit.';
  document.querySelector('[for="enemyCount-select"] .field-label > span').textContent = journey ? 'Enemies per group' : 'Enemies per wave';
  $('enemy-count-help').textContent = journey
    ? 'Journey crosses four stages. Clear two groups, then a guardian. Counts apply to each group and include bosses.'
    : 'Auto follows each mode’s progression. Counts include bosses; personal bests are saved separately for each count.';
  $('arena-select').disabled = game.state.status !== 'ready' || journey;
  $('arena-select').title = journey ? 'Journey travels through all four elemental stages in order.' : '';
  const lives = preferences.mode === 'training' ? 'Unlimited lives' : preferences.mode === 'challenge' ? '1 life' : '3 lives';
  document.querySelector('.run-rules > span').textContent = lives;
  $('ability-description').replaceChildren();
  const label = document.createElement('strong');
  label.textContent = element.name;
  $('ability-description').append(label, ` · ${element.description}`);
  $('shot-label').textContent = `${element.special} · ${element.specialCost} · ready`;
  $('shot-label').title = `${element.specialCost} elemental energy per shot`;
  $('burst-label').textContent = `${element.burst} · ${element.burstCost} · ready`;
  $('burst-label').title = `${element.burstCost} elemental energy; regenerates over time`;
  hudSignature = '';
}

function clearInput() {
  keyboard.clear();
  accumulator = 0;
}

function createPreview() {
  clearInput();
  game = new Game({ ...preferences });
  lastStatus = 'ready';
  runRecorded = false;
  hudSignature = '';
  audioSnapshot = null;
  syncStatus();
  updatePreferences();
  updateHud();
  updateRecord();
}

function startRun() {
  if (game.state.status !== 'ready') return;
  unlockAudio();
  clearInput();
  game.start();
  syncStatus();
  canvas.focus({ preventScroll: true });
  document.querySelector('.masthead').scrollIntoView({ block: 'start', behavior: 'instant' });
  const crowd = preferences.enemyCount === 'auto' ? '' : ` ${preferences.enemyCount} ${preferences.enemyCount === 1 ? 'enemy' : 'enemies'} per wave.`;
  announce(`${ELEMENTS[preferences.element].name}, ${MODES[preferences.mode].name}, ${DIFFICULTIES[preferences.difficulty].name}.${crowd} Fight!`);
  tone(320, 600, .16, .025);
}

function retry() {
  recordRun(true);
  createPreview();
  startRun();
}

function pauseGame() {
  if (game.state.status !== 'playing') return;
  game.togglePause();
  clearInput();
  recordRun();
  syncStatus();
}

function resumeGame() {
  if (game.state.status !== 'paused') return;
  clearInput();
  game.togglePause();
  syncStatus();
  canvas.focus({ preventScroll: true });
}

function announce(message) {
  $('announcer').textContent = message;
}

function syncStatus() {
  const state = game.state;
  const status = state.status;
  const ready = status === 'ready';
  const terminal = status === 'won' || status === 'lost';
  const paused = status === 'paused';
  const modal = paused || terminal;
  document.body.classList.toggle('in-run', !ready);
  $('intro-overlay').hidden = !ready;
  $('modal-overlay').hidden = !modal;
  $('pause-button').disabled = ready || terminal;
  $('pause-button').innerHTML = `${paused ? 'Resume' : 'Pause'} <kbd>Esc</kbd>`;
  $('start-button').disabled = !ready;
  $('start-button').innerHTML = ready ? 'Start run <span aria-hidden="true">↗</span>' : 'In arena <span aria-hidden="true">↗</span>';
  for (const control of document.querySelectorAll('.setup select, .element-choice')) control.disabled = !ready;
  if (state.settings.mode === 'story') $('arena-select').disabled = true;
  $('resume-button').hidden = !paused;
  $('retry-button').hidden = !terminal;
  $('result-stats').hidden = !terminal;
  $('pause-settings').hidden = !paused;
  if (modal) {
    $('modal-eyebrow').textContent = paused ? 'TAKE A BREATH' : status === 'won' ? 'BALANCE RESTORED' : 'BACK TO THE ELEMENTS';
    $('modal-title').textContent = paused ? 'Paused.' : status === 'won' ? 'Well fought.' : 'A good fight.';
    $('modal-description').textContent = paused ? 'Catch your breath, then get back into the fight.' : status === 'won' ? `${MODES[state.settings.mode].name} complete. Try another element or turn up the difficulty.` : `Your run ends at ${state.settings.mode === 'story' ? 'stage' : state.settings.mode === 'tournament' ? 'guardian' : 'wave'} ${state.wave}. Every attempt is a fresh start.`;
    if (terminal) {
      recordRun(true);
      $('result-score').textContent = state.score.toLocaleString();
      $('result-kills').textContent = String(state.kills);
      $('result-best').textContent = (storage.records[recordKey()]?.score || 0).toLocaleString();
    }
    if (lastStatus !== status) {
      clearInput();
      (paused ? $('resume-button') : $('retry-button')).focus({ preventScroll: true });
      announce($('modal-title').textContent + ' ' + $('modal-description').textContent);
    }
  }
  lastStatus = status;
}

function updateMeter(name, value, max) {
  const amount = Math.max(0, Math.min(max || 100, value || 0));
  $(`${name}-fill`).style.width = `${Math.max(0, Math.min(100, amount / (max || 100) * 100))}%`;
  $(`${name}-meter`).setAttribute('aria-valuemax', String(max || 100));
  $(`${name}-meter`).setAttribute('aria-valuenow', String(Math.ceil(amount)));
}

function abilityReadiness(player, action, cost) {
  const remaining = player.cooldowns?.[action] || 0;
  if (remaining > 0) return `${remaining < 1 ? (Math.ceil(remaining * 10) / 10).toFixed(1) : Math.ceil(remaining)}s`;
  return player.energy < cost ? 'need energy' : 'ready';
}

function updateHud() {
  const s = game.state;
  const p = s.player;
  if (!p) return;
  const mode = s.settings.mode;
  const element = ELEMENTS[p.element];
  const shotReadiness = abilityReadiness(p, 'special', element.specialCost);
  const burstReadiness = abilityReadiness(p, 'burst', element.burstCost);
  const hitStreak = s.combo >= 2 && s.comboTimer > 0 && s.status !== 'ready' ? s.combo : 0;
  const signature = [s.status, Math.ceil(p.hp), Math.floor(p.energy), s.lives, s.wave, s.score, p.weapon, p.weaponHits, p.grabTarget, p.grabbedBy, Boolean(p.recoveryRoll), p.knockdown > 0, p.grounded, p.action?.launched, p.airChain, s.arena, s.objective, s.stage?.encounter, s.stage?.phase, s.enemies.length, shotReadiness, burstReadiness, hitStreak].join('|');
  if (signature !== hudSignature) {
    hudSignature = signature;
    updateMeter('health', p.hp, p.maxHp);
    updateMeter('energy', p.energy, p.maxEnergy);
    $('health-value').textContent = `${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`;
    $('energy-value').textContent = `${Math.floor(Math.max(0, p.energy))} energy`;
    $('shot-label').textContent = `${element.special} · ${element.specialCost} · ${shotReadiness}`;
    $('burst-label').textContent = `${element.burst} · ${element.burstCost} · ${burstReadiness}`;
    $('energy-meter').title = `Energy ${Math.floor(p.energy)} / ${p.maxEnergy}. ${element.burst}: ${burstReadiness}.`;
    const countLabel = Number.isInteger(s.settings.enemyCount) ? ` / ${s.settings.enemyCount} ${s.settings.enemyCount === 1 ? 'ENEMY' : 'ENEMIES'}` : '';
    $('mode-label').textContent = `${MODES[mode].name.toUpperCase()} / ${DIFFICULTIES[s.settings.difficulty].name.toUpperCase()}${countLabel}`;
    const challengeGoal = Number.isInteger(s.settings.enemyCount) ? s.settings.enemyCount * 3 : 12;
    const stageLabel = s.stage ? s.stage.encounter === s.stage.encounters - 1 ? 'GUARDIAN' : `GROUP ${s.stage.encounter + 1} / ${s.stage.encounters}` : '';
    $('stage-label').textContent = s.status === 'ready' ? 'READY WHEN YOU ARE' : mode === 'training' ? 'PRACTICE YOUR FLOW' : mode === 'story' ? `STAGE ${s.wave} / 4 · ${stageLabel}` : mode === 'tournament' ? `GUARDIAN ${s.wave} / 3` : mode === 'challenge' ? `${s.kills} / ${challengeGoal} DEFEATED` : `WAVE ${String(s.wave).padStart(2, '0')}`;
    $('objective-label').textContent = s.objective || MODES[mode].objective;
    const lives = mode === 'training' ? Infinity : Math.max(0, s.lives);
    $('lives-value').textContent = lives === Infinity ? '∞' : lives ? Array(lives).fill('●').join(' ') : '—';
    $('lives-value').setAttribute('aria-label', `${lives === Infinity ? 'Unlimited' : lives} lives`);
    $('score-value').textContent = String(s.score).padStart(5, '0');
    $('combo-value').hidden = !hitStreak;
    $('combo-value').textContent = `${hitStreak} HITS`;
    $('combo-value').setAttribute('aria-label', `${hitStreak} confirmed hits`);
    $('arena-name').textContent = ARENAS[s.arena].name.toUpperCase();
    $('weapon-label').textContent = p.grabbedBy != null ? 'GRABBED · WAIT FOR RELEASE'
      : p.grabTarget != null ? 'ENEMY HELD · J PUNCH / U THROW / E RELEASE'
      : p.recoveryRoll ? 'RECOVERY ROLL'
      : p.knockdown > 0 ? p.grounded ? 'DOWN · SHIFT + DIRECTION TO ROLL' : 'SHIFT + DIRECTION · ROLL ON LANDING'
      : p.action?.launched ? 'LAUNCH · SPACE + J TO FOLLOW'
      : !p.grounded && p.airChain > 0 ? `AIR ${p.airChain}/${COMBAT[p.element].aerial.length} · ${p.airChain < COMBAT[p.element].aerial.length ? 'TAP J LATE TO LINK' : 'LAND TO RESET'}`
      : p.weapon ? `${p.weapon.toUpperCase()} · ${p.weaponHits} HITS · U THROW / E DROP`
      : 'UNARMED · E GRAB / PICK UP / DRINK';
  }
  const boss = s.enemies.find((enemy) => enemy.type === 'boss' && !enemy.dead && enemy.hp > 0);
  $('boss-hud').hidden = !boss || s.status === 'ready';
  if (boss) {
    const identity = BOSSES[boss.element];
    $('boss-name').textContent = identity.name.toUpperCase();
    $('boss-health-value').textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    $('boss-health-fill').style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
    const action = boss.bossAction;
    $('boss-hint').textContent = action?.stage === 'recovery' ? `${action.name} · OPEN TO COUNTERATTACK`
      : action?.hint ? `${action.name} · ${action.hint}`
      : `Phase ${boss.bossPhase} · ${identity.phases[boss.bossPhase - 1]}`;
  }
}

function unlockAudio() {
  if (!preferences.sound) return;
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch {
    // Audio is optional, including on browsers without Web Audio support.
  }
}

function tone(from, to, length, volume = .02, type = 'sine') {
  if (!preferences.sound || !audioContext || audioContext.state !== 'running') return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const time = audioContext.currentTime;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, time);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(to, 30), time + length);
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(.0001, time + length);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(time);
  oscillator.stop(time + length);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

function impactSound(impact) {
  const strength = Math.max(.6, Math.min(1.5, Number.isFinite(impact.strength) ? impact.strength : 1));
  if (impact.kind === 'parry') {
    tone(1350, 1900, .12, .03, 'sine');
    tone(2100, 2600, .18, .012, 'sine');
  } else if (impact.kind === 'block') {
    tone(340, 100, .07, .025 * strength, 'triangle');
  } else if (impact.kind === 'land') {
    tone(95, 34, .13, (impact.heavy ? .035 : .018) * strength, 'sine');
  } else if (impact.heavy) {
    tone(95, 32, .18, .045 * strength, 'sine');
    tone(230, 65, .09, .022 * strength, 'triangle');
  } else {
    const pitch = { air: 340, water: 220, earth: 150, fire: 270 }[impact.element] || 240;
    tone(pitch, 65, .075, .035 * strength, 'triangle');
  }
}

function pickImpact(state, afterId) {
  const priority = (impact) => impact.kind === 'parry' ? 5 : impact.kind === 'hit' && impact.heavy ? 4 : impact.kind === 'land' ? 3 : impact.kind === 'block' ? 1 : 2;
  let chosen = null;
  const events = Array.isArray(state.impacts) ? state.impacts : [];
  for (const event of [...events, state.lastImpact]) {
    if (!event || event.id <= (afterId ?? 0)) continue;
    if (!chosen || priority(event) > priority(chosen) || (priority(event) === priority(chosen) && event.id > chosen.id)) chosen = event;
  }
  return chosen;
}

function updateAudio() {
  const s = game.state;
  if (!s.player) return;
  const impactId = Math.max(s.lastImpact?.id ?? 0, s.impacts?.at(-1)?.id ?? 0);
  const current = { hp: s.player.hp, lives: s.lives, kills: s.kills, energy: s.player.energy, wave: s.wave, impactId };
  if (audioSnapshot && ['playing', 'won', 'lost'].includes(s.status)) {
    const impact = pickImpact(s, audioSnapshot.impactId);
    if (impact) impactSound(impact);
    if (current.lives < audioSnapshot.lives) tone(160, 40, .25, .04, 'triangle');
    else if (!impact && current.hp < audioSnapshot.hp) tone(130, 45, .12, .035, 'triangle');
    else if (!impact && current.kills > audioSnapshot.kills) tone(460, 800, .12, .025);
    else if (!impact && current.energy < audioSnapshot.energy - 5) tone(280, 700, .16, .02, 'triangle');
    if (current.wave > audioSnapshot.wave) tone(420, 630, .25, .02);
  }
  audioSnapshot = current;
}

function animate(timestamp) {
  const elapsed = lastTime ? Math.min((timestamp - lastTime) / 1000, .05) : 0;
  lastTime = timestamp;
  if (game.state.status === 'playing') {
    accumulator += elapsed;
    while (accumulator >= STEP && game.state.status === 'playing') {
      const revision = game.state.player.inputRevision;
      game.tick(keyboard.read(), STEP);
      if (game.state.player.inputRevision !== revision) keyboard.clearCommand();
      accumulator -= STEP;
    }
  } else accumulator = 0;
  if (game.state.status !== lastStatus) syncStatus();
  updateHud();
  updateAudio();
  renderer.draw(game.state, { reducedMotion: preferences.reducedMotion });
  requestAnimationFrame(animate);
}

for (const button of document.querySelectorAll('[data-element]')) {
  button.addEventListener('click', () => {
    if (game.state.status !== 'ready') return;
    preferences.element = button.dataset.element;
    createPreview();
    saveStorage();
  });
}
for (const name of ['mode', 'arena', 'difficulty', 'enemyCount']) {
  $(name + '-select').addEventListener('change', (event) => {
    if (game.state.status !== 'ready') return;
    preferences[name] = name === 'enemyCount' && event.target.value !== 'auto' ? Number(event.target.value) : event.target.value;
    createPreview();
    saveStorage();
  });
}
$('sound-button').addEventListener('click', () => { preferences.sound = !preferences.sound; unlockAudio(); updatePreferences(); saveStorage(); if (preferences.sound) tone(420, 680, .12); });
$('motion-button').addEventListener('click', () => { preferences.reducedMotion = !preferences.reducedMotion; updatePreferences(); saveStorage(); });
$('pause-sound-button').addEventListener('click', () => $('sound-button').click());
$('pause-motion-button').addEventListener('click', () => $('motion-button').click());
$('start-button').addEventListener('click', startRun);
$('intro-start-button').addEventListener('click', startRun);
$('pause-button').addEventListener('click', () => game.state.status === 'paused' ? resumeGame() : pauseGame());
$('resume-button').addEventListener('click', resumeGame);
$('retry-button').addEventListener('click', retry);
$('menu-button').addEventListener('click', () => { recordRun(true); createPreview(); document.querySelector(`[data-element="${preferences.element}"]`).focus(); });

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  const status = game.state.status;
  const nativeControl = event.target instanceof Element && event.target.closest('button, select, input, textarea, a');
  if (event.code === 'Escape') {
    if (event.target instanceof HTMLSelectElement) return;
    event.preventDefault();
    if (!event.repeat) status === 'playing' ? pauseGame() : resumeGame();
    return;
  }
  if (event.code === 'Tab' && (status === 'paused' || status === 'won' || status === 'lost')) {
    const buttons = [...$('modal-overlay').querySelectorAll('button')].filter((button) => !button.closest('[hidden]') && !button.disabled);
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && (document.activeElement === first || !$('modal-overlay').contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !$('modal-overlay').contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    return;
  }
  if (event.code === 'Tab' && status === 'playing') { event.preventDefault(); pauseGame(); return; }
  if (event.code === 'KeyR' && (status === 'won' || status === 'lost')) { event.preventDefault(); if (!event.repeat) retry(); return; }
  if (event.code === 'Enter' && status === 'ready' && !nativeControl) { event.preventDefault(); startRun(); return; }
  if (status !== 'playing' || nativeControl || !PLAY_KEYS.has(event.code)) return;
  event.preventDefault();
  keyboard.press(event.code, performance.now(), { repeat: event.repeat });
});
window.addEventListener('keyup', (event) => {
  keyboard.release(event.code);
  if (game.state.status === 'playing' && PLAY_KEYS.has(event.code)) event.preventDefault();
});
window.addEventListener('blur', () => { pauseGame(); clearInput(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseGame(); clearInput(); } });
window.addEventListener('beforeunload', () => recordRun());

// Snapshot-only inspection for local browser diagnostics; callers cannot mutate the game.
window.getGameState = () => structuredClone(game.state);
createPreview();
requestAnimationFrame(animate);
