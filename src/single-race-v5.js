import './fighter-game.js';
import { clamp, V3 } from './math3d.js';
import { FighterFlightModel } from './fighter-flight.js';
import { Course3D } from './course3d.js';
import { generateEpisodeSchedule } from './relational-racing.js';
import {
  LEVEL_PLAN,
  SINGLE_RACE_CONFIG,
  decorateProgressiveEpisodes,
  progressiveLevelAtDistance,
  levelDefinition,
} from './race-progression.js';

const PITCH_SETTING_KEY = 'dream-unity-apex-direct-pitch-v5';

function seedForRace() {
  const supplied = new URLSearchParams(window.location.search).get('seed');
  return supplied || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function updatePitchButton(app) {
  const button = document.querySelector('#pitchButton');
  if (!button) return;
  const inverted = app.input?.isPitchInverted?.() || false;
  button.textContent = inverted ? 'PITCH: INVERTED' : 'PITCH: DIRECT';
  button.classList.toggle('off', inverted);
  button.setAttribute('aria-pressed', String(inverted));
}

export function installSingleRaceV5(app = window.apexRelationalRacing) {
  if (!app) throw new Error('The Apex fighter runtime was not created before single-race integration.');
  if (app.singleRaceV5Installed) return app;
  app.singleRaceV5Installed = true;

  const directPitch = localStorage.getItem(PITCH_SETTING_KEY) !== 'inverted';
  app.input?.setPitchInverted?.(!directPitch);
  app.mode = 'single-race';
  app.ui.launchButton.textContent = SINGLE_RACE_CONFIG.button;
  app.ui.modeLabel.textContent = SINGLE_RACE_CONFIG.label;
  updatePitchButton(app);

  document.querySelector('#pitchButton')?.addEventListener('click', () => {
    const next = !app.input.isPitchInverted();
    app.input.setPitchInverted(next);
    localStorage.setItem(PITCH_SETTING_KEY, next ? 'inverted' : 'direct');
    updatePitchButton(app);
  });

  app.updateModeSelection = function updateSingleRaceSelection() {
    this.mode = 'single-race';
    this.ui.launchButton.textContent = SINGLE_RACE_CONFIG.button;
    this.ui.modeLabel.textContent = SINGLE_RACE_CONFIG.label;
  };

  app.startRace = function startOneRace() {
    this.mode = 'single-race';
    const config = { ...SINGLE_RACE_CONFIG };
    const seed = seedForRace();
    const course = new Course3D(`${seed}:course`, {
      width: 190,
      height: 140,
      lengthScale: 4.8,
      lateralScale: 1.48,
      verticalScale: 1.68,
    });
    const startFrame = course.frameAt(0);
    const flight = new FighterFlightModel({
      cruiseSpeed: 520,
      structuralSpeed: 970,
      maximumSpeed: 1120,
      baseThrustAcceleration: 82,
      afterburnerAcceleration: 94,
      pitchRate: 1.94,
      yawRate: 1.16,
      rollRate: 3.48,
      angularResponse: 11.4,
      angularDamping: 0.54,
      velocityAlignment: 3.28,
      liftAuthority: 4.4,
      initialState: {
        position: course.offsetToWorld(0, 0, 0),
        forward: startFrame.forward,
        up: startFrame.up,
        speed: config.playerSpeed,
        throttle: 0.92,
      },
    });
    flight.state.orientation = startFrame.orientation;
    flight.state.velocity = V3.scale(startFrame.forward, config.playerSpeed);

    const generated = generateEpisodeSchedule({
      seed,
      mode: 'grand-prix',
      courseLength: course.length,
      count: config.eventCount,
      history: this.loadHistory(),
    });
    const episodes = decorateProgressiveEpisodes(generated, seed);
    const racers = this.createAiRacers(seed, config, course);

    this.race = {
      seed,
      config,
      course,
      flight,
      playerProgress: 0,
      playerOffset: { lateral: 0, vertical: 0, longitudinal: 0, crossTrackDistance: 0 },
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
      checkpointDistances: course.checkpointDistances(config.checkpointCount),
      checkpointCount: config.checkpointCount,
      nextCheckpoint: 0,
      lastCheckpoint: -1,
      rawProgress: 0,
      validatedProgress: 0,
      checkpointMiss: null,
      checkpointPenalties: 0,
      lastAnnouncedLevel: 0,
      levelCount: LEVEL_PLAN.length,
    };

    this.state = 'countdown';
    this.countdownRemaining = 3.2;
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
    this.input.setPitchInverted(localStorage.getItem(PITCH_SETTING_KEY) === 'inverted');
    this.audio.unlock().catch(() => {});
    this.updateHud();
  };

  // Preserve launch speed and orientation. The former countdown applied the airbrake
  // for almost four seconds before control was handed to the player.
  app.updateCountdown = function updateOneRaceCountdown(dt) {
    const race = this.race;
    if (!race) return;
    this.countdownRemaining -= dt;
    const display = Math.ceil(this.countdownRemaining - 0.38);
    this.ui.countdown.textContent = this.countdownRemaining > 0.5
      ? (display > 0 ? String(display) : 'READY')
      : 'FLY';

    race.flight.setInput({
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttleDelta: 0,
      throttleSet: 0.92,
      afterburner: false,
      airbrake: false,
    });
    race.flight.state.commandedThrottle = 0.92;
    race.flight.state.throttle = Math.max(race.flight.state.throttle, 0.9);
    this.audio.update(race.flight.state.speed / 1120, false, true);

    if (this.countdownRemaining <= 0) {
      this.state = 'racing';
      this.ui.countdown.classList.add('hidden');
      this.showFeedback('LEVEL 1 / 10 // VORTEX READING', 'neutral', 2.4);
    }
    this.updateHud();
  };

  // Gates guide the circuit but never trap, reverse or magnetically drag the jet
  // back to an old checkpoint. A miss costs a small amount of energy and racing line,
  // then the race continues immediately.
  app.updatePlayerProgress = function updateForgivingProgress() {
    const race = this.race;
    if (!race) return;
    const previousRaw = race.rawProgress ?? race.playerProgress;
    const nearest = race.course.nearestProgress(race.flight.state.position, previousRaw, 2800);
    const maximumAdvance = Math.max(180, race.flight.state.speed * 0.22);
    const bounded = clamp(nearest.distance, previousRaw - 24, previousRaw + maximumAdvance);
    race.rawProgress = Math.max(0, bounded);
    race.playerProgress = race.rawProgress;
    race.playerOffset = nearest;

    while (race.nextCheckpoint < race.checkpointDistances.length) {
      const checkpointDistance = race.checkpointDistances[race.nextCheckpoint];
      if (race.rawProgress < checkpointDistance) break;

      const offset = race.course.worldToOffset(race.flight.state.position, checkpointDistance);
      const ellipse = (offset.lateral / (race.course.width * 1.08)) ** 2
        + (offset.vertical / (race.course.height * 1.08)) ** 2;
      const planeWindow = Math.max(210, race.flight.state.speed * 0.36);
      const cleanPass = ellipse <= 1 && Math.abs(offset.longitudinal) <= planeWindow;

      race.lastCheckpoint = race.nextCheckpoint;
      race.nextCheckpoint += 1;
      race.checkpointMiss = null;
      if (cleanPass) {
        this.audio.cue('gate');
      } else {
        race.checkpointPenalties += 1;
        race.flight.state.velocity = V3.scale(race.flight.state.velocity, 0.975);
        race.flight.state.shield = Math.max(0, race.flight.state.shield - 0.025);
        race.reasoningDrive = clamp(race.reasoningDrive - 0.018, -1, 1);
        this.showFeedback('WIDE OF GATE // RACE CONTINUES', 'incorrect', 1.15);
      }
    }

    race.validatedProgress = race.rawProgress;
  };

  const baseEnsureEpisodeRuntime = app.ensureEpisodeRuntime.bind(app);
  app.ensureEpisodeRuntime = function ensureProgressiveEpisode(event) {
    if (event && this.race) {
      const level = levelDefinition(event.level);
      this.race.config.evidence = event.evidenceStrength ?? level.evidence;
      this.race.config.explicitFamily = event.explicitFamily ?? level.explicit;
      this.race.config.demonstrations = event.demonstration ? event.index + 1 : 0;
      this.race.config.feedback = true;
    }

    const previousEventId = this.race?.episodeRuntime?.event?.id || null;
    const runtime = baseEnsureEpisodeRuntime(event);
    if (runtime && event) {
      runtime.demonstration = Boolean(event.demonstration);
      if (previousEventId !== event.id && this.race.lastAnnouncedLevel !== event.level) {
        this.race.lastAnnouncedLevel = event.level;
        this.showFeedback(`LEVEL ${event.level} / 10 // ${event.levelName}`, 'neutral', 2.25);
      }
    }
    return runtime;
  };

  const baseUpdateEpisodeBeforeFlight = app.updateEpisodeBeforeFlight.bind(app);
  app.updateEpisodeBeforeFlight = function updateProgressiveEpisode(dt) {
    baseUpdateEpisodeBeforeFlight(dt);
    const runtime = this.race?.episodeRuntime;
    if (!runtime) return;
    const event = runtime.event;
    const phase = runtime.committed
      ? 'TRAJECTORY LOCKED'
      : event.explicitFamily
        ? event.levelName
        : 'READ THE RACE';
    this.ui.relationPhase.textContent = `LEVEL ${event.level} / 10 // ${phase}`;
  };

  const baseUpdateHud = app.updateHud.bind(app);
  app.updateHud = function updateSingleRaceHud() {
    baseUpdateHud();
    if (!this.race) return;
    const level = progressiveLevelAtDistance(this.race.episodes, this.race.playerProgress);
    this.ui.sectorValue.textContent = `${level} / ${LEVEL_PLAN.length}`;
    this.ui.modeLabel.textContent = `ONE RACE // LEVEL ${level}`;
  };

  const baseFinishRace = app.finishRace.bind(app);
  app.finishRace = function finishOneRace() {
    baseFinishRace();
    this.ui.resultTitle.textContent = this.race?.finalRank === 1
      ? 'TEN-LEVEL CIRCUIT WON'
      : 'TEN-LEVEL RACE COMPLETE';
  };

  const baseReturnToMenu = app.returnToMenu.bind(app);
  app.returnToMenu = function returnToSingleRaceMenu() {
    baseReturnToMenu();
    this.mode = 'single-race';
    this.ui.launchButton.textContent = SINGLE_RACE_CONFIG.button;
    this.ui.modeLabel.textContent = SINGLE_RACE_CONFIG.label;
    updatePitchButton(this);
  };

  app.updateModeSelection();
  return app;
}

installSingleRaceV5();
