import { Game } from './engine.js';
import { Renderer } from './renderer.js';
import { ELEMENTS, ARENAS, MODES, DIFFICULTIES } from './data.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'fourfold:v1';
const STEP = 1 / 120;
const symbols = { air: '≋', water: '◡', earth: '◇', fire: '⋀' };
const defaults = { element: 'air', arena: 'air', mode: 'survival', difficulty: 'normal', sound: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
const fields = { element: ELEMENTS, arena: ARENAS, mode: MODES, difficulty: DIFFICULTIES };
const storage = loadStorage();
const preferences = storage.settings;
const canvas = $('game-canvas');
const renderer = new Renderer(canvas);
const held = new Set();
const presses = new Set();
const edgeKeys = { Space: 'jump', ShiftLeft: 'dash', ShiftRight: 'dash', KeyJ: 'attack', KeyK: 'special', KeyL: 'burst', KeyE: 'interact', KeyU: 'throw' };
const directionKeys = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down' };
const playKeys = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyI', ...Object.keys(edgeKeys)]);
const lastDirectionTap = { left: -Infinity, right: -Infinity };
let runDirection = null;
let command = null;
let commandCast = false;
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
    if (parsed.records && typeof parsed.records === 'object') {
      for (const mode of Object.keys(MODES)) {
        for (const difficulty of Object.keys(DIFFICULTIES)) {
          const key = `${mode}:${difficulty}`;
          const saved = parsed.records[key];
          if (!saved || typeof saved !== 'object') continue;
          result.records[key] = Object.fromEntries(['score', 'wave', 'completions', 'runs'].map((field) => [field, Number.isFinite(saved[field]) && saved[field] >= 0 ? Math.floor(Math.min(saved[field], 1e9)) : 0]));
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
  return `${settings.mode}:${settings.difficulty}`;
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
  for (const name of ['mode', 'arena', 'difficulty']) $(name + '-select').value = preferences[name];
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
  held.clear();
  presses.clear();
  lastDirectionTap.left = lastDirectionTap.right = -Infinity;
  runDirection = null;
  command = null;
  commandCast = false;
  accumulator = 0;
}

function directionHeld(direction) {
  return Object.entries(directionKeys).some(([code, value]) => value === direction && held.has(code));
}

function queueKeyPress(code, now) {
  const direction = directionKeys[code];
  if (direction === 'left' || direction === 'right') {
    if (!directionHeld(direction)) {
      runDirection = now - lastDirectionTap[direction] <= 250 ? direction : null;
      lastDirectionTap[direction] = now;
      lastDirectionTap[direction === 'left' ? 'right' : 'left'] = -Infinity;
    }
    if (runDirection && runDirection !== direction) runDirection = null;
  }
  if (command && now - command.started > 700) command = null;
  if (code === 'KeyI') {
    command = { started: now, direction: null };
  } else if (direction && command) {
    command.direction = direction === 'down' ? null : direction;
  } else if (code === 'KeyJ' && command?.direction) {
    presses.delete('attack');
    presses.add(command.direction === 'up' ? 'burst' : 'special');
    commandCast = true;
    command = null;
    return;
  } else if (edgeKeys[code]) {
    command = null;
  }
  if (edgeKeys[code]) presses.add(edgeKeys[code]);
}

function releaseKey(code) {
  held.delete(code);
  if (runDirection && !directionHeld(runDirection)) runDirection = null;
}

function readInput() {
  const input = {
    left: directionHeld('left'),
    right: directionHeld('right'),
    up: directionHeld('up'),
    down: directionHeld('down'),
    guard: held.has('KeyI') && !commandCast,
    run: Boolean(runDirection && directionHeld(runDirection) && !directionHeld(runDirection === 'left' ? 'right' : 'left')),
  };
  for (const action of Object.values(edgeKeys)) input[action] = presses.has(action);
  presses.clear();
  commandCast = false;
  return input;
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
  announce(`${ELEMENTS[preferences.element].name}, ${MODES[preferences.mode].name}, ${DIFFICULTIES[preferences.difficulty].name}. Fight!`);
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
  $('resume-button').hidden = !paused;
  $('retry-button').hidden = !terminal;
  $('result-stats').hidden = !terminal;
  $('pause-settings').hidden = !paused;
  if (modal) {
    $('modal-eyebrow').textContent = paused ? 'TAKE A BREATH' : status === 'won' ? 'BALANCE RESTORED' : 'BACK TO THE ELEMENTS';
    $('modal-title').textContent = paused ? 'Paused.' : status === 'won' ? 'Well fought.' : 'A good fight.';
    $('modal-description').textContent = paused ? 'Catch your breath, then get back into the arena.' : status === 'won' ? `${MODES[state.settings.mode].name} complete. Try another element or turn up the difficulty.` : `Your run ends at ${state.settings.mode === 'tournament' ? 'guardian' : 'wave'} ${state.wave}. Every attempt is a fresh start.`;
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
  const signature = [s.status, Math.ceil(p.hp), Math.floor(p.energy), s.lives, s.wave, s.score, p.weapon, p.weaponHits, s.arena, s.objective, shotReadiness, burstReadiness].join('|');
  if (signature !== hudSignature) {
    hudSignature = signature;
    updateMeter('health', p.hp, p.maxHp);
    updateMeter('energy', p.energy, p.maxEnergy);
    $('health-value').textContent = `${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`;
    $('energy-value').textContent = `${Math.floor(Math.max(0, p.energy))} energy`;
    $('shot-label').textContent = `${element.special} · ${element.specialCost} · ${shotReadiness}`;
    $('burst-label').textContent = `${element.burst} · ${element.burstCost} · ${burstReadiness}`;
    $('energy-meter').title = `Energy ${Math.floor(p.energy)} / ${p.maxEnergy}. ${element.burst}: ${burstReadiness}.`;
    $('mode-label').textContent = `${MODES[mode].name.toUpperCase()} / ${DIFFICULTIES[s.settings.difficulty].name.toUpperCase()}`;
    $('stage-label').textContent = s.status === 'ready' ? 'READY WHEN YOU ARE' : mode === 'training' ? 'PRACTICE YOUR FLOW' : mode === 'story' ? `STAGE ${s.wave} / 4` : mode === 'tournament' ? `GUARDIAN ${s.wave} / 3` : mode === 'challenge' ? `${s.kills} / 12 DEFEATED` : `WAVE ${String(s.wave).padStart(2, '0')}`;
    $('objective-label').textContent = s.objective || MODES[mode].objective;
    const lives = mode === 'training' ? Infinity : Math.max(0, s.lives);
    $('lives-value').textContent = lives === Infinity ? '∞' : lives ? Array(lives).fill('●').join(' ') : '—';
    $('lives-value').setAttribute('aria-label', `${lives === Infinity ? 'Unlimited' : lives} lives`);
    $('score-value').textContent = String(s.score).padStart(5, '0');
    $('arena-name').textContent = ARENAS[s.arena].name.toUpperCase();
    $('weapon-label').textContent = p.weapon ? `${p.weapon.toUpperCase()} · ${p.weaponHits} HITS · U THROW / E DROP` : 'UNARMED · E PICK UP / DRINK';
  }
  const boss = s.enemies.find((enemy) => enemy.type === 'boss' && !enemy.dead && enemy.hp > 0);
  $('boss-hud').hidden = !boss || s.status === 'ready';
  if (boss) {
    $('boss-name').textContent = `${ELEMENTS[boss.element].name.toUpperCase()} GUARDIAN${boss.bossPhase > 1 ? ' · ENRAGED' : ''}`;
    $('boss-health-value').textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    $('boss-health-fill').style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
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

function updateAudio() {
  const s = game.state;
  if (!s.player) return;
  const current = { hp: s.player.hp, lives: s.lives, kills: s.kills, attack: s.player.attackTimer, energy: s.player.energy, wave: s.wave };
  if (audioSnapshot && s.status === 'playing') {
    if (current.lives < audioSnapshot.lives) tone(160, 40, .25, .04, 'triangle');
    else if (current.hp < audioSnapshot.hp) tone(130, 45, .12, .035, 'triangle');
    else if (current.kills > audioSnapshot.kills) tone(460, 800, .12, .025);
    else if (current.energy < audioSnapshot.energy - 5) tone(280, 700, .16, .02, 'triangle');
    else if (current.attack > audioSnapshot.attack + .05) tone(180, 65, .07, .015, 'triangle');
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
      game.tick(readInput(), STEP);
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
for (const name of ['mode', 'arena', 'difficulty']) {
  $(name + '-select').addEventListener('change', (event) => {
    if (game.state.status !== 'ready') return;
    preferences[name] = event.target.value;
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
  if (status !== 'playing' || nativeControl || !playKeys.has(event.code)) return;
  event.preventDefault();
  if (!event.repeat) queueKeyPress(event.code, performance.now());
  held.add(event.code);
});
window.addEventListener('keyup', (event) => {
  releaseKey(event.code);
  if (game.state.status === 'playing' && playKeys.has(event.code)) event.preventDefault();
});
window.addEventListener('blur', () => { pauseGame(); clearInput(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseGame(); clearInput(); } });
window.addEventListener('beforeunload', () => recordRun());

// Snapshot-only inspection for local browser diagnostics; callers cannot mutate the game.
window.getGameState = () => structuredClone(game.state);
createPreview();
requestAnimationFrame(animate);
