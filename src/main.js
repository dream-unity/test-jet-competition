import { Renderer, V3 } from './renderer.js';
import {
  RelationalGenerator,
  PRNG,
  clamp,
  lerp,
  mat3Vector,
  hashString,
} from './relational.js';
import { InputController, AudioEngine, median } from './systems.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const PALETTE = ['#55f7ff', '#ff4fd8', '#ffd166', '#75ff9b', '#9b7cff', '#ff7849'];
const AI_COLORS = ['#ff4fd8', '#ffd166', '#75ff9b', '#9b7cff', '#ff7849'];
const HISTORY_KEY = 'dream-unity-impulse-run-history-v1';
const RECORD_KEY = 'dream-unity-impulse-run-records-v1';
const SETTINGS_KEY = 'dream-unity-impulse-run-settings-v1';
const COURSE_WIDTH = 76;
const COURSE_MIN_Y = -36;
const COURSE_MAX_Y = 48;
const GATE_RADIUS = 12.5;

const MODE_CONFIG = {
  'grand-prix': {
    label: 'RELATIONAL GRAND PRIX',
    button: 'LAUNCH GRAND PRIX',
    challengeCount: 10,
    baseSpeed: 104,
    initialSkill: 3.6,
    variant: 'mixed',
    feedback: true,
    tutorial: false,
  },
  training: {
    label: 'VECTOR TRAINING',
    button: 'BEGIN TRAINING',
    challengeCount: 8,
    baseSpeed: 86,
    initialSkill: 1.8,
    variant: 'mixed',
    feedback: true,
    tutorial: true,
  },
  assessment: {
    label: 'ASSESSMENT RUN',
    button: 'BEGIN ASSESSMENT',
    challengeCount: 12,
    baseSpeed: 98,
    initialSkill: 5,
    variant: 'assessment',
    feedback: false,
    tutorial: false,
    fixedLevels: [2, 3, 4, 5, 6, 7, 8, 5, 9, 6, 10, 7],
  },
  transfer: {
    label: 'TRANSFER TRIAL',
    button: 'LAUNCH TRANSFER TRIAL',
    challengeCount: 10,
    baseSpeed: 108,
    initialSkill: 6.2,
    variant: 'transfer',
    feedback: false,
    tutorial: false,
  },
};

const FAMILY_LABELS = {
  rotation: 'SPATIAL ROTATION',
  reflection: 'MIRROR RELATION',
  trajectory: 'RELATIVE TRAJECTORY',
  expansion: 'SCALE / OFFSET',
  composition: 'RULE COMPOSITION',
  frame: 'REFERENCE FRAME',
  attribute: 'STRUCTURAL REMAPPING',
};

const ERROR_LABELS = {
  inverse: 'reversed transformation',
  'wrong-axis': 'axis substitution',
  'wrong-frame': 'reference-frame substitution',
  'reversed-trajectory': 'reversed trajectory',
  'wrong-magnitude': 'magnitude substitution',
  'surface-only': 'surface-similarity capture',
  'omitted-last': 'incomplete composition',
  'reversed-order': 'operation-order reversal',
  'first-step-only': 'single-step capture',
  'partial-transform': 'partial transformation',
};

function smoothstep(t) {
  const value = clamp(t, 0, 1);
  return value * value * (3 - 2 * value);
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds || 0);
  const minutes = Math.floor(safe / 60);
  const remaining = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(1).padStart(4, '0')}`;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function safeJsonParse(text, fallback) {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function nearestCandidate(x, y, layout) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  layout.positions.forEach(([candidateX, candidateY], index) => {
    const distance = Math.hypot(x - candidateX, y - candidateY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return { index: bestIndex, distance: bestDistance };
}

function seededUnit(seed) {
  return (hashString(seed) % 100000) / 100000;
}

class ImpulseRun {
  constructor() {
    this.canvas = $('#gameCanvas');
    this.renderer = new Renderer(this.canvas);
    this.audio = new AudioEngine();
    this.input = new InputController({
      canvas: this.canvas,
      joystick: $('#joystick'),
      stick: $('#stick'),
      boostButton: $('#boostButton'),
      brakeButton: $('#brakeButton'),
      pauseButton: $('#pauseButton'),
    });
    this.ui = this.captureUi();
    this.mode = 'grand-prix';
    this.state = 'menu';
    this.previousState = 'menu';
    this.lastTimestamp = performance.now();
    this.worldTime = 0;
    this.gameTime = 0;
    this.feedbackTimeout = 0;
    this.countdownRemaining = 0;
    this.race = null;
    this.menuPilot = this.createPlayer(0);
    this.menuPilot.speed = 42;
    this.menuPilot.x = 0;
    this.menuPilot.y = 2;
    this.settings = safeJsonParse(localStorage.getItem(SETTINGS_KEY), { sound: true, reducedMotion: false });
    this.audio.setEnabled(this.settings.sound !== false);
    document.body.classList.toggle('reduced-motion', Boolean(this.settings.reducedMotion));
    this.ui.soundButton.classList.toggle('off', !this.settings.sound);
    this.ui.motionButton.classList.toggle('off', !this.settings.reducedMotion);
    this.bindUi();
    this.updateModeSelection();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  captureUi() {
    return {
      hud: $('#hud'),
      menu: $('#menu'),
      pauseOverlay: $('#pauseOverlay'),
      resultsOverlay: $('#resultsOverlay'),
      feedback: $('#feedback'),
      countdown: $('#countdown'),
      challengeBeacon: $('#challengeBeacon'),
      challengeFamily: $('#challengeFamily'),
      pauseButton: $('#pauseButton'),
      touchControls: $('#touchControls'),
      launchButton: $('#launchButton'),
      soundButton: $('#soundButton'),
      motionButton: $('#motionButton'),
      resumeButton: $('#resumeButton'),
      restartButton: $('#restartButton'),
      menuButton: $('#menuButton'),
      runAgainButton: $('#runAgainButton'),
      exportButton: $('#exportButton'),
      resultsMenuButton: $('#resultsMenuButton'),
      modeLabel: $('#modeLabel'),
      positionValue: $('#positionValue'),
      timeValue: $('#timeValue'),
      sectorValue: $('#sectorValue'),
      relationValue: $('#relationValue'),
      pilotValue: $('#pilotValue'),
      speedValue: $('#speedValue'),
      boostFill: $('#boostFill'),
      shieldFill: $('#shieldFill'),
      resultTitle: $('#resultTitle'),
      resultRelation: $('#resultRelation'),
      resultPilot: $('#resultPilot'),
      resultPosition: $('#resultPosition'),
      resultLatency: $('#resultLatency'),
      resultNovelty: $('#resultNovelty'),
      resultPrecision: $('#resultPrecision'),
      resultCollisions: $('#resultCollisions'),
      resultDiagnostic: $('#resultDiagnostic'),
      resultTime: $('#resultTime'),
      familyBreakdown: $('#familyBreakdown'),
      fatalError: $('#fatalError'),
    };
  }

  bindUi() {
    $$('.mode-card').forEach((button) => {
      button.addEventListener('click', () => {
        this.mode = button.dataset.mode;
        this.updateModeSelection();
      });
    });
    this.ui.launchButton.addEventListener('click', () => this.startRace(this.mode));
    this.ui.soundButton.addEventListener('click', async () => {
      this.settings.sound = !this.settings.sound;
      this.audio.setEnabled(this.settings.sound);
      this.ui.soundButton.classList.toggle('off', !this.settings.sound);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      if (this.settings.sound) await this.audio.unlock();
    });
    this.ui.motionButton.addEventListener('click', () => {
      this.settings.reducedMotion = !this.settings.reducedMotion;
      document.body.classList.toggle('reduced-motion', this.settings.reducedMotion);
      this.ui.motionButton.classList.toggle('off', !this.settings.reducedMotion);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    });
    this.ui.resumeButton.addEventListener('click', () => this.resume());
    this.ui.restartButton.addEventListener('click', () => this.startRace(this.mode));
    this.ui.menuButton.addEventListener('click', () => this.returnToMenu());
    this.ui.runAgainButton.addEventListener('click', () => this.startRace(this.mode));
    this.ui.resultsMenuButton.addEventListener('click', () => this.returnToMenu());
    this.ui.exportButton.addEventListener('click', () => this.exportTelemetry());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && ['racing', 'countdown'].includes(this.state)) this.pause();
    });
  }

  updateModeSelection() {
    const config = MODE_CONFIG[this.mode];
    $$('.mode-card').forEach((button) => button.classList.toggle('selected', button.dataset.mode === this.mode));
    this.ui.launchButton.textContent = config.button;
  }

  createPlayer(z = 0) {
    return {
      x: 0,
      y: 0,
      z,
      vx: 0,
      vy: 0,
      speed: 0,
      roll: 0,
      pitch: 0,
      boost: 1,
      shield: 1,
      collisionCooldown: 0,
      flash: 0,
      lastBoost: false,
    };
  }

  loadHistory() {
    const history = safeJsonParse(localStorage.getItem(HISTORY_KEY), []);
    return Array.isArray(history) ? history.slice(-700) : [];
  }

  startRace(mode) {
    this.mode = mode;
    const config = MODE_CONFIG[mode];
    const seedParam = new URLSearchParams(window.location.search).get('seed');
    const raceSeed = seedParam || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const history = this.loadHistory();
    const generator = new RelationalGenerator(raceSeed, history);
    const player = this.createPlayer(0);
    player.speed = config.baseSpeed * 0.72;
    const sectors = Array.from({ length: config.challengeCount }, (_, index) => {
      const startZ = 500 + index * 790;
      return {
        index,
        startZ,
        previewZ: startZ + 310,
        commitZ: startZ + 505,
        gateZ: startZ + 650,
        challenge: null,
        seenAt: null,
        committed: false,
        executed: false,
        choice: null,
        aiChoices: new Map(),
        feedbackVisible: false,
      };
    });

    this.race = {
      seed: raceSeed,
      config,
      generator,
      historyBefore: new Set(history),
      player,
      sectors,
      records: [],
      obstacles: this.createObstacles(raceSeed, sectors),
      boosts: this.createBoosts(raceSeed, sectors),
      racers: this.createAiRacers(config, raceSeed),
      skill: config.initialSkill,
      collisions: 0,
      finished: false,
      finishZ: sectors.at(-1).gateZ + 480,
      lastCheckpoint: -1,
      finalRank: null,
      startWallTime: Date.now(),
    };
    this.gameTime = 0;
    this.ensureChallenges(0);
    this.ensureChallenges(1);
    this.state = 'countdown';
    this.countdownRemaining = 3.8;
    this.ui.menu.classList.add('hidden');
    this.ui.pauseOverlay.classList.add('hidden');
    this.ui.resultsOverlay.classList.add('hidden');
    this.ui.hud.classList.remove('hidden');
    this.ui.pauseButton.classList.remove('hidden');
    this.ui.touchControls.classList.remove('hidden');
    this.ui.countdown.classList.remove('hidden');
    this.ui.challengeBeacon.classList.add('hidden');
    this.ui.modeLabel.textContent = config.label;
    this.updateHud();
    this.audio.unlock().catch(() => {});
  }

  createAiRacers(config, seed) {
    const rng = new PRNG(`${seed}:ai`);
    return Array.from({ length: 5 }, (_, index) => ({
      id: index,
      color: AI_COLORS[index % AI_COLORS.length],
      x: (index - 2) * 5.5,
      y: (index % 2 ? 1 : -1) * (4 + index),
      z: rng.int(-60, 52),
      vx: 0,
      vy: 0,
      speed: config.baseSpeed * (0.91 + index * 0.018 + rng.next() * 0.035),
      skill: clamp(0.58 + index * 0.07 + rng.next() * 0.08, 0.58, 0.94),
      phase: rng.next() * Math.PI * 2,
      targetX: 0,
      targetY: 0,
      roll: 0,
    }));
  }

  createObstacles(seed, sectors) {
    const rng = new PRNG(`${seed}:obstacles`);
    const obstacles = [];
    for (const sector of sectors) {
      const base = sector.gateZ + 150;
      const count = rng.int(2, 4);
      for (let i = 0; i < count; i += 1) {
        const type = rng.bool(0.58) ? 'orb' : 'bar';
        obstacles.push({
          id: `${sector.index}-${i}`,
          type,
          z: base + i * 82 + rng.int(-18, 18),
          x: rng.int(-48, 48),
          y: rng.int(-24, 34),
          phase: rng.next() * Math.PI * 2,
          amplitude: rng.int(4, 15),
          speed: 0.5 + rng.next() * 0.8,
          radius: type === 'orb' ? rng.pick([3.8, 4.8, 5.5]) : 3,
          hit: false,
        });
      }
    }
    return obstacles;
  }

  createBoosts(seed, sectors) {
    const rng = new PRNG(`${seed}:boosts`);
    return sectors.map((sector, index) => ({
      id: index,
      z: sector.gateZ + 90,
      x: rng.int(-18, 18),
      y: rng.int(-8, 16),
      collected: false,
      phase: rng.next() * Math.PI * 2,
    }));
  }

  levelForSector(index) {
    const { config, skill } = this.race;
    if (config.fixedLevels) return config.fixedLevels[index % config.fixedLevels.length];
    const ramp = this.mode === 'training' ? index * 0.18 : index * 0.24;
    const transferFloor = this.mode === 'transfer' ? 6 : 1;
    return clamp(Math.round(skill + ramp), transferFloor, 10);
  }

  ensureChallenges(index) {
    if (!this.race || index < 0 || index >= this.race.sectors.length) return;
    const sector = this.race.sectors[index];
    if (sector.challenge) return;
    const level = this.levelForSector(index);
    sector.challenge = this.race.generator.next(level, this.race.config.variant);
  }

  pause() {
    if (!['racing', 'countdown'].includes(this.state)) return;
    this.previousState = this.state;
    this.state = 'paused';
    this.ui.pauseOverlay.classList.remove('hidden');
    this.ui.touchControls.classList.add('hidden');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.previousState === 'countdown' ? 'countdown' : 'racing';
    this.ui.pauseOverlay.classList.add('hidden');
    this.ui.touchControls.classList.remove('hidden');
    this.lastTimestamp = performance.now();
  }

  returnToMenu() {
    this.state = 'menu';
    this.race = null;
    this.gameTime = 0;
    this.ui.menu.classList.remove('hidden');
    this.ui.pauseOverlay.classList.add('hidden');
    this.ui.resultsOverlay.classList.add('hidden');
    this.ui.hud.classList.add('hidden');
    this.ui.pauseButton.classList.add('hidden');
    this.ui.touchControls.classList.add('hidden');
    this.ui.challengeBeacon.classList.add('hidden');
    this.ui.feedback.classList.add('hidden');
    this.ui.countdown.classList.add('hidden');
  }

  loop(timestamp) {
    try {
      const rawDelta = (timestamp - this.lastTimestamp) / 1000;
      this.lastTimestamp = timestamp;
      const dt = clamp(rawDelta || 0, 0, 0.033);
      this.worldTime += dt;
      const input = this.input.sample();
      if (input.pause && ['racing', 'countdown'].includes(this.state)) this.pause();
      else if (input.pause && this.state === 'paused') this.resume();

      if (this.state === 'menu') this.updateMenu(dt);
      if (this.state === 'countdown') this.updateCountdown(dt, input);
      if (this.state === 'racing') this.updateRace(dt, input);
      if (this.state === 'paused' || this.state === 'results') this.audio.update(0, false, false);

      this.render();
      if (this.feedbackTimeout > 0) {
        this.feedbackTimeout -= dt;
        if (this.feedbackTimeout <= 0) this.ui.feedback.classList.add('hidden');
      }
    } catch (error) {
      console.error(error);
      this.state = 'error';
      this.ui.fatalError.textContent = `Impulse Run encountered an unexpected error: ${error.message}`;
      this.ui.fatalError.classList.remove('hidden');
    }
    requestAnimationFrame(this.loop);
  }

  updateMenu(dt) {
    const player = this.menuPilot;
    player.z += player.speed * dt;
    player.x = Math.sin(this.worldTime * 0.35) * 12;
    player.y = 3 + Math.sin(this.worldTime * 0.53) * 4;
    player.roll = -Math.cos(this.worldTime * 0.35) * 0.18;
    if (player.z > 1200) player.z -= 1200;
    this.audio.update(0.2, false, false);
  }

  updateCountdown(dt, input) {
    const race = this.race;
    if (!race) return;
    this.countdownRemaining -= dt;
    const display = Math.ceil(this.countdownRemaining - 0.4);
    if (this.countdownRemaining > 0.5) {
      this.ui.countdown.textContent = display > 0 ? String(display) : 'LOCK';
    } else {
      this.ui.countdown.textContent = 'FLY';
    }
    this.updatePlayer(dt, { ...input, x: input.x * 0.5, y: input.y * 0.5, boost: false, brake: true }, true);
    this.updateAi(dt);
    if (this.countdownRemaining <= 0) {
      this.state = 'racing';
      this.ui.countdown.classList.add('hidden');
      this.showFeedback('SEE • RELATE • COMMIT • FLY', 'neutral', 1.8);
    }
    this.updateHud();
  }

  updateRace(dt, input) {
    if (!this.race || this.race.finished) return;
    this.gameTime += dt;
    this.updatePlayer(dt, input, false);
    this.updateChallengeState();
    this.updateObstacles(dt);
    this.updateBoosts();
    this.updateAi(dt);
    this.updateAiCollisions();
    this.updateHud();
    const ratio = this.race.player.speed / (this.race.config.baseSpeed * 1.65);
    this.audio.update(ratio, input.boost && this.race.player.boost > 0.01, true);
    if (this.race.player.z >= this.race.finishZ) this.finishRace();
  }

  updatePlayer(dt, input, prestart) {
    const { player, config } = this.race;
    const control = prestart ? 0.55 : 1;
    const lateralAcceleration = 74 * control;
    const verticalAcceleration = 67 * control;
    player.vx += input.x * lateralAcceleration * dt;
    player.vy += input.y * verticalAcceleration * dt;
    player.vx *= Math.exp(-3.0 * dt);
    player.vy *= Math.exp(-3.2 * dt);
    player.vx = clamp(player.vx, -45, 45);
    player.vy = clamp(player.vy, -39, 39);
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    player.roll = lerp(player.roll, -input.x * 0.55 - player.vx * 0.006 - input.roll * 0.35, 1 - Math.exp(-5 * dt));
    player.pitch = lerp(player.pitch, -input.y * 0.16 - player.vy * 0.003, 1 - Math.exp(-4 * dt));

    const usingBoost = !prestart && input.boost && player.boost > 0.01;
    if (usingBoost && !player.lastBoost) this.audio.cue('boost');
    player.lastBoost = usingBoost;
    if (usingBoost) player.boost = Math.max(0, player.boost - dt * 0.22);
    else player.boost = Math.min(1, player.boost + dt * (input.brake ? 0.12 : 0.07));

    let targetSpeed = config.baseSpeed;
    if (usingBoost) targetSpeed *= 1.58;
    if (input.brake || prestart) targetSpeed *= prestart ? 0.16 : 0.63;
    if (player.shield < 0.25) targetSpeed *= 0.93;
    player.speed += (targetSpeed - player.speed) * (1 - Math.exp(-2.4 * dt));
    player.speed = clamp(player.speed, 18, config.baseSpeed * 1.68);
    if (!prestart) player.z += player.speed * dt;

    if (player.x < -COURSE_WIDTH || player.x > COURSE_WIDTH || player.y < COURSE_MIN_Y || player.y > COURSE_MAX_Y) {
      player.x = clamp(player.x, -COURSE_WIDTH, COURSE_WIDTH);
      player.y = clamp(player.y, COURSE_MIN_Y, COURSE_MAX_Y);
      this.hitPlayer(0.045, 0.88);
      player.vx *= -0.2;
      player.vy *= -0.2;
    }

    player.collisionCooldown = Math.max(0, player.collisionCooldown - dt);
    player.flash = Math.max(0, player.flash - dt);
    player.shield = Math.min(1, player.shield + dt * 0.018);
  }

  hitPlayer(damage = 0.1, speedFactor = 0.72) {
    const player = this.race.player;
    if (player.collisionCooldown > 0) return;
    player.collisionCooldown = 0.55;
    player.flash = 0.35;
    player.shield = Math.max(0, player.shield - damage);
    player.speed *= speedFactor;
    this.race.collisions += 1;
    this.audio.cue('collision');
  }

  activeSector() {
    if (!this.race) return null;
    const z = this.race.player.z;
    return this.race.sectors.find((sector) => z >= sector.startZ - 80 && z <= sector.gateZ + 120) || null;
  }

  updateChallengeState() {
    const race = this.race;
    const player = race.player;
    const sector = this.activeSector();
    if (!sector || !sector.challenge) {
      this.ui.challengeBeacon.classList.add('hidden');
      return;
    }

    if (player.z >= sector.startZ && sector.seenAt === null) {
      sector.seenAt = this.gameTime;
      this.ui.challengeBeacon.classList.remove('hidden');
      this.ui.challengeFamily.textContent = FAMILY_LABELS[sector.challenge.family] || 'VISUAL RELATION';
      if (race.config.tutorial && sector.index === 0) {
        this.showFeedback('WATCH A → B • APPLY THE VISUAL CHANGE TO C • FLY THE MATCH', 'neutral', 5.4);
      }
    }

    if (!sector.committed && player.z >= sector.commitZ) this.commitToSector(sector);
    if (!sector.executed && player.z >= sector.gateZ) this.executeSector(sector);
    if (player.z > sector.gateZ + 95) this.ui.challengeBeacon.classList.add('hidden');
  }

  commitToSector(sector) {
    const player = this.race.player;
    const horizon = clamp((sector.gateZ - player.z) / Math.max(20, player.speed), 0, 1.8);
    const projectedX = clamp(player.x + player.vx * horizon * 0.7, -COURSE_WIDTH, COURSE_WIDTH);
    const projectedY = clamp(player.y + player.vy * horizon * 0.7, COURSE_MIN_Y, COURSE_MAX_Y);
    const nearest = nearestCandidate(projectedX, projectedY, sector.challenge.layout);
    const choice = nearest.index;
    const candidate = sector.challenge.candidates[choice];
    sector.committed = true;
    sector.choice = choice;
    sector.commitPosition = [projectedX, projectedY];
    sector.commitTime = this.gameTime;
    sector.relationalCorrect = choice === sector.challenge.correctIndex;
    sector.decisionTime = Math.max(0, this.gameTime - (sector.seenAt ?? this.gameTime));
    sector.choiceErrorModel = candidate.errorModel;

    this.showFeedback('TRAJECTORY COMMITTED', 'neutral', 1.0);
    this.audio.cue('gate');
    this.assignAiChoices(sector);
  }

  executeSector(sector) {
    const race = this.race;
    const player = race.player;
    if (!sector.committed) this.commitToSector(sector);
    const committedTarget = sector.challenge.layout.positions[sector.choice];
    const actual = nearestCandidate(player.x, player.y, sector.challenge.layout);
    const distance = Math.hypot(player.x - committedTarget[0], player.y - committedTarget[1]);
    const consistency = actual.index === sector.choice;
    const gateHit = distance <= GATE_RADIUS * 1.25 && consistency;
    const precision = clamp(1 - distance / (GATE_RADIUS * 1.65), 0, 1) * (consistency ? 1 : 0.52);
    const speedRetention = clamp(player.speed / (race.config.baseSpeed * 1.2), 0, 1);
    const motorScore = clamp(precision * 0.82 + speedRetention * 0.18, 0, 1);

    sector.executed = true;
    sector.actualGate = actual.index;
    sector.motorDistance = distance;
    sector.motorPrecision = motorScore;
    sector.gateHit = gateHit;
    sector.speedAtGate = player.speed;
    if (!gateHit) this.hitPlayer(0.08, 0.74);

    const record = {
      sector: sector.index + 1,
      seed: sector.challenge.seed,
      level: sector.challenge.level,
      family: sector.challenge.family,
      noveltySignature: sector.challenge.noveltySignature,
      choice: sector.choice,
      correctIndex: sector.challenge.correctIndex,
      relationalCorrect: sector.relationalCorrect,
      decisionTime: sector.decisionTime,
      chosenErrorModel: sector.choiceErrorModel,
      commitPosition: sector.commitPosition,
      committedTarget,
      actualGate: sector.actualGate,
      motorDistance: distance,
      motorPrecision: motorScore,
      gateHit,
      speedAtGate: player.speed,
      timestamp: Date.now(),
    };
    race.records.push(record);
    race.lastCheckpoint = sector.index;

    if (!race.config.fixedLevels) {
      const timeBonus = sector.decisionTime < 4.2 ? 0.14 : sector.decisionTime > 7 ? -0.08 : 0;
      race.skill = clamp(race.skill + (sector.relationalCorrect ? 0.42 + timeBonus : -0.48), 1, 9.3);
    }
    this.ensureChallenges(sector.index + 1);
    this.ensureChallenges(sector.index + 2);

    if (race.config.feedback) {
      const relationText = sector.relationalCorrect ? 'RELATION ✓' : 'RELATION ×';
      const pilotText = `PILOT ${Math.round(motorScore * 100)}%`;
      this.showFeedback(`${relationText}  //  ${pilotText}`, sector.relationalCorrect ? 'correct' : 'incorrect', 1.55);
      this.audio.cue(sector.relationalCorrect ? 'correct' : 'incorrect');
    } else {
      this.showFeedback(`EXECUTION CAPTURED  //  ${Math.round(motorScore * 100)}%`, 'neutral', 1.1);
      this.audio.cue('gate');
    }
  }

  assignAiChoices(sector) {
    const rng = new PRNG(`${this.race.seed}:ai-choice:${sector.index}`);
    for (const ai of this.race.racers) {
      let choice = sector.challenge.correctIndex;
      if (!rng.bool(ai.skill)) {
        const wrong = sector.challenge.candidates.map((_, index) => index).filter((index) => index !== sector.challenge.correctIndex);
        choice = rng.pick(wrong);
      }
      sector.aiChoices.set(ai.id, choice);
    }
  }

  updateObstacles() {
    const { player, obstacles } = this.race;
    for (const obstacle of obstacles) {
      if (obstacle.hit || Math.abs(obstacle.z - player.z) > 8) continue;
      const position = this.obstaclePosition(obstacle);
      let collision = false;
      if (obstacle.type === 'orb') {
        collision = Math.hypot(player.x - position[0], player.y - position[1]) < obstacle.radius + 2.2;
      } else {
        collision = Math.abs(player.y - position[1]) < 3.2 && Math.abs(player.x - position[0]) < 19;
      }
      if (collision) {
        obstacle.hit = true;
        this.hitPlayer(obstacle.type === 'orb' ? 0.12 : 0.16, 0.63);
      }
    }
  }

  obstaclePosition(obstacle) {
    if (obstacle.type === 'orb') {
      return [
        obstacle.x + Math.sin(this.worldTime * obstacle.speed + obstacle.phase) * obstacle.amplitude,
        obstacle.y + Math.cos(this.worldTime * obstacle.speed * 0.73 + obstacle.phase) * obstacle.amplitude * 0.45,
        obstacle.z,
      ];
    }
    return [
      obstacle.x + Math.sin(this.worldTime * obstacle.speed + obstacle.phase) * obstacle.amplitude,
      obstacle.y,
      obstacle.z,
    ];
  }

  updateBoosts() {
    const { player, boosts } = this.race;
    for (const boost of boosts) {
      if (boost.collected || Math.abs(boost.z - player.z) > 7) continue;
      if (Math.hypot(player.x - boost.x, player.y - boost.y) < 11.5) {
        boost.collected = true;
        player.boost = Math.min(1, player.boost + 0.38);
        player.speed += 13;
        this.audio.cue('boost');
      }
    }
  }

  updateAi(dt) {
    if (!this.race) return;
    const race = this.race;
    const player = race.player;
    const active = this.activeSector();
    for (const ai of race.racers) {
      const catchup = clamp((player.z - ai.z) * 0.018, -8, 9);
      let targetSpeed = race.config.baseSpeed * (0.93 + ai.skill * 0.13) + catchup + Math.sin(this.worldTime * 0.7 + ai.phase) * 2.5;
      let targetX = Math.sin(this.worldTime * 0.42 + ai.phase) * 10;
      let targetY = Math.sin(this.worldTime * 0.31 + ai.phase * 1.3) * 7;

      if (active && ai.z >= active.startZ - 50 && ai.z <= active.gateZ + 70) {
        if (!active.committed) {
          targetX *= 0.25;
          targetY *= 0.25;
          if (ai.z >= active.commitZ - 18) {
            ai.z = active.commitZ - 18 - ai.id * 0.7;
            targetSpeed = 25;
          }
        } else {
          const choice = active.aiChoices.get(ai.id) ?? active.challenge.correctIndex;
          const target = active.challenge.layout.positions[choice];
          targetX = target[0] + (ai.id - 2) * 0.7;
          targetY = target[1] + Math.sin(ai.phase) * 0.9;
          targetSpeed += 7;
        }
      }

      ai.vx += (targetX - ai.x) * 2.2 * dt;
      ai.vy += (targetY - ai.y) * 2.0 * dt;
      ai.vx *= Math.exp(-2.8 * dt);
      ai.vy *= Math.exp(-2.8 * dt);
      ai.x += ai.vx * dt;
      ai.y += ai.vy * dt;
      ai.x = clamp(ai.x, -COURSE_WIDTH + 5, COURSE_WIDTH - 5);
      ai.y = clamp(ai.y, COURSE_MIN_Y + 5, COURSE_MAX_Y - 5);
      ai.speed += (targetSpeed - ai.speed) * (1 - Math.exp(-1.7 * dt));
      if (this.state !== 'countdown') ai.z += ai.speed * dt;
      ai.roll = lerp(ai.roll, -ai.vx * 0.018, 1 - Math.exp(-5 * dt));
    }
  }

  updateAiCollisions() {
    const player = this.race.player;
    if (player.collisionCooldown > 0) return;
    for (const ai of this.race.racers) {
      if (Math.abs(ai.z - player.z) < 4.8 && Math.hypot(ai.x - player.x, ai.y - player.y) < 5.2) {
        player.vx += (player.x - ai.x || 1) * 1.2;
        player.vy += (player.y - ai.y || 1) * 1.2;
        this.hitPlayer(0.07, 0.82);
        ai.speed *= 0.92;
        break;
      }
    }
  }

  raceRank() {
    if (!this.race) return 1;
    const playerZ = this.race.player.z;
    return 1 + this.race.racers.filter((ai) => ai.z > playerZ).length;
  }

  updateHud() {
    if (!this.race) return;
    const records = this.race.records;
    const player = this.race.player;
    const relationAccuracy = records.length ? records.filter((record) => record.relationalCorrect).length / records.length : null;
    const pilotAccuracy = records.length ? average(records.map((record) => record.motorPrecision)) : null;
    const nextSector = Math.min(this.race.sectors.length, Math.max(1, this.race.lastCheckpoint + 2));
    this.ui.positionValue.textContent = `${this.raceRank()} / 6`;
    this.ui.timeValue.textContent = formatTime(this.gameTime);
    this.ui.sectorValue.textContent = `${nextSector} / ${this.race.sectors.length}`;
    this.ui.relationValue.textContent = relationAccuracy === null ? '—' : `${Math.round(relationAccuracy * 100)}%`;
    this.ui.pilotValue.textContent = pilotAccuracy === null ? '—' : `${Math.round(pilotAccuracy * 100)}%`;
    this.ui.speedValue.textContent = Math.round(player.speed * 17.8).toLocaleString();
    this.ui.boostFill.style.transform = `scaleX(${player.boost})`;
    this.ui.shieldFill.style.transform = `scaleX(${player.shield})`;
  }

  showFeedback(message, type = 'neutral', duration = 1.2) {
    this.ui.feedback.textContent = message;
    this.ui.feedback.className = `feedback ${type}`;
    this.ui.feedbackTimeout = duration;
  }

  finishRace() {
    const race = this.race;
    race.finished = true;
    race.finalRank = this.raceRank();
    this.state = 'results';
    this.ui.resultsOverlay.classList.remove('hidden');
    this.ui.touchControls.classList.add('hidden');
    this.ui.pauseButton.classList.add('hidden');
    this.ui.challengeBeacon.classList.add('hidden');
    this.audio.cue('finish');

    const history = [...race.generator.history].slice(-700);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    const result = this.computeResults();
    this.renderResults(result);
    const records = safeJsonParse(localStorage.getItem(RECORD_KEY), []);
    records.push({
      mode: this.mode,
      date: new Date().toISOString(),
      relation: result.relation,
      pilot: result.pilot,
      rank: race.finalRank,
      time: this.gameTime,
    });
    localStorage.setItem(RECORD_KEY, JSON.stringify(records.slice(-80)));
  }

  computeResults() {
    const race = this.race;
    const records = race.records;
    const relation = records.length ? records.filter((record) => record.relationalCorrect).length / records.length : 0;
    const pilot = records.length ? average(records.map((record) => record.motorPrecision)) : 0;
    const latencies = records.map((record) => record.decisionTime);
    const novelty = records.length ? new Set(records.map((record) => record.noveltySignature)).size / records.length : 0;
    const diagnosticCounts = new Map();
    records.filter((record) => !record.relationalCorrect).forEach((record) => {
      const label = ERROR_LABELS[record.chosenErrorModel] || record.chosenErrorModel || 'uncategorised';
      diagnosticCounts.set(label, (diagnosticCounts.get(label) || 0) + 1);
    });
    const diagnostic = [...diagnosticCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'no dominant error';
    const family = {};
    for (const record of records) {
      family[record.family] ||= { correct: 0, total: 0 };
      family[record.family].total += 1;
      if (record.relationalCorrect) family[record.family].correct += 1;
    }
    return {
      relation,
      pilot,
      medianLatency: median(latencies),
      novelty,
      diagnostic,
      family,
      precision: average(records.map((record) => clamp(1 - record.motorDistance / (GATE_RADIUS * 1.65), 0, 1))),
      collisions: race.collisions,
      rank: race.finalRank,
      time: this.gameTime,
    };
  }

  renderResults(result) {
    this.ui.resultTitle.textContent = result.rank === 1 ? 'VECTOR CIRCUIT WON' : 'VECTOR RUN COMPLETE';
    this.ui.resultRelation.textContent = `${Math.round(result.relation * 100)}%`;
    this.ui.resultPilot.textContent = `${Math.round(result.pilot * 100)}%`;
    this.ui.resultPosition.textContent = `${result.rank} / 6`;
    this.ui.resultLatency.textContent = `${result.medianLatency.toFixed(2)} s`;
    this.ui.resultNovelty.textContent = `${Math.round(result.novelty * 100)}%`;
    this.ui.resultPrecision.textContent = `${Math.round(result.precision * 100)}%`;
    this.ui.resultCollisions.textContent = String(result.collisions);
    this.ui.resultDiagnostic.textContent = result.diagnostic;
    this.ui.resultTime.textContent = formatTime(result.time);
    this.ui.familyBreakdown.innerHTML = Object.entries(result.family)
      .map(([family, value]) => `<span class="family-chip">${FAMILY_LABELS[family] || family}: <b>${Math.round((value.correct / value.total) * 100)}%</b></span>`)
      .join('');
  }

  exportTelemetry() {
    if (!this.race) return;
    const payload = {
      schema: 'dream-unity.impulse-run.telemetry.v1',
      exportedAt: new Date().toISOString(),
      session: {
        mode: this.mode,
        seed: this.race.seed,
        durationSeconds: this.gameTime,
        finalRank: this.race.finalRank,
        collisions: this.race.collisions,
        results: this.computeResults(),
      },
      records: this.race.records,
      notice: 'Experimental game telemetry; not a clinical or validated intelligence assessment.',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `impulse-run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  render() {
    const race = this.race;
    const player = race?.player || this.menuPilot;
    const speedRatio = race ? player.speed / (race.config.baseSpeed * 1.6) : 0.2;
    const cameraShake = race && player.flash > 0 ? player.flash * 1.8 : 0;
    const shakeX = Math.sin(this.worldTime * 65) * cameraShake;
    const shakeY = Math.cos(this.worldTime * 71) * cameraShake;
    const eye = [
      player.x * 0.48 - player.vx * 0.045 + shakeX,
      player.y * 0.48 + 10.8 + shakeY,
      player.z - 29,
    ];
    const target = [
      player.x * 0.72,
      player.y * 0.64 + 2.5,
      player.z + 50 + speedRatio * 12,
    ];
    this.renderer.beginFrame({
      eye,
      target,
      fov: 65 + speedRatio * 9 + (player.lastBoost ? 4 : 0),
      fogNear: 105,
      fogFar: 810,
    });
    this.renderEnvironment(player);
    if (race) {
      this.renderRaceObjects();
      this.renderAiRacers();
    } else {
      this.renderMenuCourse(player);
    }
    this.renderPlayerJet(player, speedRatio);
    if (!this.settings.reducedMotion) this.renderSpeedLines(player, speedRatio);
  }

  renderEnvironment(player) {
    const renderer = this.renderer;
    const starBase = Math.floor(player.z / 1200) * 1200;
    renderer.draw('stars', {
      position: [0, 0, starBase],
      color: '#b9e8ff',
      alpha: 0.72,
      emissive: 1,
      depthWrite: false,
      pointSize: 2.5,
    });

    const startSegment = Math.floor((player.z - 160) / 80);
    for (let segment = startSegment; segment < startSegment + 14; segment += 1) {
      const z = segment * 80;
      const intensity = segment % 3 === 0 ? 0.42 : 0.2;
      renderer.drawBar([-COURSE_WIDTH, COURSE_MIN_Y - 3, z], [COURSE_WIDTH, COURSE_MIN_Y - 3, z], 0.1, '#477b9b', { alpha: intensity, emissive: 0.7 });
      for (const x of [-COURSE_WIDTH, -38, 0, 38, COURSE_WIDTH]) {
        renderer.drawBar([x, COURSE_MIN_Y - 3, z], [x, COURSE_MIN_Y - 3, z + 80], x === 0 ? 0.12 : 0.08, x === 0 ? '#55f7ff' : '#335a78', {
          alpha: x === 0 ? 0.23 : 0.16,
          emissive: 0.6,
        });
      }
      this.renderCitySegment(segment, z);
      if (segment % 4 === 0) {
        renderer.glow('torus', {
          position: [0, 4, z + 42],
          scale: [78, 55, 1.2],
          color: segment % 8 === 0 ? '#9b7cff' : '#55f7ff',
          alpha: 0.28,
          emissive: 1,
        }, 0.13, 1.08);
        renderer.draw('torus', {
          position: [0, 4, z + 42],
          scale: [78, 55, 1.2],
          color: segment % 8 === 0 ? '#9b7cff' : '#55f7ff',
          alpha: 0.18,
          emissive: 0.9,
        });
      }
    }
  }

  renderCitySegment(segment, z) {
    const renderer = this.renderer;
    for (const side of [-1, 1]) {
      const random = seededUnit(`city:${segment}:${side}`);
      const height = 22 + random * 75;
      const width = 8 + seededUnit(`cityw:${segment}:${side}`) * 17;
      const x = side * (104 + seededUnit(`cityx:${segment}:${side}`) * 72);
      const y = COURSE_MIN_Y - 3 + height / 2;
      renderer.draw('cube', {
        position: [x, y, z + 30],
        scale: [width, height, 18 + random * 24],
        color: side < 0 ? '#0e2942' : '#211b45',
        alpha: 0.62,
        emissive: 0.12,
      });
      if (segment % 2 === 0) {
        renderer.drawBar([x - width * 0.32, y, z + 8], [x - width * 0.32, y, z + 52], 0.18, side < 0 ? '#55f7ff' : '#ff4fd8', { alpha: 0.36, emissive: 1 });
      }
    }
  }

  renderMenuCourse(player) {
    const renderer = this.renderer;
    for (let i = 1; i <= 4; i += 1) {
      const z = player.z + i * 180;
      const x = Math.sin(i * 1.8 + this.worldTime * 0.4) * 24;
      const y = 5 + Math.cos(i * 1.4) * 12;
      renderer.glow('torus', { position: [x, y, z], scale: [16, 16, 1.4], color: i % 2 ? '#55f7ff' : '#9b7cff', alpha: 0.45, emissive: 1 }, 0.16, 1.12);
      renderer.draw('torus', { position: [x, y, z], scale: [16, 16, 1.4], color: i % 2 ? '#55f7ff' : '#9b7cff', alpha: 0.55, emissive: 1 });
    }
  }

  renderRaceObjects() {
    const race = this.race;
    const playerZ = race.player.z;
    for (const sector of race.sectors) {
      if (!sector.challenge || sector.gateZ < playerZ - 130 || sector.startZ > playerZ + 820) continue;
      this.renderChallengeSector(sector);
    }
    for (const obstacle of race.obstacles) {
      if (obstacle.z < playerZ - 50 || obstacle.z > playerZ + 760 || obstacle.hit) continue;
      this.renderObstacle(obstacle);
    }
    for (const boost of race.boosts) {
      if (boost.z < playerZ - 50 || boost.z > playerZ + 760 || boost.collected) continue;
      this.renderBoost(boost);
    }
    if (race.finishZ < playerZ + 900) this.renderFinishGate(race.finishZ);
  }

  renderChallengeSector(sector) {
    const renderer = this.renderer;
    const challenge = sector.challenge;
    const distance = sector.gateZ - this.race.player.z;
    const fade = clamp((distance + 90) / 190, 0, 1);
    const previewFade = clamp((this.race.player.z - sector.startZ + 80) / 120, 0, 1)
      * clamp((sector.commitZ + 70 - this.race.player.z) / 120, 0, 1);
    const panelZ = sector.previewZ;

    if (previewFade > 0.01) {
      const panelCenters = [[-28, 29, panelZ], [0, 29, panelZ], [28, 29, panelZ]];
      panelCenters.forEach((center, index) => {
        const color = index === 2 ? '#9b7cff' : '#55f7ff';
        renderer.glow('torus', { position: center, scale: [9.8, 9.8, 0.9], color, alpha: previewFade * 0.45, emissive: 1 }, 0.16, 1.11);
        renderer.draw('torus', { position: center, scale: [9.8, 9.8, 0.9], color, alpha: previewFade * 0.42, emissive: 1 });
      });
      this.renderPattern(challenge.source, panelCenters[0], 2.2, previewFade * 0.95, null, 0, !challenge.presentation.hideFrames);
      this.renderPattern(challenge.transformed, panelCenters[1], 2.2, previewFade * 0.95, null, 0, !challenge.presentation.hideFrames);
      this.renderPattern(challenge.query, panelCenters[2], 2.2, previewFade * 0.95, null, 0, !challenge.presentation.hideFrames);

      const phase = (this.worldTime / challenge.presentation.morphDuration) % 1;
      const pulseX = lerp(-18, -10, phase);
      renderer.glow('octa', {
        position: [pulseX, 29, panelZ + 0.3],
        scale: [0.65, 0.65, 0.65],
        color: '#ffd166',
        alpha: previewFade * (1 - Math.abs(phase - 0.5) * 1.3),
        emissive: 1,
      }, 0.24, 1.5);
      renderer.drawBar([-18, 29, panelZ], [-10, 29, panelZ], 0.08, '#ffd166', { alpha: previewFade * 0.32, emissive: 1 });
      renderer.drawBar([28, 19, panelZ], [28, 8, panelZ + 38], 0.08, '#9b7cff', { alpha: previewFade * 0.3, emissive: 1 });

      if (challenge.presentation.temporal && !this.settings.reducedMotion) {
        const morphPhase = smoothstep((Math.sin(this.worldTime * Math.PI / challenge.presentation.morphDuration) + 1) * 0.5);
        this.renderPattern(challenge.source, [-14, 16, panelZ + 15], 1.45, previewFade * 0.22, challenge.transformed, morphPhase, false);
      }
    }

    challenge.layout.positions.forEach(([x, y], index) => {
      let color = index % 2 ? '#9b7cff' : '#55f7ff';
      let alpha = 0.58 * fade;
      let glowStrength = 0.15;
      if (sector.committed) {
        if (index === sector.choice) {
          color = '#ffd166';
          alpha = 0.9 * fade;
          glowStrength = 0.28;
        } else {
          alpha *= 0.42;
        }
      }
      if (sector.executed && this.race.config.feedback) {
        if (index === challenge.correctIndex) {
          color = '#75ff9b';
          alpha = 0.9 * fade;
        } else if (index === sector.choice && !sector.relationalCorrect) {
          color = '#ff557c';
          alpha = 0.92 * fade;
        }
      }
      const center = [x, y, sector.gateZ];
      const pulse = 1 + Math.sin(this.worldTime * 3 + index) * 0.025;
      renderer.glow('torus', { position: center, scale: [GATE_RADIUS * pulse, GATE_RADIUS * pulse, 1.2], color, alpha, emissive: 1 }, glowStrength, 1.1);
      renderer.draw('torus', { position: center, scale: [GATE_RADIUS * pulse, GATE_RADIUS * pulse, 1.2], color, alpha, emissive: 1 });
      this.renderPattern(challenge.candidates[index].pattern, center, 1.75, alpha * 0.85, null, 0, !challenge.presentation.hideFrames && challenge.family === 'frame');
    });

    renderer.drawBar([-COURSE_WIDTH, COURSE_MIN_Y - 2, sector.commitZ], [COURSE_WIDTH, COURSE_MIN_Y - 2, sector.commitZ], 0.14, '#ffd166', {
      alpha: sector.committed ? 0.1 : 0.26,
      emissive: 1,
    });
  }

  renderPattern(pattern, center, scale, alpha, targetPattern = null, t = 0, showFrame = false) {
    const renderer = this.renderer;
    const sourcePoints = [...pattern.points].sort((a, b) => a.id - b.id);
    const targetPoints = targetPattern ? [...targetPattern.points].sort((a, b) => a.id - b.id) : sourcePoints;
    const worldPoints = sourcePoints.map((source, index) => {
      const target = targetPoints[index] || source;
      const local = V3.lerp(source.position, target.position, t);
      const framed = mat3Vector(pattern.frame, local);
      return [center[0] + framed[0] * scale, center[1] + framed[1] * scale, center[2] + framed[2] * scale];
    });

    for (let index = 0; index < worldPoints.length - 1; index += 1) {
      renderer.drawBar(worldPoints[index], worldPoints[index + 1], 0.095 * scale, '#8fdfff', { alpha: alpha * 0.34, emissive: 0.85 });
    }
    if (worldPoints.length > 3) renderer.drawBar(worldPoints[0], worldPoints.at(-1), 0.075 * scale, '#9b7cff', { alpha: alpha * 0.24, emissive: 0.8 });

    sourcePoints.forEach((source, index) => {
      const target = targetPoints[index] || source;
      const colorIndex = t < 0.52 ? source.color : target.color;
      const shapeIndex = t < 0.52 ? source.shape : target.shape;
      const mesh = shapeIndex === 0 ? 'octa' : shapeIndex === 1 ? 'tetra' : 'cube';
      const pointScale = scale * (0.36 + Math.sin(this.worldTime * 2.2 + source.pulse * 6.28) * 0.025);
      const options = {
        position: worldPoints[index],
        rotation: [this.worldTime * 0.18 + index, this.worldTime * 0.11 + source.pulse, 0],
        scale: [pointScale, pointScale, pointScale],
        color: PALETTE[colorIndex % PALETTE.length],
        alpha,
        emissive: 1,
      };
      renderer.glow(mesh, options, 0.22, 1.55);
      renderer.draw(mesh, options);
    });

    if (showFrame) this.renderFrameGlyph(pattern.frame, center, scale * 2.8, alpha * 0.52);
  }

  renderFrameGlyph(frame, center, scale, alpha) {
    const axes = [
      { vector: mat3Vector(frame, [1, 0, 0]), color: '#55f7ff', length: 1 },
      { vector: mat3Vector(frame, [0, 1, 0]), color: '#ffd166', length: 0.82 },
      { vector: mat3Vector(frame, [0, 0, 1]), color: '#ff4fd8', length: 0.64 },
    ];
    for (const axis of axes) {
      const end = V3.add(center, V3.scale(axis.vector, scale * axis.length));
      this.renderer.drawBar(center, end, 0.075 * scale, axis.color, { alpha, emissive: 1 });
    }
  }

  renderObstacle(obstacle) {
    const renderer = this.renderer;
    const position = this.obstaclePosition(obstacle);
    if (obstacle.type === 'orb') {
      renderer.glow('octa', { position, rotation: [this.worldTime, this.worldTime * 0.7, 0], scale: [obstacle.radius, obstacle.radius, obstacle.radius], color: '#ff557c', alpha: 0.68, emissive: 1 }, 0.24, 1.35);
      renderer.draw('octa', { position, rotation: [this.worldTime, this.worldTime * 0.7, 0], scale: [obstacle.radius, obstacle.radius, obstacle.radius], color: '#ff557c', alpha: 0.68, emissive: 0.9 });
    } else {
      renderer.glow('cube', { position, rotation: [0, 0, Math.sin(this.worldTime * obstacle.speed + obstacle.phase) * 0.2], scale: [19, 1.1, 1.1], color: '#ff4fd8', alpha: 0.55, emissive: 1 }, 0.18, 1.18);
      renderer.draw('cube', { position, rotation: [0, 0, Math.sin(this.worldTime * obstacle.speed + obstacle.phase) * 0.2], scale: [19, 1.1, 1.1], color: '#ff4fd8', alpha: 0.62, emissive: 1 });
    }
  }

  renderBoost(boost) {
    const pulse = 1 + Math.sin(this.worldTime * 4 + boost.phase) * 0.07;
    this.renderer.glow('torus', { position: [boost.x, boost.y, boost.z], scale: [9 * pulse, 9 * pulse, 1.3], color: '#75ff9b', alpha: 0.7, emissive: 1 }, 0.24, 1.18);
    this.renderer.draw('torus', { position: [boost.x, boost.y, boost.z], scale: [9 * pulse, 9 * pulse, 1.3], color: '#75ff9b', alpha: 0.72, emissive: 1 });
  }

  renderFinishGate(z) {
    const pulse = 1 + Math.sin(this.worldTime * 3) * 0.025;
    this.renderer.glow('torus', { position: [0, 3, z], scale: [48 * pulse, 42 * pulse, 2], color: '#ffd166', alpha: 0.75, emissive: 1 }, 0.23, 1.1);
    this.renderer.draw('torus', { position: [0, 3, z], scale: [48 * pulse, 42 * pulse, 2], color: '#ffd166', alpha: 0.74, emissive: 1 });
    for (let i = -4; i <= 4; i += 1) {
      const color = i % 2 ? '#f6fbff' : '#11172b';
      this.renderer.draw('cube', { position: [i * 8, -35, z], scale: [4, 1.2, 1], color, alpha: 0.9, emissive: i % 2 ? 0.8 : 0.1 });
    }
  }

  renderAiRacers() {
    const playerZ = this.race.player.z;
    for (const ai of this.race.racers) {
      if (ai.z < playerZ - 90 || ai.z > playerZ + 540) continue;
      this.renderer.glow('jet', {
        position: [ai.x, ai.y, ai.z],
        rotation: [-ai.vy * 0.008, 0, ai.roll],
        scale: [0.82, 0.82, 0.82],
        color: ai.color,
        alpha: 0.75,
        emissive: 0.7,
      }, 0.16, 1.15);
      this.renderer.draw('jet', {
        position: [ai.x, ai.y, ai.z],
        rotation: [-ai.vy * 0.008, 0, ai.roll],
        scale: [0.82, 0.82, 0.82],
        color: ai.color,
        alpha: 0.86,
        emissive: 0.46,
      });
      this.renderer.glow('cone', {
        position: [ai.x, ai.y, ai.z - 3.2],
        rotation: [0, Math.PI, 0],
        scale: [0.38, 0.38, 1.8],
        color: '#55f7ff',
        alpha: 0.55,
        emissive: 1,
      }, 0.2, 1.3);
    }
  }

  renderPlayerJet(player, speedRatio) {
    const color = player.flash > 0 ? '#ff557c' : '#e5f8ff';
    this.renderer.glow('jet', {
      position: [player.x, player.y, player.z],
      rotation: [player.pitch, 0, player.roll],
      scale: [1.05, 1.05, 1.05],
      color: '#55f7ff',
      alpha: 0.5,
      emissive: 1,
    }, 0.18, 1.17);
    this.renderer.draw('jet', {
      position: [player.x, player.y, player.z],
      rotation: [player.pitch, 0, player.roll],
      scale: [1.05, 1.05, 1.05],
      color,
      alpha: 1,
      emissive: 0.33,
    });
    const exhaustLength = 1.7 + speedRatio * 2.2 + (player.lastBoost ? 2.8 : 0);
    this.renderer.glow('cone', {
      position: [player.x, player.y, player.z - 4.1],
      rotation: [0, Math.PI, 0],
      scale: [0.48 + speedRatio * 0.16, 0.48 + speedRatio * 0.16, exhaustLength],
      color: player.lastBoost ? '#ff4fd8' : '#55f7ff',
      alpha: 0.82,
      emissive: 1,
    }, 0.26, 1.42);
    if (player.collisionCooldown > 0) {
      this.renderer.glow('torus', {
        position: [player.x, player.y, player.z],
        rotation: [Math.PI / 2, 0, 0],
        scale: [5.8, 5.8, 0.8],
        color: '#75ff9b',
        alpha: 0.42,
        emissive: 1,
      }, 0.22, 1.2);
    }
  }

  renderSpeedLines(player, speedRatio) {
    if (speedRatio < 0.45) return;
    const renderer = this.renderer;
    const count = Math.floor(8 + speedRatio * 13);
    for (let i = 0; i < count; i += 1) {
      const phase = (this.worldTime * (1.5 + speedRatio * 2.4) + i * 0.173) % 1;
      const angle = seededUnit(`line-angle:${i}`) * Math.PI * 2;
      const radius = 14 + seededUnit(`line-radius:${i}`) * 58;
      const x = player.x + Math.cos(angle) * radius;
      const y = player.y + Math.sin(angle) * radius * 0.68;
      const z = player.z + 18 + phase * 105;
      const length = 3 + speedRatio * 10;
      renderer.drawBar([x, y, z], [x, y, z + length], 0.05, i % 3 === 0 ? '#9b7cff' : '#55f7ff', {
        alpha: clamp((speedRatio - 0.35) * 0.45, 0.08, 0.28),
        emissive: 1,
        additive: true,
        depthWrite: false,
      });
    }
  }
}

try {
  window.impulseRun = new ImpulseRun();
} catch (error) {
  console.error(error);
  const fatal = $('#fatalError');
  fatal.textContent = `Impulse Run could not initialise WebGL: ${error.message}`;
  fatal.classList.remove('hidden');
}
