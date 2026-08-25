import { Renderer } from './renderer-v4.js';
import { FighterAudio } from './fighter-audio.js';
import {
  clamp,
  lerp,
  smoothstep,
  V2,
  V3,
  Q,
  PRNG,
} from './math3d.js';
import { FighterFlightModel } from './fighter-flight.js';
import { FighterInput } from './fighter-input.js';
import { Course3D } from './course3d.js';
import {
  RELATION_FAMILIES,
  generateEpisodeSchedule,
  resolveEpisode,
  scoreTrajectoryHypotheses,
  motorExecutionScore,
  relationFieldStrength,
  diagnosticField,
  temporalFieldOpen,
  vortexPoint,
  structuralComplexity,
} from './relational-racing.js';
import {
  renderFighter,
  fighterAttachmentWorld,
} from './fighter-visuals.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const HISTORY_KEY = 'dream-unity-apex-relational-history-v4';
const RECORD_KEY = 'dream-unity-apex-relational-records-v4';
const SETTINGS_KEY = 'dream-unity-apex-relational-settings-v4';
const WORLD_UP = [0, 1, 0];

const AI_COLORS = ['#ff4fd8', '#ffd166', '#75ff9b', '#9b7cff', '#ff7849'];
const AI_AIRFRAMES = ['spectre', 'kestrel', 'apex', 'spectre', 'kestrel'];

const MODE_CONFIG = Object.freeze({
  'grand-prix': {
    label: 'RELATIONAL GRAND PRIX',
    button: 'LAUNCH GRAND PRIX',
    playerSpeed: 292,
    aiSpeed: 286,
    eventCount: 9,
    evidence: 0.76,
    demonstrations: 2,
    explicitFamily: false,
    feedback: true,
  },
  training: {
    label: 'RELATIONAL FLIGHT SCHOOL',
    button: 'BEGIN FLIGHT SCHOOL',
    playerSpeed: 246,
    aiSpeed: 238,
    eventCount: 8,
    evidence: 1,
    demonstrations: 8,
    explicitFamily: true,
    feedback: true,
  },
  assessment: {
    label: 'BLIND ASSESSMENT RUN',
    button: 'BEGIN ASSESSMENT',
    playerSpeed: 278,
    aiSpeed: 276,
    eventCount: 9,
    evidence: 0.58,
    demonstrations: 0,
    explicitFamily: false,
    feedback: false,
  },
  transfer: {
    label: 'HELD-OUT TRANSFER CIRCUIT',
    button: 'LAUNCH TRANSFER',
    playerSpeed: 308,
    aiSpeed: 300,
    eventCount: 9,
    evidence: 0.46,
    demonstrations: 0,
    explicitFamily: false,
    feedback: false,
  },
});

const FAMILY_NAMES = Object.freeze({
  'vortex-convergence': 'PREDICTIVE VORTEX CONVERGENCE',
  'formation-mirror': 'LEADER-AXIS FORMATION',
  'rotating-frame': 'ROTATING REFERENCE FRAME',
  'temporal-relay': 'TEMPORAL RELAY WINDOW',
  'energy-intercept': 'RELATIVE ENERGY INTERCEPT',
  'race-role': 'LIVE COMPETITIVE ROLE',
  'vortex-frame-compose': 'VORTEX × MOVING FRAME',
  'formation-temporal-compose': 'FORMATION × TEMPORAL WINDOW',
});

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds || 0);
  const minutes = Math.floor(safe / 60);
  const remaining = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(1).padStart(4, '0')}`;
}

function formatSpeed(speed) {
  return Math.round(speed * 3.6).toLocaleString();
}

function colorWithAlpha(color, alpha) {
  const value = color.replace('#', '');
  const numeric = Number.parseInt(value, 16);
  return [
    ((numeric >> 16) & 255) / 255,
    ((numeric >> 8) & 255) / 255,
    (numeric & 255) / 255,
    alpha,
  ];
}

function curveState(course, distance) {
  const before = course.frameAt(Math.max(0, distance - 24));
  const current = course.frameAt(distance);
  const after = course.frameAt(Math.min(course.length, distance + 24));
  const turn = V3.cross(before.forward, after.forward);
  const turnSign = Math.sign(V3.dot(turn, current.up) || 1);
  const curvature = V3.angle(before.forward, after.forward) / 48;
  return { turnSign, curvature, frame: current };
}

function rankEntities(playerDistance, racers) {
  const entities = [{ id: 'player', distance: playerDistance }, ...racers];
  entities.sort((a, b) => b.distance - a.distance);
  const ranks = new Map(entities.map((entity, index) => [entity.id, index + 1]));
  return ranks;
}

function vectorToWorld(course, distance, offset) {
  return course.offsetToWorld(distance, offset[0], offset[1]);
}

function worldVectorFromOffset(frame, offsetVector) {
  return V3.add(V3.scale(frame.right, offsetVector[0]), V3.scale(frame.up, offsetVector[1]));
}

function courseGateRotation(course, distance, roll = 0) {
  const frame = course.frameAt(distance);
  return Q.toEulerXYZ(Q.multiply(frame.orientation, Q.fromAxisAngle([0, 0, 1], roll)));
}

function aiErrorSusceptibility(errorType, profile) {
  if (!errorType) return 0;
  if (/current|prediction|single-source|reversed-prediction|no-lateral-lead/.test(errorType)) return 1 - profile.prediction;
  if (/frame|axis|absolute-position/.test(errorType)) return 1 - profile.frame;
  if (/temporal|premature|late-timing|order/.test(errorType)) return 1 - profile.temporal;
  if (/role|reference-object|reference-pair|obsolete/.test(errorType)) return 1 - profile.roleUpdating;
  if (/composition|single-relation|spatial-relation-omission|incomplete/.test(errorType)) return 1 - profile.composition;
  if (/inversion|same-side|surface|collapse/.test(errorType)) {
    return 1 - average([profile.prediction, profile.frame, profile.roleUpdating]);
  }
  return 1 - average([profile.prediction, profile.frame, profile.temporal, profile.roleUpdating, profile.composition]);
}

function weightedModelPick(rng, paths, weights) {
  const total = weights.reduce((sum, weight) => sum + Math.max(0.0001, weight), 0);
  let cursor = rng.next() * total;
  for (let index = 0; index < paths.length; index += 1) {
    cursor -= Math.max(0.0001, weights[index]);
    if (cursor <= 0) return paths[index];
  }
  return paths.at(-1);
}

class ApexRelationalRacing {
  constructor() {
    this.canvas = $('#gameCanvas');
    this.renderer = new Renderer(this.canvas);
    this.audio = new FighterAudio();
    this.input = new FighterInput({
      canvas: this.canvas,
      flightStick: $('#flightStick'),
      flightKnob: $('#flightKnob'),
      systemsStick: $('#systemsStick'),
      systemsKnob: $('#systemsKnob'),
      afterburnerButton: $('#afterburnerButton'),
      airbrakeButton: $('#airbrakeButton'),
      pauseButton: $('#pauseButton'),
    });
    this.ui = this.captureUi();
    this.mode = 'grand-prix';
    this.state = 'menu';
    this.previousState = 'menu';
    this.race = null;
    this.worldTime = 0;
    this.lastTimestamp = performance.now();
    this.countdownRemaining = 0;
    this.cameraMode = 0;
    this.feedbackTimer = 0;
    this.settings = safeParse(localStorage.getItem(SETTINGS_KEY), {
      sound: true,
      reducedMotion: false,
      cameraRoll: true,
    });
    this.audio.setEnabled(this.settings.sound !== false);
    document.body.classList.toggle('reduced-motion', Boolean(this.settings.reducedMotion));
    this.bindUi();
    this.updateModeSelection();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  captureUi() {
    return {
      menu: $('#menu'),
      hud: $('#hud'),
      pauseOverlay: $('#pauseOverlay'),
      resultsOverlay: $('#resultsOverlay'),
      fatalError: $('#fatalError'),
      touchControls: $('#touchControls'),
      pauseButton: $('#pauseButton'),
      launchButton: $('#launchButton'),
      soundButton: $('#soundButton'),
      motionButton: $('#motionButton'),
      resumeButton: $('#resumeButton'),
      restartButton: $('#restartButton'),
      menuButton: $('#menuButton'),
      resultsMenuButton: $('#resultsMenuButton'),
      runAgainButton: $('#runAgainButton'),
      exportButton: $('#exportButton'),
      modeLabel: $('#modeLabel'),
      positionValue: $('#positionValue'),
      timeValue: $('#timeValue'),
      sectorValue: $('#sectorValue'),
      speedValue: $('#speedValue'),
      altitudeValue: $('#altitudeValue'),
      machValue: $('#machValue'),
      gValue: $('#gValue'),
      relationValue: $('#relationValue'),
      pilotValue: $('#pilotValue'),
      driveFill: $('#driveFill'),
      afterburnerFill: $('#afterburnerFill'),
      shieldFill: $('#shieldFill'),
      relationSignal: $('#relationSignal'),
      relationPhase: $('#relationPhase'),
      feedback: $('#feedback'),
      countdown: $('#countdown'),
      resultTitle: $('#resultTitle'),
      resultRelation: $('#resultRelation'),
      resultPilot: $('#resultPilot'),
      resultTransfer: $('#resultTransfer'),
      resultPosition: $('#resultPosition'),
      resultLatency: $('#resultLatency'),
      resultConfidence: $('#resultConfidence'),
      resultDrive: $('#resultDrive'),
      resultMotorBaseline: $('#resultMotorBaseline'),
      resultErrors: $('#resultErrors'),
      resultTime: $('#resultTime'),
      familyBreakdown: $('#familyBreakdown'),
    };
  }

  bindUi() {
    $$('.mode-card').forEach((button) => button.addEventListener('click', () => {
      this.mode = button.dataset.mode;
      this.updateModeSelection();
    }));
    this.ui.launchButton.addEventListener('click', () => this.startRace(this.mode));
    this.ui.resumeButton.addEventListener('click', () => this.resume());
    this.ui.restartButton.addEventListener('click', () => this.startRace(this.mode));
    this.ui.menuButton.addEventListener('click', () => this.returnToMenu());
    this.ui.resultsMenuButton.addEventListener('click', () => this.returnToMenu());
    this.ui.runAgainButton.addEventListener('click', () => this.startRace(this.mode));
    this.ui.exportButton.addEventListener('click', () => this.exportTelemetry());
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
      this.ui.motionButton.classList.toggle('off', this.settings.reducedMotion);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && ['racing', 'countdown'].includes(this.state)) this.pause();
    });
  }

  updateModeSelection() {
    $$('.mode-card').forEach((button) => button.classList.toggle('selected', button.dataset.mode === this.mode));
    this.ui.launchButton.textContent = MODE_CONFIG[this.mode].button;
  }

  loadHistory() {
    const history = safeParse(localStorage.getItem(HISTORY_KEY), []);
    return Array.isArray(history) ? history.slice(-300) : [];
  }

  startRace(mode) {
    this.mode = mode;
    const config = MODE_CONFIG[mode];
    const seedParam = new URLSearchParams(window.location.search).get('seed');
    const seed = seedParam || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const course = new Course3D(`${seed}:course`, { width: 115, height: 84 });
    const startFrame = course.frameAt(0);
    const flight = new FighterFlightModel({
      initialState: {
        position: course.offsetToWorld(0, 0, 0),
        forward: startFrame.forward,
        up: startFrame.up,
        speed: config.playerSpeed,
        throttle: 0.79,
      },
    });
    flight.state.orientation = startFrame.orientation;
    flight.state.velocity = V3.scale(startFrame.forward, config.playerSpeed);

    const episodes = generateEpisodeSchedule({
      seed,
      mode,
      courseLength: course.length,
      count: config.eventCount,
      history: this.loadHistory(),
    });
    const racers = this.createAiRacers(seed, config, course);
    this.race = {
      seed,
      config,
      course,
      flight,
      playerProgress: 0,
      playerOffset: { lateral: 0, vertical: 0, crossTrackDistance: 0 },
      racers,
      episodes,
      episodeRuntime: null,
      episodeIndex: -1,
      records: [],
      reasoningDrive: 0,
      reasoningStreak: 0,
      calibration: { samples: [], motorSigma: 8, complete: false },
      startWallTime: Date.now(),
      gameTime: 0,
      finalRank: null,
      finished: false,
      collisions: 0,
      currentLeaderId: racers[0]?.id || null,
      previousLeaderId: racers[1]?.id || racers[0]?.id || null,
      trails: new Map(),
      playerTrail: [],
      lastTrailAt: 0,
      checkpointDistances: course.checkpointDistances(16),
      checkpointCount: 16,
      nextCheckpoint: 0,
      lastCheckpoint: -1,
      rawProgress: 0,
      validatedProgress: 0,
      checkpointMiss: null,
    };
    this.state = 'countdown';
    this.countdownRemaining = 3.8;
    this.cameraMode = 0;
    this.ui.menu.classList.add('hidden');
    this.ui.pauseOverlay.classList.add('hidden');
    this.ui.resultsOverlay.classList.add('hidden');
    this.ui.hud.classList.remove('hidden');
    this.ui.touchControls.classList.remove('hidden');
    this.ui.pauseButton.classList.remove('hidden');
    this.ui.countdown.classList.remove('hidden');
    this.ui.modeLabel.textContent = config.label;
    this.ui.relationSignal.classList.add('hidden');
    this.ui.feedback.classList.add('hidden');
    this.audio.unlock().catch(() => {});
    this.updateHud();
  }

  createAiRacers(seed, config, course) {
    const rng = new PRNG(`${seed}:ai`);
    return Array.from({ length: 5 }, (_, index) => {
      const distance = 45 + index * 23 + rng.range(-18, 18);
      const lateral = (index - 2) * 17 + rng.range(-5, 5);
      const vertical = (index % 2 ? 8 : -5) + rng.range(-4, 4);
      const frame = course.frameAt(distance);
      const speed = config.aiSpeed * (0.94 + index * 0.014 + rng.range(0, 0.045));
      return {
        id: `ai-${index}`,
        index,
        color: AI_COLORS[index],
        airframe: AI_AIRFRAMES[index],
        distance,
        speed,
        baseSpeed: speed,
        lateral,
        vertical,
        lateralVelocity: 0,
        verticalVelocity: 0,
        targetLateral: lateral,
        targetVertical: vertical,
        roll: 0,
        energy: rng.range(0.35, 0.88),
        boostSignal: index === 0 ? 0.8 : rng.range(0, 0.35),
        reasoningDrive: rng.range(-0.08, 0.12),
        position: course.offsetToWorld(distance, lateral, vertical),
        orientation: frame.orientation,
        afterburnerActive: false,
        rank: index + 1,
        episodeChoice: null,
        profile: {
          prediction: rng.range(0.58, 0.96),
          frame: rng.range(0.52, 0.96),
          temporal: rng.range(0.5, 0.94),
          roleUpdating: rng.range(0.55, 0.98),
          composition: rng.range(0.42, 0.9),
          motor: rng.range(0.64, 0.96),
          latency: rng.range(0.55, 1.9),
          bias: rng.pick([
            'current-state-chasing',
            'wrong-reference-frame',
            'obsolete-role-perseveration',
            'temporal-order-reversal',
            'incomplete-composition',
          ]),
        },
      };
    });
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
    this.ui.menu.classList.remove('hidden');
    this.ui.hud.classList.add('hidden');
    this.ui.pauseOverlay.classList.add('hidden');
    this.ui.resultsOverlay.classList.add('hidden');
    this.ui.touchControls.classList.add('hidden');
    this.ui.pauseButton.classList.add('hidden');
    this.ui.countdown.classList.add('hidden');
    this.ui.relationSignal.classList.add('hidden');
    this.ui.feedback.classList.add('hidden');
    this.audio.update(0, false, false);
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
      if (input.camera) this.cameraMode = (this.cameraMode + 1) % 2;

      if (this.state === 'countdown') this.updateCountdown(dt, input);
      else if (this.state === 'racing') this.updateRace(dt, input);
      else if (this.state === 'paused' || this.state === 'results' || this.state === 'menu') this.audio.update(0, false, false);

      this.render();
      if (this.feedbackTimer > 0) {
        this.feedbackTimer -= dt;
        if (this.feedbackTimer <= 0) this.ui.feedback.classList.add('hidden');
      }
    } catch (error) {
      console.error(error);
      this.state = 'error';
      this.ui.fatalError.textContent = `Apex Relational Racing encountered an error: ${error.message}`;
      this.ui.fatalError.classList.remove('hidden');
    }
    requestAnimationFrame(this.loop);
  }

  updateCountdown(dt, input) {
    const race = this.race;
    if (!race) return;
    this.countdownRemaining -= dt;
    const display = Math.ceil(this.countdownRemaining - 0.45);
    this.ui.countdown.textContent = this.countdownRemaining > 0.55 ? (display > 0 ? String(display) : 'ARM') : 'FLY';
    race.flight.setInput({ ...input, afterburner: false, airbrake: true, throttleDelta: 0 });
    race.flight.update(dt);
    this.updateAi(dt, true);
    if (this.countdownRemaining <= 0) {
      this.state = 'racing';
      this.ui.countdown.classList.add('hidden');
    }
    this.updateHud();
  }

  updateRace(dt, input) {
    const race = this.race;
    if (!race || race.finished) return;
    race.gameTime += dt;
    this.updatePlayerProgress();
    this.updateAi(dt, false);
    this.updateEpisodeBeforeFlight(dt);

    const external = this.computeExternalAccelerations(dt);
    race.flight.setInput(input);
    race.flight.update(dt, external);
    this.handleGroundAndEnvelope(dt);
    this.updatePlayerProgress();
    this.updateEpisodeAfterFlight(dt);
    this.updateCalibration();
    this.handleAiCollisions();
    this.updateTrails();
    this.updateHud();

    const speedRatio = race.flight.state.speed / 520;
    this.audio.update(speedRatio, race.flight.state.afterburnerActive, true);
    if (race.nextCheckpoint >= race.checkpointDistances.length
      && race.playerProgress >= race.course.length - 70) this.finishRace();
  }

  updatePlayerProgress() {
    const race = this.race;
    const previousRaw = race.rawProgress ?? race.playerProgress;
    const nearest = race.course.nearestProgress(race.flight.state.position, previousRaw, 720);
    race.rawProgress = Math.max(previousRaw - 35, nearest.distance);
    race.playerProgress = race.rawProgress;
    race.playerOffset = nearest;

    const tryPassCheckpoint = (checkpointIndex) => {
      const checkpointDistance = race.checkpointDistances[checkpointIndex];
      const offset = race.course.worldToOffset(race.flight.state.position, checkpointDistance);
      const ellipse = (offset.lateral / (race.course.width * 0.82)) ** 2
        + (offset.vertical / (race.course.height * 0.82)) ** 2;
      const closeToPlane = Math.abs(offset.longitudinal) <= Math.max(42, race.flight.state.speed * 0.12);
      return ellipse <= 1 && closeToPlane;
    };

    while (race.nextCheckpoint < race.checkpointDistances.length) {
      const checkpointDistance = race.checkpointDistances[race.nextCheckpoint];
      const crossed = previousRaw < checkpointDistance && race.rawProgress >= checkpointDistance;
      const recovering = Boolean(race.checkpointMiss) && tryPassCheckpoint(race.nextCheckpoint);
      if (!crossed && !recovering) break;
      if (tryPassCheckpoint(race.nextCheckpoint)) {
        race.lastCheckpoint = race.nextCheckpoint;
        race.nextCheckpoint += 1;
        race.checkpointMiss = null;
        this.audio.cue('gate');
      } else if (!race.checkpointMiss) {
        race.checkpointMiss = {
          index: race.nextCheckpoint,
          distance: checkpointDistance,
          detectedAt: race.gameTime,
        };
        this.showFeedback('CHECKPOINT MISSED // REACQUIRE THE GATE', 'incorrect', 2.2);
        this.audio.cue('incorrect');
        break;
      } else {
        break;
      }
    }

    const nextDistance = race.checkpointDistances[race.nextCheckpoint];
    race.validatedProgress = Number.isFinite(nextDistance)
      ? Math.min(race.rawProgress, nextDistance - (race.checkpointMiss ? 1 : 0))
      : race.rawProgress;
  }

  updateAi(dt, prestart) {
    const race = this.race;
    const ranks = rankEntities(race.validatedProgress ?? race.playerProgress, race.racers);
    for (const racer of race.racers) racer.rank = ranks.get(racer.id) || 6;
    const ordered = [...race.racers].sort((a, b) => a.rank - b.rank);
    const currentLeader = ordered[0];
    if (currentLeader && currentLeader.id !== race.currentLeaderId) {
      race.previousLeaderId = race.currentLeaderId;
      race.currentLeaderId = currentLeader.id;
    }

    const runtime = race.episodeRuntime;
    for (const racer of race.racers) {
      racer.boostSignal = Math.max(0, racer.boostSignal - dt * 0.08);
      const phase = race.gameTime * (0.24 + racer.index * 0.018) + racer.index * 1.6;
      let targetLateral = Math.sin(phase) * (13 + racer.index * 2.4) + (racer.index - 2) * 7;
      let targetVertical = Math.cos(phase * 0.73) * (6 + racer.index) + (racer.index % 2 ? 6 : -4);

      if (runtime && race.playerProgress >= runtime.event.observeDistance - 80 && race.playerProgress <= runtime.event.endDistance + 120) {
        const family = runtime.event.family;
        if (family.includes('vortex')) {
          if (racer.index === 0) {
            targetLateral = -24 + Math.sin(race.gameTime * 0.8) * 6;
            targetVertical = 9 + Math.sin(race.gameTime * 0.45) * 4;
          } else if (racer.index === 1) {
            targetLateral = 24 - Math.sin(race.gameTime * 0.8) * 6;
            targetVertical = -5 + Math.cos(race.gameTime * 0.5) * 4;
          }
        }
        if (family.includes('formation')) {
          if (racer.index === 0) {
            targetLateral = Math.sin(race.gameTime * 0.35) * 7;
            targetVertical = Math.cos(race.gameTime * 0.31) * 5;
          } else if (racer.index === 1) {
            targetLateral = targetLateral * 0.2 + 29;
            targetVertical = 10;
          }
        }
        if (family === 'rotating-frame' || family === 'vortex-frame-compose') {
          if (racer.index === 0) {
            const angle = runtime.event.rotor.initialAngle + runtime.event.rotor.angularSpeed * race.gameTime;
            targetLateral = runtime.event.rotor.center[0] + Math.cos(angle) * runtime.event.rotor.radius * 0.62;
            targetVertical = runtime.event.rotor.center[1] + Math.sin(angle) * runtime.event.rotor.radius * 0.62;
          }
        }
        if (family === 'energy-intercept' && racer.index === 2) {
          racer.boostSignal = Math.max(racer.boostSignal, 0.92);
          racer.energy = 0.9;
          targetVertical = 24 + Math.sin(race.gameTime * 0.45) * 9;
        }

        if (runtime.committed && racer.episodeChoice && race.gameTime >= racer.episodeChoice.availableAt) {
          const path = runtime.resolved.paths.find((candidate) => candidate.id === racer.episodeChoice.id);
          if (path) {
            const u = clamp((racer.distance - runtime.event.observeDistance)
              / Math.max(1, runtime.event.fieldStartDistance - runtime.event.observeDistance), 0, 1);
            const expected = path.pointAt(u);
            targetLateral = expected[0] + Math.sin(phase * 1.8) * (1 - racer.profile.motor) * 9;
            targetVertical = expected[1] + Math.cos(phase * 1.45) * (1 - racer.profile.motor) * 7;
          }
        }
      }

      racer.targetLateral = clamp(targetLateral, -86, 86);
      racer.targetVertical = clamp(targetVertical, -54, 54);
      const response = 1.65 + racer.profile.motor * 1.9;
      racer.lateralVelocity += (racer.targetLateral - racer.lateral) * response * dt;
      racer.verticalVelocity += (racer.targetVertical - racer.vertical) * response * dt;
      racer.lateralVelocity *= Math.exp(-2.6 * dt);
      racer.verticalVelocity *= Math.exp(-2.6 * dt);
      racer.lateral += racer.lateralVelocity * dt;
      racer.vertical += racer.verticalVelocity * dt;

      const catchup = clamp((race.playerProgress - racer.distance) * 0.012, -18, 22);
      const driveBoost = racer.reasoningDrive * 32;
      let targetSpeed = racer.baseSpeed + catchup + driveBoost + Math.sin(phase * 0.4) * 3;
      if (prestart) targetSpeed = 0;
      racer.speed += (targetSpeed - racer.speed) * (1 - Math.exp(-1.25 * dt));
      if (!prestart) racer.distance = clamp(racer.distance + racer.speed * dt, 0, race.course.length + 160);
      racer.energy = clamp(racer.energy + dt * 0.015 - Math.max(0, driveBoost) * dt * 0.00035, 0, 1);
      racer.afterburnerActive = racer.boostSignal > 0.62 || racer.reasoningDrive > 0.32;

      const frame = race.course.frameAt(racer.distance);
      const localVelocity = V3.add(
        V3.scale(frame.right, racer.lateralVelocity / Math.max(90, racer.speed)),
        V3.scale(frame.up, racer.verticalVelocity / Math.max(90, racer.speed)),
      );
      const forward = V3.normalize(V3.add(frame.forward, localVelocity));
      const targetOrientation = Q.lookRotation(forward, frame.up);
      racer.roll = clamp(-racer.lateralVelocity * 0.018 - frame.bank, -1.05, 1.05);
      racer.orientation = Q.slerp(racer.orientation, Q.multiply(targetOrientation, Q.fromAxisAngle([0, 0, 1], racer.roll)), 1 - Math.exp(-3.5 * dt));
      racer.position = race.course.offsetToWorld(racer.distance, racer.lateral, racer.vertical);
    }
  }

  observationFor(event) {
    const race = this.race;
    const ranks = rankEntities(race.playerProgress, race.racers);
    const courseState = curveState(race.course, race.playerProgress);
    const previousLeader = race.racers.find((racer) => racer.id === race.previousLeaderId) || null;
    return {
      time: race.gameTime,
      player: {
        distance: race.playerProgress,
        speed: race.flight.state.speed,
        lateral: race.playerOffset.lateral,
        vertical: race.playerOffset.vertical,
        energy: race.flight.state.afterburnerEnergy,
      },
      actors: race.racers.map((racer) => ({
        id: racer.id,
        rank: ranks.get(racer.id) || racer.rank,
        distance: racer.distance,
        lateral: racer.lateral,
        vertical: racer.vertical,
        lateralVelocity: racer.lateralVelocity,
        verticalVelocity: racer.verticalVelocity,
        speed: racer.speed,
        roll: racer.roll,
        energy: racer.energy,
        boostSignal: racer.boostSignal,
        color: racer.color,
      })),
      previousLeader: previousLeader ? {
        id: previousLeader.id,
        rank: previousLeader.rank,
        distance: previousLeader.distance,
        lateral: previousLeader.lateral,
        vertical: previousLeader.vertical,
        lateralVelocity: previousLeader.lateralVelocity,
        verticalVelocity: previousLeader.verticalVelocity,
        speed: previousLeader.speed,
        roll: previousLeader.roll,
        energy: previousLeader.energy,
        boostSignal: previousLeader.boostSignal,
      } : null,
      course: {
        turnSign: courseState.turnSign,
        curvature: courseState.curvature,
      },
    };
  }

  eventAtDistance(distance) {
    return this.race.episodes.find((event) => distance >= event.observeDistance - 40 && distance <= event.endDistance + 80) || null;
  }

  ensureEpisodeRuntime(event) {
    const race = this.race;
    if (!event) {
      if (race.episodeRuntime && !race.episodeRuntime.finalized && race.playerProgress > race.episodeRuntime.event.endDistance) {
        this.finalizeEpisode(race.episodeRuntime);
      }
      race.episodeRuntime = null;
      race.episodeIndex = -1;
      this.ui.relationSignal.classList.add('hidden');
      return null;
    }
    if (race.episodeRuntime?.event.id === event.id) return race.episodeRuntime;
    if (race.episodeRuntime && !race.episodeRuntime.finalized) this.finalizeEpisode(race.episodeRuntime);
    const observation = this.observationFor(event);
    const startOffset = [race.playerOffset.lateral, race.playerOffset.vertical];
    const resolved = resolveEpisode(event, observation, startOffset);
    race.episodeRuntime = {
      event,
      startOffset,
      seenAt: race.gameTime,
      lastSampleAt: -Infinity,
      lastExecutionSampleAt: -Infinity,
      samples: [],
      executionSamples: [],
      resolved,
      committed: false,
      choice: null,
      correctModel: false,
      confidence: 0,
      fieldIntegral: 0,
      wrongIntegral: 0,
      fieldTime: 0,
      openTime: 0,
      finalized: false,
      demonstration: event.index < race.config.demonstrations,
      liveFitHistory: [],
      inferredAt: null,
      inferredModel: null,
      inferenceConfidence: 0,
    };
    race.episodeIndex = event.index;
    this.ui.relationSignal.classList.remove('hidden');
    return race.episodeRuntime;
  }

  updateEpisodeBeforeFlight(dt) {
    const race = this.race;
    const event = this.eventAtDistance(race.playerProgress);
    const runtime = this.ensureEpisodeRuntime(event);
    if (!runtime) return;
    const observation = this.observationFor(event);
    runtime.resolved = resolveEpisode(event, observation, runtime.startOffset);
    if (race.config.explicitFamily) this.ui.relationPhase.textContent = FAMILY_NAMES[event.family];
    else this.ui.relationPhase.textContent = race.playerProgress < event.commitDistance ? 'READ THE RACE' : 'TRAJECTORY LOCKED';

    if (!runtime.committed && race.playerProgress >= event.commitDistance) this.commitEpisode(runtime);
    if (runtime.committed && race.playerProgress >= event.fieldStartDistance && race.playerProgress <= event.fieldEndDistance) {
      const offset = [race.playerOffset.lateral, race.playerOffset.vertical];
      const fieldU = clamp((race.playerProgress - event.fieldStartDistance)
        / Math.max(1, event.fieldEndDistance - event.fieldStartDistance), 0, 1);
      const open = temporalFieldOpen(runtime.resolved, race.gameTime);
      const strength = relationFieldStrength(offset, runtime.resolved, 13.5, fieldU) * (open ? 1 : 0);
      const diagnostic = diagnosticField(offset, runtime.resolved, fieldU);
      const wrongStrength = diagnostic.errorType
        ? Math.exp(-(diagnostic.distance * diagnostic.distance) / (2 * 13.5 * 13.5))
        : 0;
      runtime.fieldIntegral += strength * dt;
      runtime.wrongIntegral += wrongStrength * dt;
      runtime.fieldTime += dt;
      if (open) runtime.openTime += dt;
      race.reasoningDrive = clamp(
        race.reasoningDrive + strength * dt * 0.12 - wrongStrength * dt * 0.085,
        -1,
        1,
      );
      race.flight.state.afterburnerEnergy = clamp(
        race.flight.state.afterburnerEnergy + strength * dt * 0.07 - wrongStrength * dt * 0.035,
        0,
        1,
      );
    }
  }

  updateEpisodeAfterFlight() {
    const race = this.race;
    const runtime = race.episodeRuntime;
    if (!runtime) return;
    const event = runtime.event;
    const observation = this.observationFor(event);
    runtime.resolved = resolveEpisode(event, observation, runtime.startOffset);
    const u = clamp((race.playerProgress - event.observeDistance)
      / Math.max(1, event.fieldStartDistance - event.observeDistance), 0, 1);
    const predictedArrivalTime = race.gameTime + Math.max(0, event.fieldStartDistance - race.playerProgress)
      / Math.max(80, race.flight.state.speed);
    const expectedById = Object.fromEntries(runtime.resolved.paths.map((path) => [path.id, path.pointAt(u)]));
    if (!runtime.committed && race.gameTime - runtime.lastSampleAt >= 1 / 18) {
      runtime.samples.push({
        time: race.gameTime,
        u,
        offset: [race.playerOffset.lateral, race.playerOffset.vertical],
        predictedArrivalTime,
        expectedById,
        weight: 0.75 + u * 0.75,
      });
      runtime.lastSampleAt = race.gameTime;

      if (runtime.samples.length >= 6) {
        const fit = scoreTrajectoryHypotheses(runtime.samples, runtime.resolved.paths, {
          motorSigma: race.calibration.motorSigma,
          timingSigma: this.mode === 'training' ? 1.15 : 0.78,
        });
        runtime.liveFitHistory.push({
          time: race.gameTime,
          id: fit.best?.id || null,
          confidence: fit.confidence,
        });
        if (runtime.liveFitHistory.length > 5) runtime.liveFitHistory.shift();
        const recent = runtime.liveFitHistory.slice(-3);
        const stable = recent.length === 3 && recent.every((item) => item.id && item.id === recent[0].id);
        const confidenceThreshold = this.mode === 'training' ? 0.16 : 0.24;
        if (runtime.inferredAt === null && stable && fit.confidence >= confidenceThreshold) {
          runtime.inferredAt = race.gameTime;
          runtime.inferredModel = fit.best.id;
          runtime.inferenceConfidence = fit.confidence;
        }
      }
    }
    // Execution is measured only after commitment and before the causal field reveals its consequence.
    // This prevents correct-world feedback from contaminating the motor estimate.
    if (runtime.committed && race.playerProgress <= event.fieldStartDistance && race.gameTime - runtime.lastExecutionSampleAt >= 1 / 18) {
      const executionU = clamp((race.playerProgress - event.observeDistance)
        / Math.max(1, event.fieldStartDistance - event.observeDistance), 0, 1);
      runtime.executionSamples.push({
        time: race.gameTime,
        u: executionU,
        offset: [race.playerOffset.lateral, race.playerOffset.vertical],
        predictedArrivalTime,
        expectedById: Object.fromEntries(runtime.resolved.paths.map((path) => [path.id, path.pointAt(executionU)])),
      });
      runtime.lastExecutionSampleAt = race.gameTime;
    }
    if (!runtime.finalized && race.playerProgress > event.endDistance) this.finalizeEpisode(runtime);
  }

  commitEpisode(runtime) {
    const race = this.race;
    if (runtime.committed) return;
    const result = scoreTrajectoryHypotheses(runtime.samples, runtime.resolved.paths, {
      motorSigma: race.calibration.motorSigma,
      timingSigma: this.mode === 'training' ? 1.15 : 0.78,
    });
    const chosen = runtime.resolved.paths.find((path) => path.id === result.best?.id)
      || runtime.resolved.paths[0];
    runtime.committed = true;
    runtime.choice = chosen;
    runtime.correctModel = chosen?.id === runtime.resolved.correctId;
    runtime.confidence = result.confidence;
    runtime.commitTime = race.gameTime;
    runtime.commitmentLatency = race.gameTime - runtime.seenAt;
    runtime.inferenceLatency = (runtime.inferredAt ?? race.gameTime) - runtime.seenAt;
    runtime.inferredModel ||= chosen?.id || null;
    runtime.inferenceConfidence = Math.max(runtime.inferenceConfidence || 0, result.confidence);
    runtime.hypothesisScores = result.scores;
    this.assignAiEpisodeChoices(runtime);
    if (race.config.feedback) this.audio.cue('gate');
  }

  assignAiEpisodeChoices(runtime) {
    const complexity = structuralComplexity(runtime.event);
    for (const racer of this.race.racers) {
      const profile = racer.profile;
      const family = runtime.event.family;
      const relevantSkill = family.includes('frame') || family === 'rotating-frame'
        ? profile.frame
        : family.includes('temporal') || family === 'temporal-relay'
          ? profile.temporal
          : family.includes('compose')
            ? profile.composition
            : family === 'race-role'
              ? profile.roleUpdating
              : profile.prediction;
      const rng = new PRNG(`${this.race.seed}:${runtime.event.id}:${racer.id}:cognitive-model`);
      const complexityPenalty = clamp((complexity - 2) * 0.07, 0, 0.42);
      const weights = runtime.resolved.paths.map((path) => {
        if (!path.errorType) {
          const integratedSkill = average([
            relevantSkill,
            profile.prediction,
            family.includes('frame') ? profile.frame : relevantSkill,
            family.includes('temporal') ? profile.temporal : relevantSkill,
            family.includes('compose') ? profile.composition : relevantSkill,
          ]);
          return 0.14 + Math.max(0.02, integratedSkill - complexityPenalty) ** 2 * 5.2;
        }
        let susceptibility = aiErrorSusceptibility(path.errorType, profile);
        if (path.errorType === profile.bias) susceptibility += 0.34;
        return 0.08 + susceptibility ** 1.35 * (1.2 + complexity * 0.13) * (path.weight || 1);
      });
      const choice = weightedModelPick(rng, runtime.resolved.paths, weights);
      racer.episodeChoice = {
        id: choice.id,
        correct: choice.id === runtime.resolved.correctId,
        errorType: choice.errorType,
        availableAt: this.race.gameTime + profile.latency * (0.72 + complexity * 0.08),
        modelWeights: runtime.resolved.paths.map((path, index) => ({ id: path.id, weight: Number(weights[index].toFixed(4)) })),
      };
      racer.reasoningDrive = clamp(racer.reasoningDrive + (racer.episodeChoice.correct ? 0.12 : -0.1), -0.8, 0.8);
      if (racer.episodeChoice.correct) racer.boostSignal = Math.max(racer.boostSignal, 0.82);
    }
  }

  computeExternalAccelerations() {
    const race = this.race;
    const state = race.flight.state;
    const axes = race.flight.axes();
    const accelerations = [];

    const offset = race.playerOffset;
    const lateralExcess = Math.max(0, Math.abs(offset.lateral) - race.course.width * 0.72);
    const verticalExcess = Math.max(0, Math.abs(offset.vertical) - race.course.height * 0.72);
    if (lateralExcess > 0 || verticalExcess > 0) {
      const frame = race.course.frameAt(race.playerProgress);
      accelerations.push(V3.add(
        V3.scale(frame.right, -Math.sign(offset.lateral) * lateralExcess * 0.16),
        V3.scale(frame.up, -Math.sign(offset.vertical) * verticalExcess * 0.16),
      ));
    }

    if (race.reasoningDrive !== 0) accelerations.push(V3.scale(axes.forward, race.reasoningDrive * 7.5));

    if (race.checkpointMiss) {
      const checkpointFrame = race.course.frameAt(race.checkpointMiss.distance);
      const toGate = V3.sub(checkpointFrame.position, state.position);
      const distance = V3.length(toGate);
      if (distance > 1) {
        accelerations.push(V3.scale(V3.normalize(toGate), clamp(distance * 0.055, 7, 24)));
        accelerations.push(V3.scale(axes.forward, -clamp((distance - 50) * 0.025, 0, 8)));
      }
    }

    const runtime = race.episodeRuntime;
    if (runtime?.committed
      && race.playerProgress >= runtime.event.fieldStartDistance
      && race.playerProgress <= runtime.event.fieldEndDistance) {
      const currentOffset = [offset.lateral, offset.vertical];
      const fieldU = clamp((race.playerProgress - runtime.event.fieldStartDistance)
        / Math.max(1, runtime.event.fieldEndDistance - runtime.event.fieldStartDistance), 0, 1);
      const open = temporalFieldOpen(runtime.resolved, race.gameTime);
      const positive = relationFieldStrength(currentOffset, runtime.resolved, 13.5, fieldU) * (open ? 1 : 0);
      const diagnostic = diagnosticField(currentOffset, runtime.resolved, fieldU);
      const wrong = diagnostic.errorType
        ? Math.exp(-(diagnostic.distance * diagnostic.distance) / (2 * 13.5 * 13.5))
        : 0;
      accelerations.push(V3.scale(axes.forward, positive * 31 - wrong * 17));
      const frame = race.course.frameAt(race.playerProgress);
      const pathTarget = runtime.resolved.correctPath?.pointAt(fieldU) || runtime.resolved.correctTarget;
      const deltaOffset = V2.sub(pathTarget, currentOffset);
      const guide = worldVectorFromOffset(frame, V2.scale(deltaOffset, 0.035 * positive));
      accelerations.push(guide);

      if (runtime.event.family === 'rotating-frame' || runtime.event.family === 'vortex-frame-compose') {
        const angle = runtime.event.rotor.initialAngle + runtime.event.rotor.angularSpeed * race.gameTime;
        const swirl = [Math.cos(angle), Math.sin(angle)];
        accelerations.push(worldVectorFromOffset(frame, V2.scale(swirl, 5.8)));
      }
    }

    if (state.position[1] < 52) accelerations.push([0, (52 - state.position[1]) * 0.58, 0]);
    return accelerations;
  }

  handleGroundAndEnvelope() {
    const race = this.race;
    const state = race.flight.state;
    if (state.position[1] < 18) {
      state.position[1] = 18;
      if (state.velocity[1] < 0) state.velocity[1] *= -0.22;
      state.velocity = V3.scale(state.velocity, 0.72);
      state.shield = Math.max(0, state.shield - 0.18);
      race.collisions += 1;
      this.audio.cue('collision');
    }
    if (race.playerOffset.crossTrackDistance > 235) {
      const frame = race.course.frameAt(race.playerProgress);
      const toCourse = V3.sub(frame.position, state.position);
      state.velocity = V3.add(state.velocity, V3.scale(V3.normalize(toCourse), 12));
    }
    state.shield = Math.min(1, state.shield + 0.006);
  }

  handleAiCollisions() {
    const race = this.race;
    const player = race.flight.state;
    for (const racer of race.racers) {
      if (V3.distance(player.position, racer.position) > 7.5) continue;
      const away = V3.normalize(V3.sub(player.position, racer.position));
      race.flight.applyImpulse(V3.scale(away, 18));
      player.velocity = V3.scale(player.velocity, 0.86);
      player.shield = Math.max(0, player.shield - 0.08);
      racer.speed *= 0.92;
      race.collisions += 1;
      this.audio.cue('collision');
      break;
    }
  }

  updateCalibration() {
    const race = this.race;
    const calibration = race.calibration;
    if (calibration.complete) return;
    if (race.playerProgress < 620) {
      calibration.samples.push(race.playerOffset.crossTrackDistance);
      if (calibration.samples.length > 420) calibration.samples.shift();
    } else {
      const trimmed = [...calibration.samples].sort((a, b) => a - b).slice(0, Math.max(1, Math.floor(calibration.samples.length * 0.9)));
      calibration.motorSigma = clamp(Math.sqrt(average(trimmed.map((value) => value * value))) * 0.5 + 4.5, 5, 17);
      calibration.complete = true;
    }
  }

  updateTrails() {
    const race = this.race;
    if (race.gameTime - race.lastTrailAt < 0.09) return;
    race.lastTrailAt = race.gameTime;
    race.playerTrail.push([...race.flight.state.position]);
    if (race.playerTrail.length > 22) race.playerTrail.shift();
    for (const racer of race.racers) {
      if (!race.trails.has(racer.id)) race.trails.set(racer.id, []);
      const trail = race.trails.get(racer.id);
      trail.push([...racer.position]);
      if (trail.length > 18) trail.shift();
    }
  }

  finalizeEpisode(runtime) {
    if (runtime.finalized) return;
    runtime.finalized = true;
    const race = this.race;
    const chosen = runtime.resolved.paths.find((path) => path.id === runtime.choice?.id) || runtime.choice;
    const motor = motorExecutionScore(runtime.executionSamples, chosen, race.calibration.motorSigma);
    const fieldMean = runtime.fieldTime > 0 ? runtime.fieldIntegral / runtime.fieldTime : 0;
    const wrongMean = runtime.fieldTime > 0 ? runtime.wrongIntegral / runtime.fieldTime : 0;
    const physicalSuccess = fieldMean > Math.max(0.22, wrongMean * 1.05);
    race.reasoningStreak = physicalSuccess ? race.reasoningStreak + 1 : 0;
    if (physicalSuccess) {
      race.reasoningDrive = clamp(race.reasoningDrive + 0.08 + Math.min(0.12, race.reasoningStreak * 0.018), -1, 1);
      if (race.config.feedback) this.audio.cue('correct');
    } else {
      race.reasoningDrive = clamp(race.reasoningDrive - 0.07, -1, 1);
      if (race.config.feedback) this.audio.cue('incorrect');
    }
    race.records.push({
      eventId: runtime.event.id,
      family: runtime.event.family,
      difficulty: runtime.event.difficulty,
      complexity: structuralComplexity(runtime.event),
      signature: runtime.event.signature,
      heldOutComposition: runtime.event.heldOutComposition,
      chosenModel: runtime.choice?.id || null,
      correctModel: runtime.correctModel,
      errorType: runtime.choice?.errorType || null,
      confidence: runtime.confidence,
      inferenceLatency: runtime.inferenceLatency || 0,
      commitmentLatency: runtime.commitmentLatency || 0,
      inferredModelBeforeCommit: runtime.inferredModel,
      inferenceConfidence: runtime.inferenceConfidence,
      motorScore: motor,
      fieldMean,
      wrongFieldMean: wrongMean,
      physicalSuccess,
      reasoningDriveAfter: race.reasoningDrive,
      speedAtOutcome: race.flight.state.speed,
      temporalOpenFraction: runtime.fieldTime > 0 ? runtime.openTime / runtime.fieldTime : 0,
      hypothesisScores: runtime.hypothesisScores || [],
    });
    const history = [...this.loadHistory(), runtime.event.signature].slice(-300);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  showFeedback(message, type = 'neutral', duration = 1.4) {
    this.ui.feedback.textContent = message;
    this.ui.feedback.className = `feedback ${type}`;
    this.feedbackTimer = duration;
  }

  raceRank() {
    const race = this.race;
    const playerRaceDistance = race.validatedProgress ?? race.playerProgress;
    return 1 + race.racers.filter((racer) => racer.distance > playerRaceDistance).length;
  }

  updateHud() {
    const race = this.race;
    if (!race) return;
    const records = race.records;
    const relation = records.length ? records.filter((record) => record.correctModel).length / records.length : null;
    const pilot = records.length ? average(records.map((record) => record.motorScore)) : null;
    const state = race.flight.state;
    this.ui.positionValue.textContent = `${this.raceRank()} / 6`;
    this.ui.timeValue.textContent = formatTime(race.gameTime);
    this.ui.sectorValue.textContent = `${Math.min(race.checkpointCount, race.nextCheckpoint + 1)} / ${race.checkpointCount}`;
    this.ui.speedValue.textContent = formatSpeed(state.speed);
    this.ui.altitudeValue.textContent = `${Math.round(state.altitude)} m`;
    this.ui.machValue.textContent = state.mach.toFixed(2);
    this.ui.gValue.textContent = `${state.gLoad.toFixed(1)} g`;
    const withholdLiveScores = !race.config.feedback;
    this.ui.relationValue.textContent = withholdLiveScores || relation === null ? '—' : `${Math.round(relation * 100)}%`;
    this.ui.pilotValue.textContent = withholdLiveScores || pilot === null ? '—' : `${Math.round(pilot * 100)}%`;
    this.ui.driveFill.style.transform = `scaleX(${(race.reasoningDrive + 1) * 0.5})`;
    this.ui.afterburnerFill.style.transform = `scaleX(${state.afterburnerEnergy})`;
    this.ui.shieldFill.style.transform = `scaleX(${state.shield})`;
  }

  finishRace() {
    const race = this.race;
    if (race.episodeRuntime && !race.episodeRuntime.finalized) this.finalizeEpisode(race.episodeRuntime);
    race.finished = true;
    race.finalRank = this.raceRank();
    this.state = 'results';
    this.ui.resultsOverlay.classList.remove('hidden');
    this.ui.touchControls.classList.add('hidden');
    this.ui.pauseButton.classList.add('hidden');
    this.ui.relationSignal.classList.add('hidden');
    this.audio.cue('finish');
    const result = this.computeResults();
    this.renderResults(result);
    const records = safeParse(localStorage.getItem(RECORD_KEY), []);
    records.push({
      date: new Date().toISOString(),
      mode: this.mode,
      seed: race.seed,
      relation: result.relation,
      pilot: result.pilot,
      transfer: result.transfer,
      rank: result.rank,
      time: result.time,
    });
    localStorage.setItem(RECORD_KEY, JSON.stringify(records.slice(-80)));
  }

  computeResults() {
    const race = this.race;
    const records = race.records;
    const relation = records.length ? records.filter((record) => record.correctModel).length / records.length : 0;
    const pilot = records.length ? average(records.map((record) => record.motorScore)) : 0;
    const transferRecords = records.filter((record) => record.heldOutComposition || record.complexity >= 6);
    const transfer = transferRecords.length
      ? transferRecords.filter((record) => record.correctModel).length / transferRecords.length
      : relation;
    const confidence = records.length ? average(records.map((record) => record.confidence)) : 0;
    const errorCounts = new Map();
    for (const record of records.filter((item) => item.errorType)) {
      errorCounts.set(record.errorType, (errorCounts.get(record.errorType) || 0) + 1);
    }
    const topError = [...errorCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'no dominant error';
    const family = {};
    for (const record of records) {
      family[record.family] ||= { correct: 0, total: 0, motor: [] };
      family[record.family].total += 1;
      if (record.correctModel) family[record.family].correct += 1;
      family[record.family].motor.push(record.motorScore);
    }
    return {
      relation,
      pilot,
      transfer,
      confidence,
      medianLatency: median(records.map((record) => record.inferenceLatency)),
      drive: race.reasoningDrive,
      motorSigma: race.calibration.motorSigma,
      topError,
      family,
      rank: race.finalRank,
      time: race.gameTime,
    };
  }

  renderResults(result) {
    this.ui.resultTitle.textContent = result.rank === 1 ? 'RELATIONAL CIRCUIT WON' : 'RACE COMPLETE';
    this.ui.resultRelation.textContent = `${Math.round(result.relation * 100)}%`;
    this.ui.resultPilot.textContent = `${Math.round(result.pilot * 100)}%`;
    this.ui.resultTransfer.textContent = `${Math.round(result.transfer * 100)}%`;
    this.ui.resultPosition.textContent = `${result.rank} / 6`;
    this.ui.resultLatency.textContent = `${result.medianLatency.toFixed(2)} s`;
    this.ui.resultConfidence.textContent = `${Math.round(result.confidence * 100)}%`;
    this.ui.resultDrive.textContent = `${result.drive >= 0 ? '+' : ''}${Math.round(result.drive * 100)}`;
    this.ui.resultMotorBaseline.textContent = `σ ${result.motorSigma.toFixed(1)} m`;
    this.ui.resultErrors.textContent = result.topError;
    this.ui.resultTime.textContent = formatTime(result.time);
    this.ui.familyBreakdown.innerHTML = Object.entries(result.family)
      .map(([family, value]) => `<span class="family-chip">${FAMILY_NAMES[family] || family}: <b>${Math.round(value.correct / value.total * 100)}%</b> · flight ${Math.round(average(value.motor) * 100)}%</span>`)
      .join('');
  }

  exportTelemetry() {
    const race = this.race;
    if (!race) return;
    const payload = {
      schema: 'dream-unity.apex-relational-racing.v4',
      exportedAt: new Date().toISOString(),
      session: {
        mode: this.mode,
        seed: race.seed,
        durationSeconds: race.gameTime,
        finalRank: race.finalRank,
        reasoningDrive: race.reasoningDrive,
        calibration: race.calibration,
        results: this.computeResults(),
      },
      episodes: race.episodes,
      records: race.records,
      notice: 'Experimental game telemetry; not a clinical or validated intelligence assessment.',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `apex-relational-racing-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  render() {
    if (!this.race) {
      this.renderMenuBackground();
      return;
    }
    const race = this.race;
    const state = race.flight.state;
    const axes = race.flight.axes();
    const speedRatio = clamp(state.speed / 520, 0, 1.25);
    const stabilizedUp = this.settings.cameraRoll
      ? V3.normalize(V3.lerp(WORLD_UP, axes.up, this.cameraMode === 0 ? 0.72 : 0.94))
      : WORLD_UP;
    const eye = this.cameraMode === 0
      ? V3.add(state.position, V3.add(V3.scale(axes.forward, -28 - speedRatio * 10), V3.scale(axes.up, 7.2)))
      : V3.add(state.position, V3.add(V3.scale(axes.forward, -11), V3.scale(axes.up, 2.4)));
    const target = V3.add(state.position, V3.add(V3.scale(axes.forward, 75 + speedRatio * 55), V3.scale(axes.up, 1.2)));
    this.renderer.setFogColor('#030916');
    this.renderer.beginFrame({
      eye,
      target,
      up: stabilizedUp,
      fov: 66 + speedRatio * 13 + (state.afterburnerActive ? 5 : 0),
      fogNear: 130,
      fogFar: 1500,
    });
    this.renderEnvironment();
    this.renderCourse();
    this.renderRelationalWorld();
    this.renderTrails();
    this.renderRacers();
    renderFighter(this.renderer, state, {
      color: '#e9fbff',
      accent: '#55f7ff',
      canopy: '#74d8ff',
      airframe: 'apex',
      player: true,
      emissive: 0.34,
    });
    this.renderSpeedLines(speedRatio);
  }

  renderMenuBackground() {
    const t = this.worldTime;
    const position = [Math.sin(t * 0.22) * 24, 160 + Math.sin(t * 0.34) * 12, t * 65 % 850];
    const orientation = Q.multiply(Q.lookRotation([0.12, 0.03, 1], WORLD_UP), Q.fromAxisAngle([0, 0, 1], Math.sin(t * 0.4) * 0.18));
    const state = {
      position,
      orientation,
      speed: 320,
      afterburnerActive: true,
    };
    const forward = Q.rotateVector(orientation, [0, 0, 1]);
    const up = Q.rotateVector(orientation, [0, 1, 0]);
    const eye = V3.add(position, V3.add(V3.scale(forward, -32), V3.scale(up, 9)));
    const target = V3.add(position, V3.scale(forward, 80));
    this.renderer.setFogColor('#030916');
    this.renderer.beginFrame({ eye, target, up: V3.normalize(V3.lerp(WORLD_UP, up, 0.7)), fov: 70, fogNear: 100, fogFar: 1100 });
    this.renderer.draw('stars', { position: [0, 120, Math.floor(position[2] / 1000) * 1000], color: '#b9e8ff', alpha: 0.8, emissive: 1, depthWrite: false, pointSize: 2.7 });
    for (let index = 1; index <= 7; index += 1) {
      const z = position[2] + index * 125;
      this.renderer.glow('torus', {
        position: [Math.sin(index * 1.2 + t * 0.3) * 45, 150 + Math.cos(index) * 32, z],
        scale: [72, 56, 1.5],
        color: index % 2 ? '#55f7ff' : '#9b7cff',
        alpha: 0.25,
        emissive: 1,
      }, 0.13, 1.08);
    }
    renderFighter(this.renderer, state, { color: '#e9fbff', accent: '#55f7ff', airframe: 'apex', player: true });
  }

  renderEnvironment() {
    const race = this.race;
    const position = race.flight.state.position;
    this.renderer.draw('stars', {
      position: [0, 260, Math.floor(position[2] / 1200) * 1200],
      color: '#b9e8ff',
      alpha: 0.84,
      emissive: 1,
      depthWrite: false,
      pointSize: 2.7,
    });
    const progress = race.playerProgress;
    for (let index = 0; index < 12; index += 1) {
      const distance = clamp(progress - 120 + index * 150, 0, race.course.length);
      const frame = race.course.frameAt(distance);
      for (const side of [-1, 1]) {
        const lateral = side * (race.course.width + 75 + (index % 3) * 18);
        const base = race.course.offsetToWorld(distance, lateral, -95);
        const height = 45 + ((index * 37) % 95);
        this.renderer.draw('cube', {
          position: V3.add(base, V3.scale(frame.up, height * 0.5)),
          rotation: Q.toEulerXYZ(frame.orientation),
          scale: [18 + index % 4 * 5, height, 24 + index % 5 * 6],
          color: side < 0 ? '#0d263d' : '#1f173f',
          alpha: 0.52,
          emissive: 0.11,
        });
      }
    }
  }

  renderCourse() {
    const race = this.race;
    const course = race.course;
    const start = Math.max(0, race.playerProgress - 180);
    const end = Math.min(course.length, race.playerProgress + 1450);
    let previousCenter = course.frameAt(start).position;
    for (let distance = start; distance <= end; distance += 55) {
      const frame = course.frameAt(distance);
      const alpha = clamp(1 - Math.max(0, distance - race.playerProgress - 800) / 650, 0.12, 0.85);
      this.renderer.drawBar(previousCenter, frame.position, 0.12, '#4a9cbb', { alpha: alpha * 0.36, emissive: 0.75 });
      previousCenter = frame.position;
      if (Math.floor(distance / 110) % 2 === 0) {
        const rotation = Q.toEulerXYZ(frame.orientation);
        this.renderer.glow('torus', {
          position: frame.position,
          rotation,
          scale: [course.width, course.height, 1.5],
          color: Math.floor(distance / 220) % 2 ? '#55f7ff' : '#9b7cff',
          alpha: alpha * 0.2,
          emissive: 1,
        }, 0.12, 1.05);
        this.renderer.draw('torus', {
          position: frame.position,
          rotation,
          scale: [course.width, course.height, 1.5],
          color: '#5ca9c8',
          alpha: alpha * 0.18,
          emissive: 0.72,
        });
      }
      for (const lateral of [-course.width, course.width]) {
        const rail = course.offsetToWorld(distance, lateral, -course.height * 0.55);
        const nextRail = course.offsetToWorld(Math.min(course.length, distance + 55), lateral, -course.height * 0.55);
        this.renderer.drawBar(rail, nextRail, 0.17, lateral < 0 ? '#ff4fd8' : '#55f7ff', { alpha: alpha * 0.34, emissive: 0.9 });
      }
    }
    const nextCheckpointDistance = race.checkpointDistances[race.nextCheckpoint];
    if (Number.isFinite(nextCheckpointDistance) && nextCheckpointDistance < race.playerProgress + 1700) {
      const gateFrame = course.frameAt(nextCheckpointDistance);
      const missed = race.checkpointMiss?.index === race.nextCheckpoint;
      const gateColor = missed ? '#ff557c' : '#ffd166';
      const gatePulse = 1 + Math.sin(this.worldTime * (missed ? 5.2 : 2.8)) * 0.035;
      this.renderer.glow('torus', {
        position: gateFrame.position,
        rotation: Q.toEulerXYZ(gateFrame.orientation),
        scale: [course.width * 0.82 * gatePulse, course.height * 0.82 * gatePulse, 2.4],
        color: gateColor,
        alpha: missed ? 0.88 : 0.62,
        emissive: 1,
      }, missed ? 0.3 : 0.2, 1.08);
      this.renderer.draw('torus', {
        position: gateFrame.position,
        rotation: Q.toEulerXYZ(gateFrame.orientation),
        scale: [course.width * 0.82 * gatePulse, course.height * 0.82 * gatePulse, 2.4],
        color: gateColor,
        alpha: missed ? 0.82 : 0.54,
        emissive: 1,
      });
    }

    const finish = course.length - 60;
    if (finish < race.playerProgress + 1600) {
      const frame = course.frameAt(finish);
      this.renderer.glow('torus', {
        position: frame.position,
        rotation: Q.toEulerXYZ(frame.orientation),
        scale: [course.width * 0.72, course.height * 0.72, 2.8],
        color: '#ffd166',
        alpha: 0.8,
        emissive: 1,
      }, 0.22, 1.08);
    }
  }

  renderRelationalWorld() {
    const race = this.race;
    const runtime = race.episodeRuntime;
    if (!runtime) return;
    const event = runtime.event;
    const evidence = runtime.resolved.evidence;
    const strength = race.config.evidence;
    if (event.family.includes('vortex')) this.renderVortexEvidence(evidence.vortex || evidence, strength);
    if (event.family.includes('formation')) this.renderFormationEvidence(evidence.formation || evidence, strength);
    if (event.family === 'rotating-frame' || event.family === 'vortex-frame-compose') this.renderRotorEvidence(evidence.frame || evidence, event, strength);
    if (event.family === 'temporal-relay' || event.family === 'formation-temporal-compose') this.renderTemporalEvidence(evidence.temporal || evidence, event, strength);
    if (event.family === 'energy-intercept') this.renderEnergyEvidence(evidence, strength);
    if (event.family === 'race-role') this.renderRoleEvidence(evidence, strength);

    if (runtime.demonstration && race.playerProgress < event.demonstrationEndDistance) this.renderDemonstration(runtime);
    if (runtime.committed && race.playerProgress >= event.fieldStartDistance - 55) this.renderOutcomeField(runtime);
  }

  racerByObservation(observed) {
    return this.race.racers.find((racer) => racer.id === observed?.id);
  }

  renderVortexEvidence(evidence, strength) {
    if (!evidence?.pair) return;
    for (const [actorIndex, actor] of evidence.pair.entries()) {
      const racer = this.racerByObservation(actor);
      if (!racer) continue;
      for (const outer of [false, true]) {
        let previous = null;
        for (let step = 0; step <= 14; step += 1) {
          const horizon = step / 14 * 5.2;
          const direction = actorIndex === 0 ? 1 : -1;
          const offset = vortexPoint(actor, direction, horizon, { outer });
          const distance = clamp(actor.distance - horizon * Math.max(65, actor.speed) * 0.36, 0, this.race.course.length);
          const world = vectorToWorld(this.race.course, distance, offset);
          if (previous) this.renderer.drawBar(previous, world, outer ? 0.055 : 0.095, outer ? '#8b6cff' : '#55f7ff', {
            alpha: strength * (outer ? 0.18 : 0.5) * (1 - step / 18),
            emissive: 1,
            additive: true,
            depthWrite: false,
          });
          previous = world;
        }
      }
      racer.boostSignal = Math.max(racer.boostSignal, 0.35);
    }
  }

  renderFormationEvidence(evidence, strength) {
    if (!evidence?.leader || !evidence?.wingman) return;
    const leader = this.racerByObservation(evidence.leader);
    const wingman = this.racerByObservation(evidence.wingman);
    if (!leader || !wingman) return;
    this.renderer.drawBar(leader.position, wingman.position, 0.09, '#ffd166', { alpha: strength * 0.46, emissive: 1 });
    const frame = this.race.course.frameAt(leader.distance);
    const axisOffset = [Math.cos(leader.roll) * 38, Math.sin(leader.roll) * 38];
    const axisWorld = worldVectorFromOffset(frame, axisOffset);
    this.renderer.drawBar(
      V3.sub(leader.position, axisWorld),
      V3.add(leader.position, axisWorld),
      0.07,
      '#55f7ff',
      { alpha: strength * 0.35, emissive: 1, additive: true, depthWrite: false },
    );
  }

  renderRotorEvidence(evidence, event, strength) {
    const distance = event.fieldStartDistance;
    const center = event.rotor.center;
    const centerWorld = vectorToWorld(this.race.course, distance, center);
    const frame = this.race.course.frameAt(distance);
    const angle = event.rotor.initialAngle + event.rotor.angularSpeed * this.race.gameTime;
    const rotation = Q.toEulerXYZ(Q.multiply(frame.orientation, Q.fromAxisAngle([0, 0, 1], angle)));
    this.renderer.glow('torus', {
      position: centerWorld,
      rotation,
      scale: [event.rotor.radius, event.rotor.radius, 2.1],
      color: event.rotor.angularSpeed > 0 ? '#55f7ff' : '#ff4fd8',
      alpha: strength * 0.55,
      emissive: 1,
    }, 0.2, 1.12);
    this.renderer.draw('torus', {
      position: centerWorld,
      rotation,
      scale: [event.rotor.radius, event.rotor.radius, 2.1],
      color: '#b8e8ff',
      alpha: strength * 0.34,
      emissive: 0.85,
    });
    for (let index = 0; index < 8; index += 1) {
      const theta = angle + index / 8 * Math.PI * 2;
      const tipOffset = V2.add(center, [Math.cos(theta) * event.rotor.radius, Math.sin(theta) * event.rotor.radius]);
      this.renderer.drawBar(centerWorld, vectorToWorld(this.race.course, distance, tipOffset), 0.08, index === 0 ? '#ffd166' : '#73cfff', {
        alpha: strength * (index === 0 ? 0.75 : 0.28), emissive: 1,
      });
    }
  }

  renderTemporalEvidence(evidence, event, strength) {
    if (!evidence) return;
    const distances = [event.temporal.boundaryA, event.temporal.boundaryB];
    distances.forEach((distance, index) => {
      const frame = this.race.course.frameAt(distance);
      this.renderer.glow('torus', {
        position: frame.position,
        rotation: Q.toEulerXYZ(frame.orientation),
        scale: [this.race.course.width * 0.66, this.race.course.height * 0.66, 1.8],
        color: index === 0 ? '#ffd166' : '#ff4fd8',
        alpha: strength * 0.34,
        emissive: 1,
      }, 0.14, 1.08);
    });
    const apertureWorld = vectorToWorld(this.race.course, event.fieldStartDistance, evidence.aperture);
    const open = this.race.gameTime >= evidence.openAt && this.race.gameTime <= evidence.closeAt;
    this.renderer.glow('torus', {
      position: apertureWorld,
      rotation: courseGateRotation(this.race.course, event.fieldStartDistance),
      scale: [18, 18, 1.6],
      color: open ? '#75ff9b' : '#6b7394',
      alpha: strength * (open ? 0.72 : 0.22),
      emissive: open ? 1 : 0.35,
    }, open ? 0.24 : 0.1, 1.13);
  }

  renderEnergyEvidence(evidence, strength) {
    const racer = this.racerByObservation(evidence?.role);
    if (!racer) return;
    const frame = this.race.course.frameAt(racer.distance);
    const predictedWorld = vectorToWorld(this.race.course, racer.distance + racer.speed * Math.min(2.2, evidence.horizon), evidence.predicted);
    this.renderer.drawBar(racer.position, predictedWorld, 0.09, '#ffd166', {
      alpha: strength * 0.42,
      emissive: 1,
      additive: true,
      depthWrite: false,
    });
    const glowPosition = fighterAttachmentWorld({ position: racer.position, orientation: racer.orientation }, [0, 0, -6]);
    this.renderer.glow('octa', { position: glowPosition, scale: [1.1, 1.1, 1.1], color: '#ffd166', alpha: 0.75, emissive: 1 }, 0.3, 1.8);
    racer.boostSignal = Math.max(racer.boostSignal, 0.92);
  }

  renderRoleEvidence(evidence, strength) {
    const leader = this.racerByObservation(evidence?.leader);
    if (!leader) return;
    const frame = this.race.course.frameAt(leader.distance);
    const courseState = curveState(this.race.course, leader.distance);
    const outside = V3.scale(frame.right, -courseState.turnSign * 38);
    this.renderer.drawBar(leader.position, V3.add(leader.position, outside), 0.08, '#75ff9b', {
      alpha: strength * 0.34,
      emissive: 1,
      additive: true,
      depthWrite: false,
    });
  }

  renderDemonstration(runtime) {
    const event = runtime.event;
    const progress = clamp((this.race.playerProgress - event.observeDistance)
      / Math.max(1, event.demonstrationEndDistance - event.observeDistance), 0, 1);
    const path = runtime.resolved.paths.find((candidate) => candidate.id === runtime.resolved.correctId);
    if (!path) return;
    const offset = path.pointAt(progress);
    const distance = lerp(event.observeDistance + 60, event.demonstrationEndDistance + 70, progress);
    const frame = this.race.course.frameAt(distance);
    const position = vectorToWorld(this.race.course, distance, offset);
    const ghostState = {
      position,
      orientation: frame.orientation,
      speed: this.race.config.playerSpeed * 1.05,
      afterburnerActive: progress > 0.55,
    };
    renderFighter(this.renderer, ghostState, {
      color: '#b9faff', accent: '#75ff9b', canopy: '#d8ffff', airframe: 'kestrel', alpha: 0.52, emissive: 0.9, lod: 1,
    });
    if (progress > 0.45) {
      this.renderer.glow('torus', {
        position,
        rotation: Q.toEulerXYZ(frame.orientation),
        scale: [14, 14, 1.3],
        color: '#75ff9b',
        alpha: 0.42,
        emissive: 1,
      }, 0.22, 1.15);
    }
  }

  renderOutcomeField(runtime) {
    const event = runtime.event;
    const open = temporalFieldOpen(runtime.resolved, this.race.gameTime);
    const correctPath = runtime.resolved.correctPath;
    for (let index = 0; index <= 8; index += 1) {
      const t = index / 8;
      const distance = lerp(event.fieldStartDistance, event.fieldEndDistance, t);
      const pulse = 1 + Math.sin(this.worldTime * 4 + index) * 0.08;
      const target = correctPath?.pointAt(t) || runtime.resolved.correctTarget;
      const position = vectorToWorld(this.race.course, distance, target);
      const frame = this.race.course.frameAt(distance);
      this.renderer.glow('torus', {
        position,
        rotation: Q.toEulerXYZ(frame.orientation),
        scale: [11 * pulse, 11 * pulse, 1.1],
        color: open ? '#75ff9b' : '#69728c',
        alpha: (open ? 0.42 : 0.12) * (1 - Math.abs(t - 0.5) * 0.45),
        emissive: open ? 1 : 0.25,
      }, 0.2, 1.14);
    }
  }

  renderTrails() {
    const race = this.race;
    const drawTrail = (trail, color, alpha) => {
      for (let index = 1; index < trail.length; index += 1) {
        this.renderer.drawBar(trail[index - 1], trail[index], 0.055 + index / trail.length * 0.05, color, {
          alpha: alpha * index / trail.length,
          emissive: 1,
          additive: true,
          depthWrite: false,
        });
      }
    };
    drawTrail(race.playerTrail, race.flight.state.afterburnerActive ? '#ff4fd8' : '#55f7ff', 0.36);
    for (const racer of race.racers) drawTrail(race.trails.get(racer.id) || [], racer.color, racer.afterburnerActive ? 0.33 : 0.17);
  }

  renderRacers() {
    const race = this.race;
    for (const racer of race.racers) {
      if (Math.abs(racer.distance - race.playerProgress) > 900) continue;
      renderFighter(this.renderer, {
        position: racer.position,
        orientation: racer.orientation,
        speed: racer.speed,
        afterburnerActive: racer.afterburnerActive,
      }, {
        color: racer.color,
        accent: racer.color,
        canopy: '#8bdfff',
        airframe: racer.airframe,
        alpha: 0.94,
        emissive: 0.32,
        lod: Math.abs(racer.distance - race.playerProgress) > 500 ? 2 : 1,
      });
    }
  }

  renderSpeedLines(speedRatio) {
    if (this.settings.reducedMotion || speedRatio < 0.42) return;
    const state = this.race.flight.state;
    const axes = this.race.flight.axes();
    const count = Math.floor(10 + speedRatio * 17);
    for (let index = 0; index < count; index += 1) {
      const phase = (this.worldTime * (1.8 + speedRatio * 3.2) + index * 0.173) % 1;
      const angle = index / count * Math.PI * 2 + index * 1.27;
      const radius = 18 + (index * 31 % 68);
      const lateral = V3.add(V3.scale(axes.right, Math.cos(angle) * radius), V3.scale(axes.up, Math.sin(angle) * radius * 0.68));
      const start = V3.add(state.position, V3.add(lateral, V3.scale(axes.forward, 18 + phase * 120)));
      const end = V3.add(start, V3.scale(axes.forward, 4 + speedRatio * 18));
      this.renderer.drawBar(start, end, 0.045, index % 3 === 0 ? '#9b7cff' : '#55f7ff', {
        alpha: clamp((speedRatio - 0.3) * 0.42, 0.08, 0.32),
        emissive: 1,
        additive: true,
        depthWrite: false,
      });
    }
  }
}

try {
  window.apexRelationalRacing = new ApexRelationalRacing();
} catch (error) {
  console.error(error);
  const fatal = $('#fatalError');
  if (fatal) {
    fatal.textContent = `Apex Relational Racing could not initialise: ${error.message}`;
    fatal.classList.remove('hidden');
  }
}
