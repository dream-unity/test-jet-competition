/**
 * Dynamic control-frame relational reasoning for Impulse Run.
 *
 * The player is shown two direct motion correspondences before a control-frame
 * transformation becomes active. The mapping is always an orthogonal member of
 * the square's D4 symmetry group, so steering magnitude is preserved while the
 * relation between input and flight outcome changes.
 */

const EPSILON = 1e-9;
const HISTORY_KEY = 'dream-unity-impulse-run-control-relations-v1';
const HARD_MAX_INTERVAL = 30;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const round = (value, digits = 4) => Number(value.toFixed(digits));
const magnitude = (vector) => Math.hypot(vector[0], vector[1]);
const dot = (left, right) => left[0] * right[0] + left[1] * right[1];
const cross = (left, right) => left[0] * right[1] - left[1] * right[0];
const normalize = (vector) => {
  const length = magnitude(vector);
  return length > EPSILON ? [vector[0] / length, vector[1] / length] : [0, 0];
};
const mixVector = (left, right, amount) => [
  left[0] + (right[0] - left[0]) * amount,
  left[1] + (right[1] - left[1]) * amount,
];

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function regressionSlope(values) {
  if (values.length < 2) return null;
  const xMean = (values.length - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });
  return denominator > 0 ? numerator / denominator : null;
}

function hashSeed(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
}

export class ControlPRNG {
  constructor(seed = 'control-relations') {
    this.state = hashSeed(seed) || 0x6d2b79f5;
  }

  next() {
    let value = this.state += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    this.state = value >>> 0;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  integer(minimum, maximum) {
    return Math.floor(this.next() * (maximum - minimum + 1)) + minimum;
  }

  pick(items) {
    return items[Math.floor(this.next() * items.length)];
  }

  shuffle(items) {
    const output = [...items];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(this.next() * (index + 1));
      [output[index], output[swap]] = [output[swap], output[index]];
    }
    return output;
  }
}

export const CONTROL_MAPPINGS = Object.freeze([
  Object.freeze({ id: 'identity', matrix: Object.freeze([1, 0, 0, 1]), family: 'stable', complexity: 0, compound: false }),
  Object.freeze({ id: 'mirror-x', matrix: Object.freeze([-1, 0, 0, 1]), family: 'reflection', complexity: 1, compound: false }),
  Object.freeze({ id: 'mirror-y', matrix: Object.freeze([1, 0, 0, -1]), family: 'reflection', complexity: 1, compound: false }),
  Object.freeze({ id: 'half-turn', matrix: Object.freeze([-1, 0, 0, -1]), family: 'rotation', complexity: 1, compound: false }),
  Object.freeze({ id: 'quarter-right', matrix: Object.freeze([0, 1, -1, 0]), family: 'rotation', complexity: 2, compound: true }),
  Object.freeze({ id: 'quarter-left', matrix: Object.freeze([0, -1, 1, 0]), family: 'rotation', complexity: 2, compound: true }),
  Object.freeze({ id: 'swap-diagonal', matrix: Object.freeze([0, 1, 1, 0]), family: 'axis-exchange', complexity: 2, compound: true }),
  Object.freeze({ id: 'swap-antidiagonal', matrix: Object.freeze([0, -1, -1, 0]), family: 'axis-exchange', complexity: 2, compound: true }),
]);

const MAPPING_BY_ID = new Map(CONTROL_MAPPINGS.map((mapping) => [mapping.id, mapping]));
const SIMPLE_MAPPING_IDS = CONTROL_MAPPINGS.filter((mapping) => !mapping.compound).map((mapping) => mapping.id);
const COMPOUND_MAPPING_IDS = CONTROL_MAPPINGS.filter((mapping) => mapping.compound).map((mapping) => mapping.id);

export const CONTROL_MODE_PROFILES = Object.freeze({
  training: Object.freeze({
    initialMin: 10.5,
    initialMax: 12.5,
    intervalMin: 24,
    intervalMax: 30,
    intervalCenter: 27,
    cueDuration: 2.35,
    compoundShare: 0.22,
    persistentSeconds: 6,
    commitmentGuard: 3.0,
    gateGuard: 1.8,
    maxDeferral: 4.2,
    overlapShare: 0,
  }),
  'grand-prix': Object.freeze({
    initialMin: 10,
    initialMax: 12,
    intervalMin: 18,
    intervalMax: 26,
    intervalCenter: 22,
    cueDuration: 1.9,
    compoundShare: 0.30,
    persistentSeconds: 2.8,
    commitmentGuard: 1.8,
    gateGuard: 1.15,
    maxDeferral: 2.6,
    overlapShare: 0.30,
  }),
  assessment: Object.freeze({
    initialMin: 10.5,
    initialMax: 12.5,
    intervalMin: 19,
    intervalMax: 25,
    intervalCenter: 22,
    cueDuration: 1.7,
    compoundShare: 0.40,
    persistentSeconds: 0.7,
    commitmentGuard: 3.2,
    gateGuard: 2.0,
    maxDeferral: 4.5,
    overlapShare: 0,
  }),
  transfer: Object.freeze({
    initialMin: 10,
    initialMax: 11.5,
    intervalMin: 16,
    intervalMax: 24,
    intervalCenter: 20,
    cueDuration: 1.45,
    compoundShare: 0.65,
    persistentSeconds: 0.35,
    commitmentGuard: 1.2,
    gateGuard: 0.8,
    maxDeferral: 1.6,
    overlapShare: 0.62,
  }),
});

const PROBE_DIRECTIONS = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([0, 1]),
  Object.freeze([-1, 0]),
  Object.freeze([0, -1]),
  Object.freeze(normalize([1, 1])),
  Object.freeze(normalize([-1, 1])),
  Object.freeze(normalize([-1, -1])),
  Object.freeze(normalize([1, -1])),
]);

function getProfile(mode) {
  return CONTROL_MODE_PROFILES[mode] || CONTROL_MODE_PROFILES['grand-prix'];
}

export function getControlMapping(mappingOrId) {
  if (typeof mappingOrId === 'string') return MAPPING_BY_ID.get(mappingOrId) || MAPPING_BY_ID.get('identity');
  return mappingOrId || MAPPING_BY_ID.get('identity');
}

export function applyControlMapping(mappingOrId, vector) {
  const mapping = getControlMapping(mappingOrId);
  const [m00, m01, m10, m11] = mapping.matrix;
  const x = Array.isArray(vector) ? vector[0] : vector.x;
  const y = Array.isArray(vector) ? vector[1] : vector.y;
  return [m00 * x + m01 * y, m10 * x + m11 * y];
}

export function invertControlMapping(mappingOrId, vector) {
  const mapping = getControlMapping(mappingOrId);
  const [m00, m01, m10, m11] = mapping.matrix;
  const x = Array.isArray(vector) ? vector[0] : vector.x;
  const y = Array.isArray(vector) ? vector[1] : vector.y;
  return [m00 * x + m10 * y, m01 * x + m11 * y];
}

function intervalFromProfile(rng, profile, previousIntervals) {
  let interval = profile.intervalCenter;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const triangular = (rng.next() + rng.next()) / 2;
    interval = profile.intervalMin + triangular * (profile.intervalMax - profile.intervalMin);
    interval += (profile.intervalCenter - (profile.intervalMin + profile.intervalMax) / 2) * 0.35;
    interval = clamp(interval, profile.intervalMin, profile.intervalMax);
    const rounded = Math.round(interval * 2) / 2;
    const repeatsRecent = previousIntervals.slice(-3).some((value) => Math.abs(value - rounded) < 0.24);
    if (!repeatsRecent) return rounded;
  }
  return Math.round(interval * 2) / 2;
}

function chooseProbePair(rng, mapping, previousPairKey = '') {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const firstIndex = rng.integer(0, PROBE_DIRECTIONS.length - 1);
    let secondIndex = rng.integer(0, PROBE_DIRECTIONS.length - 1);
    if (secondIndex === firstIndex) secondIndex = (secondIndex + 3) % PROBE_DIRECTIONS.length;
    const first = PROBE_DIRECTIONS[firstIndex];
    const second = PROBE_DIRECTIONS[secondIndex];
    if (Math.abs(cross(first, second)) < 0.45) continue;
    const pairKey = `${firstIndex}.${secondIndex}`;
    if (pairKey === previousPairKey) continue;
    return {
      key: pairKey,
      input: [first, second],
      output: [applyControlMapping(mapping, first), applyControlMapping(mapping, second)],
    };
  }
  const input = [PROBE_DIRECTIONS[0], PROBE_DIRECTIONS[1]];
  return {
    key: '0.1',
    input,
    output: input.map((vector) => applyControlMapping(mapping, vector)),
  };
}

function weightedChoice(rng, candidates, weightFor) {
  const weighted = candidates.map((candidate) => ({ candidate, weight: Math.max(0.0001, weightFor(candidate)) }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rng.next() * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.candidate;
  }
  return weighted.at(-1).candidate;
}

function chooseNextMapping({ rng, mode, currentId, exposures, recentIds, transitionCounts, index }) {
  const profile = getProfile(mode);
  const assessmentCycle = mode === 'assessment';
  let preferredCompound = rng.next() < profile.compoundShare;
  if (assessmentCycle) preferredCompound = index % 5 === 2 || index % 5 === 4;

  let poolIds = preferredCompound ? COMPOUND_MAPPING_IDS : SIMPLE_MAPPING_IDS;
  let candidates = poolIds.filter((id) => id !== currentId);
  if (!candidates.length) candidates = CONTROL_MAPPINGS.map((mapping) => mapping.id).filter((id) => id !== currentId);

  const leastExposure = Math.min(...candidates.map((id) => exposures.get(id) || 0));
  const balanced = candidates.filter((id) => (exposures.get(id) || 0) <= leastExposure + 1);
  candidates = balanced.length ? balanced : candidates;

  return weightedChoice(rng, candidates, (id) => {
    const exposure = exposures.get(id) || 0;
    const recencyIndex = recentIds.lastIndexOf(id);
    const recencyPenalty = recencyIndex < 0 ? 1.45 : recencyIndex === recentIds.length - 1 ? 0.01 : 0.35 + (recentIds.length - recencyIndex) * 0.13;
    const transition = `${currentId}>${id}`;
    const transitionPenalty = 1 / (1 + (transitionCounts.get(transition) || 0) * 0.75);
    return (1 / (1 + exposure * 0.65)) * recencyPenalty * transitionPenalty;
  });
}

export function generateControlSchedule({ seed = 'control-schedule', mode = 'grand-prix', count = 64, avoidSignatures = [] } = {}) {
  const profile = getProfile(mode);
  const rng = new ControlPRNG(`${seed}:${mode}:schedule`);
  const avoid = new Set(avoidSignatures);
  const schedule = [];
  const exposures = new Map(CONTROL_MAPPINGS.map((mapping) => [mapping.id, 0]));
  const transitionCounts = new Map();
  const recentIds = ['identity'];
  const previousIntervals = [];
  let currentId = 'identity';
  let activationAt = profile.initialMin + rng.next() * (profile.initialMax - profile.initialMin);
  let previousPairKey = '';

  for (let index = 0; index < count; index += 1) {
    let mappingId = 'mirror-x';
    let probes = null;
    let encoding = 0;
    let signature = '';

    for (let attempt = 0; attempt < 32; attempt += 1) {
      mappingId = chooseNextMapping({ rng, mode, currentId, exposures, recentIds, transitionCounts, index: index + attempt });
      const mapping = getControlMapping(mappingId);
      probes = chooseProbePair(rng, mapping, previousPairKey);
      encoding = rng.integer(0, 5);
      signature = `${currentId}>${mappingId}:${probes.key}:e${encoding}`;
      const repeatedInSession = schedule.slice(-12).some((event) => event.signature === signature);
      if (!avoid.has(signature) && !repeatedInSession) break;
    }

    const mapping = getControlMapping(mappingId);
    const interval = intervalFromProfile(rng, profile, previousIntervals);
    const transition = `${currentId}>${mappingId}`;
    const event = {
      index,
      fromId: currentId,
      toId: mappingId,
      family: mapping.family,
      complexity: mapping.complexity,
      compound: mapping.compound,
      activationAt: round(activationAt, 3),
      cueAt: round(activationAt - profile.cueDuration, 3),
      cueDuration: profile.cueDuration,
      intervalAfter: interval,
      probes,
      encoding,
      signature,
      overlapToken: rng.next(),
      deferredBy: 0,
      cueStarted: false,
      activated: false,
      finalized: false,
    };
    schedule.push(event);

    exposures.set(mappingId, (exposures.get(mappingId) || 0) + 1);
    transitionCounts.set(transition, (transitionCounts.get(transition) || 0) + 1);
    recentIds.push(mappingId);
    if (recentIds.length > 6) recentIds.shift();
    previousIntervals.push(interval);
    previousPairKey = probes.key;
    currentId = mappingId;
    activationAt += interval;
  }

  return schedule;
}

export function classifyControlResponse({ raw, reference, oldMapping = 'identity', newMapping = 'identity' }) {
  const rawVector = normalize(raw);
  const referenceVector = normalize(reference);
  if (magnitude(rawVector) < 0.01 || magnitude(referenceVector) < 0.01) {
    return {
      category: 'unscored',
      correct: null,
      outputAlignment: null,
      requiredAlignment: null,
      oldFrameAlignment: null,
    };
  }

  const requiredRaw = normalize(invertControlMapping(newMapping, referenceVector));
  const oldRequiredRaw = normalize(invertControlMapping(oldMapping, referenceVector));
  const output = normalize(applyControlMapping(newMapping, rawVector));
  const outputAlignment = dot(output, referenceVector);
  const requiredAlignment = dot(rawVector, requiredRaw);
  const oldFrameAlignment = dot(rawVector, oldRequiredRaw);
  const inverseAlignment = dot(rawVector, [-requiredRaw[0], -requiredRaw[1]]);
  const swappedAlignment = Math.max(
    dot(rawVector, normalize([requiredRaw[1], requiredRaw[0]])),
    dot(rawVector, normalize([-requiredRaw[1], -requiredRaw[0]])),
  );

  let category = 'exploratory';
  let correct = false;
  if (requiredAlignment >= 0.62 && outputAlignment >= 0.45) {
    category = 'correct-compensation';
    correct = true;
  } else if (oldFrameAlignment >= 0.72 && requiredAlignment < 0.55) {
    category = 'old-frame-perseveration';
  } else if (inverseAlignment >= 0.72) {
    category = 'inverse-response';
  } else if (swappedAlignment >= 0.72) {
    category = 'axis-exchange';
  }

  return {
    category,
    correct,
    outputAlignment: round(outputAlignment),
    requiredAlignment: round(requiredAlignment),
    oldFrameAlignment: round(oldFrameAlignment),
    requiredRaw: requiredRaw.map((value) => round(value)),
    oldRequiredRaw: oldRequiredRaw.map((value) => round(value)),
  };
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function vectorFromAxis(axis) {
  return [Number(axis?.x) || 0, Number(axis?.y) || 0];
}

function htmlForFallbackUi() {
  return `
    <div id="controlRelationSystem" class="control-relation-system hidden" aria-hidden="true">
      <div id="controlRelationCue" class="control-relation-cue">
        <div class="cr-frame cr-input-frame"><i class="cr-axis-x"></i><i class="cr-axis-y"></i><b class="cr-probe cr-probe-a"></b><b class="cr-probe cr-probe-b"></b></div>
        <div class="cr-stream"><i></i><i></i><i></i></div>
        <div class="cr-frame cr-output-frame"><i class="cr-axis-x"></i><i class="cr-axis-y"></i><b class="cr-probe cr-probe-a"></b><b class="cr-probe cr-probe-b"></b></div>
        <div id="controlRelationCountdown" class="cr-countdown"></div>
      </div>
      <div id="controlRelationMini" class="control-relation-mini hidden">
        <div class="cr-frame cr-mini-input"><i class="cr-axis-x"></i><i class="cr-axis-y"></i><b class="cr-probe cr-probe-a"></b><b class="cr-probe cr-probe-b"></b></div>
        <div class="cr-mini-stream"></div>
        <div class="cr-frame cr-mini-output"><i class="cr-axis-x"></i><i class="cr-axis-y"></i><b class="cr-probe cr-probe-a"></b><b class="cr-probe cr-probe-b"></b></div>
      </div>
    </div>`;
}

export class ControlRelationController {
  constructor({ getApp } = {}) {
    this.getApp = getApp || (() => (typeof window !== 'undefined' ? window.impulseRun : null));
    this.session = null;
    this.lastSession = null;
    this.currentMapping = getControlMapping('identity');
    this.lastRaw = [0, 0];
    this.lastMapped = [0, 0];
    this.lastSampleTime = null;
    this.intentVector = [0, 0];
    this.intentStability = 0;
    this.ui = null;
    this.exportBridgeAttached = false;
    this.resultsRenderedFor = null;

    if (typeof document !== 'undefined') {
      this.installUi();
      setTimeout(() => this.attachExportBridge(), 0);
    }
  }

  installUi() {
    let system = document.querySelector('#controlRelationSystem');
    if (!system) {
      document.querySelector('#app')?.insertAdjacentHTML('beforeend', htmlForFallbackUi());
      system = document.querySelector('#controlRelationSystem');
    }
    this.ui = {
      system,
      cue: document.querySelector('#controlRelationCue'),
      countdown: document.querySelector('#controlRelationCountdown'),
      mini: document.querySelector('#controlRelationMini'),
      inputFrame: system?.querySelector('.cr-input-frame'),
      outputFrame: system?.querySelector('.cr-output-frame'),
      miniInput: system?.querySelector('.cr-mini-input'),
      miniOutput: system?.querySelector('.cr-mini-output'),
      results: document.querySelector('#controlRelationResults'),
      resultScore: document.querySelector('#resultControlRelation'),
      resultFrameScore: document.querySelector('#controlFrameScore'),
      resultSwitches: document.querySelector('#controlSwitches'),
      resultFirstAction: document.querySelector('#controlFirstAction'),
      resultInference: document.querySelector('#controlInferenceLatency'),
      resultRecovery: document.querySelector('#controlRecovery'),
      resultSwitchCost: document.querySelector('#controlSwitchCost'),
      resultNovelty: document.querySelector('#controlTransitionNovelty'),
      resultAdaptation: document.querySelector('#controlAdaptation'),
      resultErrors: document.querySelector('#controlErrorTopology'),
    };
  }

  attachExportBridge() {
    const app = this.getApp();
    if (!app || this.exportBridgeAttached) {
      if (!this.exportBridgeAttached && typeof window !== 'undefined') setTimeout(() => this.attachExportBridge(), 100);
      return;
    }
    const controller = this;
    app.exportTelemetry = function exportTelemetryWithControlRelations() {
      if (!this.race) return;
      const payload = {
        schema: 'dream-unity.impulse-run.telemetry.v2',
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
        controlRelations: controller.snapshot(),
        notice: 'Experimental game telemetry; not a clinical or validated intelligence assessment.',
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `impulse-run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    };
    this.exportBridgeAttached = true;
  }

  readAvoidedSignatures() {
    if (typeof localStorage === 'undefined') return [];
    try {
      const stored = safeParse(localStorage.getItem(HISTORY_KEY), []);
      if (!Array.isArray(stored)) return [];
      return stored.flatMap((session) => Array.isArray(session.signatures) ? session.signatures : []).slice(-240);
    } catch {
      return [];
    }
  }

  startSession(app) {
    const race = app.race;
    const sessionId = `${race.seed}:${race.startWallTime}`;
    const mode = app.mode || 'grand-prix';
    const profile = getProfile(mode);
    const schedule = generateControlSchedule({
      seed: `${race.seed}:${race.startWallTime}:control-relations`,
      mode,
      count: 64,
      avoidSignatures: this.readAvoidedSignatures(),
    });

    this.session = {
      schema: 'dream-unity.impulse-run.control-relations.v1',
      sessionId,
      raceSeed: race.seed,
      raceStartedAt: race.startWallTime,
      mode,
      profile: { ...profile },
      schedule,
      nextEventIndex: 0,
      currentMappingId: 'identity',
      events: [],
      startedAt: Date.now(),
      completedAt: null,
      lastTraceAt: -Infinity,
      persistentUntil: 0,
      finalized: false,
    };
    this.currentMapping = getControlMapping('identity');
    this.lastRaw = [0, 0];
    this.lastMapped = [0, 0];
    this.lastSampleTime = null;
    this.intentVector = [0, 0];
    this.intentStability = 0;
    this.resultsRenderedFor = null;
    this.ui?.results?.classList.add('hidden');
    if (this.ui?.resultScore) this.ui.resultScore.textContent = '—';
    this.hideCue();
    this.updateMini(schedule[0]?.probes, this.currentMapping, false);
  }

  syncSession(app) {
    if (!app?.race) {
      if (app?.state === 'menu') this.hideAll();
      return;
    }
    const sessionId = `${app.race.seed}:${app.race.startWallTime}`;
    if (!this.session || this.session.sessionId !== sessionId) this.startSession(app);

    if (app.state === 'results' && !this.session.finalized) this.finalizeSession(app);
    if (app.state === 'menu') this.hideAll();
  }

  hideAll() {
    this.ui?.system?.classList.add('hidden');
    this.ui?.mini?.classList.add('hidden');
    this.hideCue();
  }

  hideCue() {
    this.ui?.cue?.classList.remove('visible', 'activating', 'encoding-0', 'encoding-1', 'encoding-2', 'encoding-3', 'encoding-4', 'encoding-5');
  }

  release() {
    this.lastRaw = [0, 0];
  }

  eventDue() {
    return this.session?.schedule[this.session.nextEventIndex] || null;
  }

  shouldDefer(app, event, time) {
    const profile = this.session.profile;
    if (event.overlapToken < profile.overlapShare) return 0;
    const sector = typeof app.activeSector === 'function' ? app.activeSector() : null;
    const player = app.race?.player;
    if (!sector || !player || player.speed < 20) return 0;

    const activationHorizon = Math.max(0, event.activationAt - time);
    const toCommit = (sector.commitZ - player.z) / player.speed - activationHorizon;
    const toGate = (sector.gateZ - player.z) / player.speed - activationHorizon;
    const nearCommit = toCommit > -0.55 && toCommit < profile.commitmentGuard;
    const nearGate = toGate > -0.45 && toGate < profile.gateGuard;
    const collisionRecovery = player.flash > 0.03;
    if (!nearCommit && !nearGate && !collisionRecovery) return 0;

    let delay = 0.7;
    if (nearGate && toGate > 0) delay = toGate + 0.75;
    else if (nearCommit && toCommit > 0) delay = Math.min(toCommit + 0.85, profile.maxDeferral);
    if (collisionRecovery) delay = Math.max(delay, 0.8);

    const lastActivation = this.session.events.at(-1)?.activatedAt ?? 0;
    const cadenceHeadroom = Math.max(0, HARD_MAX_INTERVAL - (event.activationAt - lastActivation));
    const remaining = Math.max(0, Math.min(profile.maxDeferral - event.deferredBy, cadenceHeadroom));
    if (remaining <= 0.05) return 0;
    return Math.min(remaining, Math.max(Math.min(0.35, remaining), delay));
  }

  deferCurrentEvent(delay) {
    if (!this.session || delay <= 0) return;
    for (let index = this.session.nextEventIndex; index < this.session.schedule.length; index += 1) {
      this.session.schedule[index].activationAt = round(this.session.schedule[index].activationAt + delay, 3);
      this.session.schedule[index].cueAt = round(this.session.schedule[index].cueAt + delay, 3);
    }
    const event = this.eventDue();
    if (!event) return;
    event.deferredBy = round(event.deferredBy + delay, 3);
    event.cueStarted = false;
    event.preCueTrace = [];
    event.preCueLastTraceAt = -Infinity;
    delete event.cueStartedAt;
    delete event.preCueReference;
    delete event.preCueReferenceCapturedAt;
  }

  deriveReference(app) {
    const player = app.race?.player;
    const sector = typeof app.activeSector === 'function' ? app.activeSector() : null;
    if (player && sector?.committed && sector.challenge?.layout?.positions?.[sector.choice]) {
      const target = sector.challenge.layout.positions[sector.choice];
      const vector = [target[0] - player.x, target[1] - player.y];
      if (magnitude(vector) > 2.5) {
        return { vector: normalize(vector), source: 'committed-corridor', eligible: true, stability: 1 };
      }
    }

    if (magnitude(this.intentVector) > 0.22 && this.intentStability > 0.16) {
      return {
        vector: normalize(this.intentVector),
        source: 'pre-switch-intent',
        eligible: true,
        stability: clamp(this.intentStability, 0, 1),
      };
    }

    if (player && Math.hypot(player.vx, player.vy) > 4.5) {
      return { vector: normalize([player.vx, player.vy]), source: 'trajectory', eligible: true, stability: 0.35 };
    }
    return { vector: [0, 0], source: 'insufficient-signal', eligible: false, stability: 0 };
  }

  recordCueTrace(event, raw, app, time) {
    if (!event?.cueStarted || event.activated) return;
    if (time - (event.preCueLastTraceAt ?? -Infinity) < 1 / 12) return;
    const player = app.race?.player;
    const sector = typeof app.activeSector === 'function' ? app.activeSector() : null;
    event.preCueTrace ||= [];
    event.preCueTrace.push({
      t: round(time - event.activationAt, 3),
      raw: raw.map((value) => round(value, 3)),
      mapped: applyControlMapping(this.currentMapping, raw).map((value) => round(value, 3)),
      position: player ? [round(player.x, 2), round(player.y, 2), round(player.z, 2)] : null,
      velocity: player ? [round(player.vx, 2), round(player.vy, 2), round(player.speed, 2)] : null,
      sector: sector ? sector.index + 1 : null,
      committed: Boolean(sector?.committed),
    });
    event.preCueLastTraceAt = time;
  }

  detectAnticipation(event, reference, oldMapping, newMapping) {
    if (!reference.eligible || !event.preCueTrace?.length) return null;
    let hold = 0;
    let previousTime = null;
    for (const sample of event.preCueTrace) {
      if (sample.t > 0 || magnitude(sample.raw) < 0.28) {
        hold = 0;
        previousTime = sample.t;
        continue;
      }
      const classification = classifyControlResponse({
        raw: sample.raw,
        reference: reference.vector,
        oldMapping,
        newMapping,
      });
      const delta = previousTime === null ? 0 : Math.max(0, sample.t - previousTime);
      hold = classification.correct ? hold + delta : 0;
      previousTime = sample.t;
      if (hold >= 0.15) {
        return {
          correct: true,
          leadTime: round(Math.max(0, -sample.t), 4),
          category: classification.category,
        };
      }
    }
    return { correct: false, leadTime: null, category: 'no-stable-predictive-compensation' };
  }

  activateEvent(event, app, time) {
    const oldMapping = this.currentMapping;
    const newMapping = getControlMapping(event.toId);
    const reference = event.preCueReference || this.deriveReference(app);
    const anticipation = this.detectAnticipation(event, reference, oldMapping, newMapping);
    const activeRecord = {
      index: event.index,
      signature: event.signature,
      fromId: event.fromId,
      toId: event.toId,
      family: event.family,
      complexity: event.complexity,
      compound: event.compound,
      scheduledAt: event.activationAt,
      activatedAt: round(time, 4),
      cueStartedAt: event.cueStartedAt ?? round(event.cueAt, 4),
      cueDuration: event.cueDuration,
      scheduledInterval: event.index === 0 ? event.activationAt : this.session.schedule[event.index - 1].intervalAfter,
      deferredBy: event.deferredBy,
      encoding: event.encoding,
      probes: {
        input: event.probes.input.map((vector) => vector.map((value) => round(value))),
        output: event.probes.output.map((vector) => vector.map((value) => round(value))),
      },
      reference: {
        vector: reference.vector.map((value) => round(value)),
        source: reference.source,
        eligible: reference.eligible,
        stability: round(reference.stability),
        capturedAt: event.preCueReferenceCapturedAt ?? round(time, 4),
      },
      anticipation,
      preCueTrace: event.preCueTrace || [],
      firstAction: null,
      recoveryTime: null,
      recoveryHold: 0,
      switchCost: null,
      costIntegral: 0,
      costDuration: 0,
      errorIntegral: 0,
      trace: [],
      finalized: false,
    };

    event.activated = true;
    this.currentMapping = newMapping;
    this.session.currentMappingId = newMapping.id;
    this.session.events.push(activeRecord);
    this.session.nextEventIndex += 1;
    this.session.persistentUntil = time + this.session.profile.persistentSeconds;

    this.ui?.cue?.classList.add('activating');
    setTimeout(() => this.ui?.cue?.classList.remove('activating'), 340);
    this.updateMini(event.probes, newMapping, true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('impulse-control-relation-change', {
        detail: { from: oldMapping.id, to: newMapping.id, family: newMapping.family, complexity: newMapping.complexity },
      }));
    }
  }

  currentActiveRecord() {
    return this.session?.events.at(-1) || null;
  }

  recordAdaptation({ raw, mapped, app, time, dt }) {
    const record = this.currentActiveRecord();
    if (!record || record.finalized) return;
    const elapsed = time - record.activatedAt;
    if (elapsed < -0.02 || elapsed > 4.5) {
      if (elapsed > 4.5) this.finalizeEvent(record);
      return;
    }

    const inputMagnitude = magnitude(raw);
    const reference = record.reference.vector;
    const eligible = record.reference.eligible;
    const outputAlignment = eligible && inputMagnitude > 0.08
      ? dot(normalize(mapped), normalize(reference))
      : null;

    if (!record.firstAction && inputMagnitude >= 0.28 && elapsed >= 0) {
      const classification = classifyControlResponse({
        raw,
        reference,
        oldMapping: record.fromId,
        newMapping: record.toId,
      });
      record.firstAction = {
        latency: round(elapsed, 4),
        raw: raw.map((value) => round(value)),
        mapped: mapped.map((value) => round(value)),
        ...classification,
      };
    }

    if (!record.firstAction && elapsed >= 1.2) {
      record.firstAction = {
        latency: null,
        raw: [0, 0],
        mapped: [0, 0],
        category: 'response-inhibition',
        correct: eligible ? false : null,
        outputAlignment: null,
        requiredAlignment: null,
        oldFrameAlignment: null,
      };
    }

    if (eligible && outputAlignment !== null && elapsed >= 0 && elapsed <= 2.4) {
      const cost = clamp(1 - outputAlignment, 0, 2);
      record.costIntegral += cost * dt;
      record.costDuration += dt;
      record.errorIntegral += cost * inputMagnitude * dt;
    }

    if (eligible && outputAlignment !== null && inputMagnitude >= 0.18 && elapsed >= 0) {
      if (outputAlignment >= 0.72) record.recoveryHold += dt;
      else record.recoveryHold = Math.max(0, record.recoveryHold - dt * 1.8);
      if (record.recoveryTime === null && record.recoveryHold >= 0.28) {
        record.recoveryTime = round(Math.max(0, elapsed - record.recoveryHold + 0.28), 4);
      }
    }

    if (time - this.session.lastTraceAt >= 1 / 12 && elapsed >= -record.cueDuration && elapsed <= 4.2) {
      const player = app.race?.player;
      const sector = typeof app.activeSector === 'function' ? app.activeSector() : null;
      record.trace.push({
        t: round(elapsed, 3),
        raw: raw.map((value) => round(value, 3)),
        mapped: mapped.map((value) => round(value, 3)),
        outputAlignment: outputAlignment === null ? null : round(outputAlignment, 3),
        position: player ? [round(player.x, 2), round(player.y, 2), round(player.z, 2)] : null,
        velocity: player ? [round(player.vx, 2), round(player.vy, 2), round(player.speed, 2)] : null,
        sector: sector ? sector.index + 1 : null,
        committed: Boolean(sector?.committed),
      });
      this.session.lastTraceAt = time;
    }

    if (elapsed >= 4.2) this.finalizeEvent(record);
  }

  finalizeEvent(record) {
    if (record.finalized) return;
    record.switchCost = record.costDuration > 0 ? round(record.costIntegral / record.costDuration, 4) : null;
    record.errorIntegral = round(record.errorIntegral, 4);
    delete record.costIntegral;
    delete record.costDuration;
    delete record.recoveryHold;
    record.finalized = true;
  }

  updateIntent(mapped, dt) {
    const inputMagnitude = magnitude(mapped);
    const activeRecord = this.currentActiveRecord();
    const recentlyChanged = activeRecord && !activeRecord.finalized && activeRecord.activatedAt !== null;
    if (inputMagnitude < 0.1 || (recentlyChanged && activeRecord.trace.length < 10)) return;
    const direction = normalize(mapped);
    const previous = normalize(this.intentVector);
    const agreement = magnitude(previous) > 0.1 ? clamp((dot(previous, direction) + 1) / 2, 0, 1) : 0.5;
    const blend = clamp(dt * 2.7, 0.02, 0.16);
    this.intentVector = mixVector(this.intentVector, direction, blend);
    this.intentStability = this.intentStability + (agreement - this.intentStability) * clamp(dt * 2.2, 0.02, 0.14);
  }

  setProbe(frame, selector, vector, radius = 22) {
    const element = frame?.querySelector(selector);
    if (!element) return;
    element.style.setProperty('--probe-x', `${round(vector[0] * radius, 2)}px`);
    element.style.setProperty('--probe-y', `${round(-vector[1] * radius, 2)}px`);
  }

  updateCue(event, time) {
    if (!this.ui?.cue) return;
    this.ui.system?.classList.remove('hidden');
    this.ui.cue.classList.add('visible', `encoding-${event.encoding}`);
    this.setProbe(this.ui.inputFrame, '.cr-probe-a', event.probes.input[0]);
    this.setProbe(this.ui.inputFrame, '.cr-probe-b', event.probes.input[1]);
    this.setProbe(this.ui.outputFrame, '.cr-probe-a', event.probes.output[0]);
    this.setProbe(this.ui.outputFrame, '.cr-probe-b', event.probes.output[1]);
    const progress = clamp((time - event.cueAt) / event.cueDuration, 0, 1);
    this.ui.countdown?.style.setProperty('--cue-progress', `${round(progress * 360, 2)}deg`);
    this.ui.cue.style.setProperty('--cue-phase', String(round(progress, 4)));
  }

  updateMini(probes, mapping, forceVisible) {
    if (!this.ui?.mini || !probes) return;
    this.setProbe(this.ui.miniInput, '.cr-probe-a', probes.input[0], 11);
    this.setProbe(this.ui.miniInput, '.cr-probe-b', probes.input[1], 11);
    const outputs = probes.input.map((vector) => applyControlMapping(mapping, vector));
    this.setProbe(this.ui.miniOutput, '.cr-probe-a', outputs[0], 11);
    this.setProbe(this.ui.miniOutput, '.cr-probe-b', outputs[1], 11);
    this.ui.mini.classList.toggle('hidden', !forceVisible);
  }

  updateInterface(app, time) {
    if (!this.session || !this.ui) return;
    const event = this.eventDue();
    const racing = app.state === 'racing';
    this.ui.system?.classList.toggle('hidden', !racing);
    if (!racing) {
      this.hideCue();
      this.ui.mini?.classList.add('hidden');
      return;
    }

    if (event?.cueStarted && time >= event.cueAt && !event.activated) this.updateCue(event, time);
    else this.hideCue();

    const showMini = time <= this.session.persistentUntil;
    this.ui.mini?.classList.toggle('hidden', !showMini);
  }

  visualState(time = Number(this.getApp()?.gameTime) || 0) {
    const event = this.eventDue();
    if (!this.session || !event?.cueStarted || event.activated || time < event.cueAt) return null;
    return {
      fromId: event.fromId,
      toId: event.toId,
      family: event.family,
      complexity: event.complexity,
      encoding: event.encoding,
      progress: clamp((time - event.cueAt) / event.cueDuration, 0, 1),
      probes: event.probes,
      secondsToActivation: Math.max(0, event.activationAt - time),
    };
  }

  context(time = Number(this.getApp()?.gameTime) || 0) {
    const active = this.currentActiveRecord();
    const next = this.eventDue();
    return {
      mappingId: this.currentMapping.id,
      family: this.currentMapping.family,
      complexity: this.currentMapping.complexity,
      switchIndex: active?.index ?? null,
      secondsSinceSwitch: active ? round(Math.max(0, time - active.activatedAt), 4) : null,
      cueActive: Boolean(next?.cueStarted && !next.activated && time >= next.cueAt),
      secondsToChange: next ? round(Math.max(0, next.activationAt - time), 4) : null,
      nextFamily: next?.family ?? null,
    };
  }

  process(axis) {
    const raw = vectorFromAxis(axis);
    const app = this.getApp();
    this.syncSession(app);
    if (!app || !this.session) return { x: raw[0], y: raw[1], meta: null };

    const time = Number(app.gameTime) || 0;
    const sampleTime = typeof performance !== 'undefined' ? performance.now() / 1000 : time;
    const dt = this.lastSampleTime === null ? 0 : clamp(sampleTime - this.lastSampleTime, 0, 0.05);
    this.lastSampleTime = sampleTime;

    if (app.state !== 'racing') {
      this.updateInterface(app, time);
      this.lastRaw = raw;
      this.lastMapped = raw;
      return { x: raw[0], y: raw[1], meta: { active: false, mapping: 'identity' } };
    }

    let event = this.eventDue();
    if (event && time >= event.cueAt && !event.cueStarted) {
      const delay = this.shouldDefer(app, event, time);
      if (delay > 0.05) {
        this.deferCurrentEvent(delay);
        event = this.eventDue();
      }
    }

    if (event && time >= event.cueAt && !event.cueStarted) {
      event.cueStarted = true;
      event.cueStartedAt = round(time, 4);
      event.preCueReference = this.deriveReference(app);
      event.preCueReferenceCapturedAt = round(time, 4);
      event.preCueTrace = [];
      event.preCueLastTraceAt = -Infinity;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('impulse-control-relation-cue', {
          detail: { activationAt: event.activationAt, cueDuration: event.cueDuration, complexity: event.complexity },
        }));
      }
    }

    if (event?.cueStarted && !event.activated) this.recordCueTrace(event, raw, app, time);

    if (event && time >= event.activationAt && !event.activated) {
      const delay = this.shouldDefer(app, event, time);
      if (delay > 0.05) {
        this.deferCurrentEvent(delay);
        event = this.eventDue();
      } else {
        this.activateEvent(event, app, time);
      }
    }

    const mapped = applyControlMapping(this.currentMapping, raw);
    this.recordAdaptation({ raw, mapped, app, time, dt });
    this.updateIntent(mapped, dt);
    this.updateInterface(app, time);
    this.lastRaw = raw;
    this.lastMapped = mapped;

    return {
      x: clamp(mapped[0], -1, 1),
      y: clamp(mapped[1], -1, 1),
      meta: {
        active: true,
        mapping: this.currentMapping.id,
        nextChangeAt: this.eventDue()?.activationAt ?? null,
        nextSignature: this.eventDue()?.signature ?? null,
      },
    };
  }

  summarize(session = this.session) {
    if (!session) return null;
    session.events.forEach((event) => this.finalizeEvent(event));
    const eligible = session.events.filter((event) => event.reference.eligible);
    const firstActions = eligible.filter((event) => event.firstAction?.correct !== null && event.firstAction);
    const correctActions = firstActions.filter((event) => event.firstAction.correct);
    const latencies = firstActions.map((event) => event.firstAction.latency).filter((value) => Number.isFinite(value));
    const recoveries = eligible.map((event) => event.recoveryTime).filter((value) => Number.isFinite(value));
    const switchCosts = eligible.map((event) => event.switchCost).filter((value) => Number.isFinite(value));
    const errorTopology = {};
    session.events.forEach((event) => {
      const category = event.firstAction?.category || 'no-response';
      errorTopology[category] = (errorTopology[category] || 0) + 1;
    });

    const firstActionAccuracy = firstActions.length ? correctActions.length / firstActions.length : null;
    const medianLatency = median(latencies);
    const medianRecovery = median(recoveries);
    const meanSwitchCost = mean(switchCosts);
    const transitionNovelty = session.events.length
      ? new Set(session.events.map((event) => event.signature)).size / session.events.length
      : null;
    const mappingCoverage = session.events.length
      ? new Set(session.events.map((event) => event.toId)).size / Math.min(CONTROL_MAPPINGS.length, session.events.length)
      : null;
    const adaptationSeries = eligible
      .map((event) => event.recoveryTime ?? event.firstAction?.latency)
      .filter((value) => Number.isFinite(value));
    const adaptationSlope = regressionSlope(adaptationSeries);
    const intervals = session.events.slice(1).map((event, index) => event.activatedAt - session.events[index].activatedAt);

    const anticipatoryEvents = eligible.filter((event) => event.anticipation?.correct);
    const anticipatoryRate = eligible.length ? anticipatoryEvents.length / eligible.length : null;
    const anticipationLeads = anticipatoryEvents.map((event) => event.anticipation.leadTime).filter((value) => Number.isFinite(value));
    const medianAnticipationLead = median(anticipationLeads);
    const measurementCoverage = session.events.length ? eligible.length / session.events.length : null;
    const evidenceQuality = mean([transitionNovelty, mappingCoverage, measurementCoverage].filter((value) => value !== null));

    const components = [
      { value: firstActionAccuracy, weight: 0.40 },
      { value: medianLatency === null ? null : clamp(1 - (medianLatency - 0.15) / 1.85, 0, 1), weight: 0.22 },
      { value: medianRecovery === null ? null : clamp(1 - medianRecovery / 2.8, 0, 1), weight: 0.22 },
      { value: meanSwitchCost === null ? null : clamp(1 - meanSwitchCost / 1.35, 0, 1), weight: 0.16 },
    ].filter((component) => component.value !== null);
    const componentWeight = components.reduce((sum, component) => sum + component.weight, 0);
    const score = eligible.length && componentWeight > 0
      ? Math.round((components.reduce((sum, component) => sum + component.value * component.weight, 0) / componentWeight) * 100)
      : null;

    return {
      score,
      switches: session.events.length,
      eligibleSwitches: eligible.length,
      firstActionAccuracy: firstActionAccuracy === null ? null : round(firstActionAccuracy),
      medianInferenceLatency: medianLatency === null ? null : round(medianLatency),
      medianRecoveryTime: medianRecovery === null ? null : round(medianRecovery),
      meanSwitchCost: meanSwitchCost === null ? null : round(meanSwitchCost),
      transitionNovelty: transitionNovelty === null ? null : round(transitionNovelty),
      mappingCoverage: mappingCoverage === null ? null : round(mappingCoverage),
      measurementCoverage: measurementCoverage === null ? null : round(measurementCoverage),
      evidenceQuality: evidenceQuality === null ? null : round(evidenceQuality),
      anticipatoryCompensationRate: anticipatoryRate === null ? null : round(anticipatoryRate),
      medianAnticipationLead: medianAnticipationLead === null ? null : round(medianAnticipationLead),
      adaptationSlope: adaptationSlope === null ? null : round(adaptationSlope),
      meanActualInterval: mean(intervals) === null ? null : round(mean(intervals)),
      intervalRange: intervals.length ? [round(Math.min(...intervals)), round(Math.max(...intervals))] : null,
      mappingExposure: Object.fromEntries(CONTROL_MAPPINGS.map((mapping) => [mapping.id, session.events.filter((event) => event.toId === mapping.id).length])),
      familyExposure: Object.fromEntries([...new Set(CONTROL_MAPPINGS.map((mapping) => mapping.family))].map((family) => [family, session.events.filter((event) => event.family === family).length])),
      errorTopology,
    };
  }

  renderResults(summary) {
    if (!this.ui || !summary) return;
    this.ui.results?.classList.remove('hidden');
    if (this.ui.resultScore) this.ui.resultScore.textContent = summary.score === null ? '—' : `${summary.score}%`;
    if (this.ui.resultFrameScore) this.ui.resultFrameScore.textContent = summary.score === null ? '—' : `${summary.score}%`;
    if (this.ui.resultSwitches) this.ui.resultSwitches.textContent = String(summary.switches);
    if (this.ui.resultFirstAction) this.ui.resultFirstAction.textContent = summary.firstActionAccuracy === null ? '—' : `${Math.round(summary.firstActionAccuracy * 100)}%`;
    if (this.ui.resultInference) this.ui.resultInference.textContent = summary.medianInferenceLatency === null ? '—' : `${summary.medianInferenceLatency.toFixed(2)} s`;
    if (this.ui.resultRecovery) this.ui.resultRecovery.textContent = summary.medianRecoveryTime === null ? '—' : `${summary.medianRecoveryTime.toFixed(2)} s`;
    if (this.ui.resultSwitchCost) this.ui.resultSwitchCost.textContent = summary.meanSwitchCost === null ? '—' : `${Math.round(summary.meanSwitchCost * 100)}%`;
    if (this.ui.resultNovelty) this.ui.resultNovelty.textContent = summary.transitionNovelty === null ? '—' : `${Math.round(summary.transitionNovelty * 100)}%`;
    if (this.ui.resultAdaptation) {
      if (summary.adaptationSlope === null) this.ui.resultAdaptation.textContent = '—';
      else if (summary.adaptationSlope < -0.04) this.ui.resultAdaptation.textContent = 'IMPROVING';
      else if (summary.adaptationSlope > 0.04) this.ui.resultAdaptation.textContent = 'COST RISING';
      else this.ui.resultAdaptation.textContent = 'STABLE';
    }
    if (this.ui.resultErrors) {
      const entries = Object.entries(summary.errorTopology).sort((left, right) => right[1] - left[1]);
      this.ui.resultErrors.innerHTML = entries.length
        ? entries.map(([category, count]) => `<span class="family-chip">${category.replaceAll('-', ' ')}: <b>${count}</b></span>`).join('')
        : '<span class="family-chip">no scored remaps</span>';
    }
  }

  persistSession(summary) {
    if (typeof localStorage === 'undefined' || !this.session) return;
    try {
      const stored = safeParse(localStorage.getItem(HISTORY_KEY), []);
      const history = Array.isArray(stored) ? stored : [];
      history.push({
        sessionId: this.session.sessionId,
        mode: this.session.mode,
        completedAt: this.session.completedAt,
        summary,
        signatures: this.session.events.map((event) => event.signature),
      });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-40)));
    } catch {
      // Storage may be unavailable in privacy-restricted browser contexts.
    }
  }

  finalizeSession(app) {
    if (!this.session || this.session.finalized) return;
    this.session.events.forEach((event) => this.finalizeEvent(event));
    this.session.completedAt = Date.now();
    this.session.finalized = true;
    const summary = this.summarize(this.session);
    this.session.summary = summary;
    this.lastSession = {
      ...this.session,
      schedule: this.session.schedule.map((event) => ({
        index: event.index,
        fromId: event.fromId,
        toId: event.toId,
        family: event.family,
        complexity: event.complexity,
        activationAt: event.activationAt,
        cueAt: event.cueAt,
        intervalAfter: event.intervalAfter,
        signature: event.signature,
        deferredBy: event.deferredBy,
      })),
      summary,
    };
    this.persistSession(summary);
    this.renderResults(summary);
    this.resultsRenderedFor = this.session.sessionId;
    this.hideCue();
    this.ui?.mini?.classList.add('hidden');
    if (app?.race) app.race.controlRelationSummary = summary;
  }

  snapshot() {
    const session = this.session || this.lastSession;
    if (!session) return null;
    const summary = session.summary || this.summarize(session);
    return {
      schema: 'dream-unity.impulse-run.control-relations.v1',
      sessionId: session.sessionId,
      raceSeed: session.raceSeed,
      mode: session.mode,
      profile: session.profile,
      summary,
      events: session.events,
      schedule: session.schedule.map((event) => ({
        index: event.index,
        fromId: event.fromId,
        toId: event.toId,
        family: event.family,
        complexity: event.complexity,
        compound: event.compound,
        activationAt: event.activationAt,
        cueAt: event.cueAt,
        cueDuration: event.cueDuration,
        intervalAfter: event.intervalAfter,
        signature: event.signature,
        deferredBy: event.deferredBy,
      })),
      notice: 'Control-frame measures are experimental in-game metrics, not a validated intelligence or clinical assessment.',
    };
  }
}

export const CONTROL_RELATION_INTERNALS = Object.freeze({
  mappings: CONTROL_MAPPINGS.length,
  probeDirections: PROBE_DIRECTIONS.length,
  simpleMappings: SIMPLE_MAPPING_IDS.length,
  compoundMappings: COMPOUND_MAPPING_IDS.length,
  hardMaxInterval: HARD_MAX_INTERVAL,
});
