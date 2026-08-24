/**
 * Impulse Run: endogenous relational-racing layer.
 * The race itself is the reasoning substrate: opponents, wakes, rotating frames,
 * formation geometry, timing and trajectory prediction determine thrust or drag.
 */
import './main.js';
import { clamp } from './relational.js';
import {
  WORLD_RELATION_VERSION, FAMILY_LABELS, ERROR_TOPOLOGY, CONTROL_FIELD_MAPPINGS,
  WorldPRNG, generateWorldSchedule, resolveWorldRelation, classifyCommit,
  relationAlignment, applyMapping, noveltyRate,
} from './world-relations.js';

const app = window.impulseRun;
if (!app) throw new Error('Endogenous relational-racing layer could not attach to Impulse Run.');

const WORLD_HISTORY_KEY = 'dream-unity-impulse-run-world-relations-v2';
const COURSE_WIDTH = 76;
const COURSE_MIN_Y = -36;
const COURSE_MAX_Y = 48;
const mappingById = new Map(CONTROL_FIELD_MAPPINGS.map((mapping) => [mapping.id, mapping]));
const identityMapping = mappingById.get('identity');
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const round3 = (value) => Number(value.toFixed(3));

function safeParse(text, fallback) {
  try { return JSON.parse(text) ?? fallback; } catch { return fallback; }
}
function norm(v) { const m = Math.hypot(v[0], v[1]) || 1; return [v[0] / m, v[1] / m]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
function inverseMapping(mapping, vector) {
  const [a, b, c, d] = mapping.matrix;
  return [a * vector[0] + c * vector[1], b * vector[0] + d * vector[1]];
}
function worldContext(instance) {
  return { player: instance.race?.player, racers: instance.race?.racers || [], time: instance.gameTime };
}
function eventAtZ(instance, z = instance.race?.player?.z ?? -Infinity, padding = 0) {
  return instance.race?.world?.events?.find((event) => z >= event.startZ - padding && z <= event.endZ + padding) || null;
}
function fieldEventAtZ(instance, z = instance.race?.player?.z ?? -Infinity) {
  const event = eventAtZ(instance, z, 0);
  if (!event || event.family !== 'moving-frame') return null;
  return z >= event.fieldEntryZ && z <= event.fieldExitZ ? event : null;
}
function projectedPosition(player, gateZ) {
  const horizon = clamp((gateZ - player.z) / Math.max(24, player.speed), 0, 2.2);
  return [
    clamp(player.x + player.vx * horizon * 0.72, -COURSE_WIDTH, COURSE_WIDTH),
    clamp(player.y + player.vy * horizon * 0.72, COURSE_MIN_Y, COURSE_MAX_Y),
  ];
}

function updateMenuCopy() {
  const subtitle = document.querySelector('.menu-subtitle');
  const copy = document.querySelector('.menu-copy');
  if (subtitle) subtitle.textContent = 'Read the race → predict the relation → commit a flight line → convert reasoning into speed.';
  if (copy) copy.textContent = 'No picture puzzles. Opponents, wakes, rotating structures, formations, reference frames and timing create the relational problem inside the race itself. Correct relational trajectories build thrust and overtaking momentum; wrong models create drag and let the field pull away.';
  document.querySelectorAll('.control-strip span').forEach((span, index) => {
    if (index === 2) span.innerHTML = '<b>RELATIONAL FLIGHT</b> control remapping occurs only inside visible moving-frame fields; the environment itself specifies the transformed control-to-motion relation';
  });
}

function initializeWorld(instance) {
  const race = instance.race;
  if (!race) return;
  const avoided = safeParse(localStorage.getItem(WORLD_HISTORY_KEY), []);
  const events = generateWorldSchedule({ seed: race.seed, count: race.sectors.length, mode: instance.mode, sectors: race.sectors });
  const recent = new Set(Array.isArray(avoided) ? avoided.slice(-180) : []);
  events.forEach((event, index) => {
    if (recent.has(event.signature)) event.signature += `:novel-${index}-${Math.round(instance.worldTime * 1000) % 997}`;
  });
  race.records = [];
  race.lastCheckpoint = -1;
  race.reasoningDrive = 0;
  race.reasoningStreak = 0;
  race.world = {
    version: WORLD_RELATION_VERSION,
    events,
    controlEvents: [],
    activeControlEvent: null,
    lastControlMappingId: 'identity',
    engineImpulses: [],
    familyExposure: {},
    startedAt: Date.now(),
  };
  instance.ui.challengeBeacon.classList.add('hidden');
  instance.ui.feedback.classList.add('hidden');
  document.querySelector('#controlRelationSystem')?.classList.add('hidden');
  document.querySelector('#controlRelationResults')?.classList.add('hidden');
}

function recordWorldHistory(instance) {
  const signatures = instance.race?.world?.events?.map((event) => event.signature) || [];
  if (!signatures.length) return;
  const old = safeParse(localStorage.getItem(WORLD_HISTORY_KEY), []);
  localStorage.setItem(WORLD_HISTORY_KEY, JSON.stringify([...(Array.isArray(old) ? old : []), ...signatures].slice(-240)));
}

function trackInference(instance, event, dt, relation) {
  if (event.seenAt === null) event.seenAt = instance.gameTime;
  const player = instance.race.player;
  const alignment = relationAlignment(player, relation.target);
  event.lastAlignment = alignment;
  if (alignment >= 0.58) event.lockHold += dt;
  else event.lockHold = Math.max(0, event.lockHold - dt * 1.8);
  if (event.inferenceAt === null && event.lockHold >= 0.22) event.inferenceAt = instance.gameTime;
  event.pathErrorIntegral += Math.hypot(player.x - relation.target[0], player.y - relation.target[1]) * dt;
  event.pathSamples += 1;
}

function commitEvent(instance, event) {
  if (event.committed) return;
  const race = instance.race;
  const player = race.player;
  const relation = resolveWorldRelation(event, worldContext(instance));
  const projected = projectedPosition(player, event.gateZ);
  const radius = instance.mode === 'training' ? 23 : instance.mode === 'transfer' ? 17 : 19.5;
  const classification = classifyCommit({
    position: projected,
    target: relation.target,
    alternatives: relation.alternatives,
    correctRadius: radius,
    margin: instance.mode === 'training' ? 0.8 : 2.2,
  });
  event.committed = true;
  event.commitTime = instance.gameTime;
  event.commitPosition = projected;
  event.targetAtCommit = relation.target;
  event.relationAtCommit = relation;
  event.relationalCorrect = classification.correct;
  event.errorModel = classification.correct ? null : classification.nearestAlternative;
  event.commitClassification = classification;
  event.decisionTime = Math.max(0, (event.inferenceAt ?? instance.gameTime) - (event.seenAt ?? instance.gameTime));
  event.controlContextAtCommit = race.world.activeControlEvent?.index === event.index ? race.world.lastControlMappingId : 'identity';
  race.reasoningDrive = clamp(race.reasoningDrive + (event.relationalCorrect ? 0.025 : -0.025), -0.42, 0.48);
  instance.audio.cue('gate');
}

function executeEvent(instance, event) {
  if (event.executed) return;
  const race = instance.race;
  const player = race.player;
  if (!event.committed) commitEvent(instance, event);
  const consistencyDistance = Math.hypot(player.x - event.commitPosition[0], player.y - event.commitPosition[1]);
  const motorPrecision = clamp(1 - consistencyDistance / 27, 0, 1);
  const liveRelation = resolveWorldRelation(event, worldContext(instance));
  const liveTargetDistance = Math.hypot(player.x - liveRelation.target[0], player.y - liveRelation.target[1]);
  const dynamicTracking = clamp(1 - liveTargetDistance / 34, 0, 1);
  const executionQuality = clamp(motorPrecision * 0.7 + dynamicTracking * 0.3, 0, 1);
  event.executed = true;
  event.executeTime = instance.gameTime;
  event.motorDistance = consistencyDistance;
  event.motorPrecision = executionQuality;
  event.liveTargetDistance = liveTargetDistance;
  event.controlContextAtGate = race.world.activeControlEvent?.index === event.index ? race.world.lastControlMappingId : 'identity';

  if (event.relationalCorrect) {
    race.reasoningStreak += 1;
    const streakBonus = Math.min(8, race.reasoningStreak * 1.35);
    race.reasoningDrive = clamp(race.reasoningDrive + 0.075 + executionQuality * 0.025, -0.42, 0.48);
    const impulse = 7 + executionQuality * 13 + streakBonus;
    player.speed = clamp(player.speed + impulse, 18, race.config.baseSpeed * 1.68);
    player.boost = clamp(player.boost + 0.10 + executionQuality * 0.13, 0, 1);
    race.world.engineImpulses.push({ t: instance.gameTime, sector: event.index + 1, type: 'thrust', amount: impulse });
    instance.audio.cue('boost');
  } else {
    race.reasoningStreak = 0;
    race.reasoningDrive = clamp(race.reasoningDrive - 0.105, -0.42, 0.48);
    const drag = 0.88 - (1 - executionQuality) * 0.05;
    player.speed = Math.max(18, player.speed * drag);
    player.boost = Math.max(0, player.boost - 0.09);
    race.world.engineImpulses.push({ t: instance.gameTime, sector: event.index + 1, type: 'drag', amount: round3(1 - drag) });
    instance.audio.cue('incorrect');
  }

  race.lastCheckpoint = event.index;
  race.world.familyExposure[event.family] = (race.world.familyExposure[event.family] || 0) + 1;
  race.records.push({
    sector: event.index + 1,
    seed: `${race.seed}:world:${event.index}`,
    level: Math.min(10, 1 + event.index + (event.compositionDepth || 1)),
    family: FAMILY_LABELS[event.family] || event.family,
    rawFamily: event.family,
    noveltySignature: event.signature,
    relationalCorrect: event.relationalCorrect,
    decisionTime: event.decisionTime,
    chosenErrorModel: event.errorModel ? (ERROR_TOPOLOGY[event.errorModel] || event.errorModel) : null,
    commitPosition: event.commitPosition,
    correctTarget: event.targetAtCommit,
    targetDistanceAtCommit: event.commitClassification?.targetDistance,
    confidenceMargin: event.commitClassification?.confidenceMargin,
    motorDistance: consistencyDistance,
    motorPrecision: executionQuality,
    dynamicTracking,
    gateHit: executionQuality >= 0.38,
    speedAtGate: player.speed,
    reasoningDriveAfter: race.reasoningDrive,
    streakAfter: race.reasoningStreak,
    controlContextAtCommit: event.controlContextAtCommit,
    controlContextAtGate: event.controlContextAtGate,
    references: event.relationAtCommit?.references || [],
    temporalOpenAtCommit: event.relationAtCommit?.temporalOpen ?? true,
    timestamp: Date.now(),
  });
}

function updateWorldState(instance) {
  const race = instance.race;
  if (!race?.world) return;
  const player = race.player;
  const event = eventAtZ(instance, player.z, 80);
  instance.ui.challengeBeacon.classList.add('hidden');
  if (!event) return;
  const dt = clamp(instance.gameTime - (event.lastUpdateAt ?? instance.gameTime), 0, 0.05);
  event.lastUpdateAt = instance.gameTime;
  if (player.z >= event.evidenceZ && !event.executed) trackInference(instance, event, dt, resolveWorldRelation(event, worldContext(instance)));
  if (!event.committed && player.z >= event.commitZ) commitEvent(instance, event);
  if (!event.executed && player.z >= event.gateZ) executeEvent(instance, event);
}

function installControlFieldProcessor(instance) {
  const controller = instance.input.controlRelations;
  if (!controller) return;
  controller.hideAll?.();
  controller.visualState = () => null;
  controller.process = ({ x, y }) => {
    const race = instance.race;
    const raw = [clamp(Number(x) || 0, -1, 1), clamp(Number(y) || 0, -1, 1)];
    if (!race?.world || !['racing', 'countdown'].includes(instance.state)) {
      return { x: raw[0], y: raw[1], meta: { mappingId: 'identity', source: 'world-field', active: false, raw } };
    }
    const field = fieldEventAtZ(instance);
    const mapping = field ? (mappingById.get(field.controlMappingId) || identityMapping) : identityMapping;
    const mapped = applyMapping(mapping, raw);
    const previous = race.world.lastControlMappingId;
    race.world.lastControlMappingId = mapping.id;
    race.world.activeControlEvent = field;
    if (field && !field.controlEnteredAt) {
      field.controlEnteredAt = instance.gameTime;
      field.controlFirstAction = null;
      field.controlRecoveryAt = null;
      field.controlSamples = [];
      race.world.controlEvents.push({ sector: field.index + 1, mappingId: mapping.id, enteredAt: instance.gameTime, fromId: previous });
    }
    if (field && Math.hypot(...raw) > 0.22) {
      const relation = resolveWorldRelation(field, worldContext(instance));
      const desiredWorld = norm([relation.target[0] - race.player.x, relation.target[1] - race.player.y]);
      const expectedRaw = norm(inverseMapping(mapping, desiredWorld));
      const rawNorm = norm(raw);
      const compensation = dot(rawNorm, expectedRaw);
      const oldFrame = dot(rawNorm, desiredWorld);
      field.controlSamples.push({ t: instance.gameTime, compensation: round3(compensation), oldFrameAlignment: round3(oldFrame), raw: raw.map(round3), mapped: mapped.map(round3) });
      if (!field.controlFirstAction) {
        field.controlFirstAction = {
          latency: instance.gameTime - field.controlEnteredAt,
          correct: compensation >= 0.6,
          category: compensation >= 0.6 ? 'correct-compensation' : oldFrame >= 0.68 ? 'old-frame-perseveration' : 'exploratory',
        };
      }
      if (!field.controlRecoveryAt && compensation >= 0.65) field.controlRecoveryAt = instance.gameTime;
    }
    return {
      x: clamp(mapped[0], -1, 1), y: clamp(mapped[1], -1, 1),
      meta: { mappingId: mapping.id, source: field ? 'moving-frame-field' : 'normal-flight', active: Boolean(field), sector: field ? field.index + 1 : null, raw },
    };
  };
  controller.snapshot = () => {
    const race = instance.race;
    if (!race?.world) return null;
    const fields = race.world.events.filter((event) => event.family === 'moving-frame' && event.controlEnteredAt);
    return {
      schema: 'dream-unity.impulse-run.environmental-control-fields.v2',
      source: 'race-world-not-timed-schedule',
      fields: fields.map((event) => ({
        sector: event.index + 1,
        mappingId: event.controlMappingId,
        firstAction: event.controlFirstAction,
        recovery: event.controlRecoveryAt ? event.controlRecoveryAt - event.controlEnteredAt : null,
        samples: event.controlSamples?.length || 0,
      })),
    };
  };
}

function drawWake(renderer, racer, color, length = 115, alpha = 0.26) {
  if (!racer) return;
  const lateralVelocity = [racer.vx || 0, racer.vy || 0];
  const segments = 7;
  for (let i = 0; i < segments; i += 1) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const a = [racer.x - lateralVelocity[0] * t0 * 0.35, racer.y - lateralVelocity[1] * t0 * 0.35, racer.z - length * t0];
    const b = [racer.x - lateralVelocity[0] * t1 * 0.35, racer.y - lateralVelocity[1] * t1 * 0.35, racer.z - length * t1];
    renderer.drawBar(a, b, 0.07 + (1 - t0) * 0.05, color, { alpha: alpha * (1 - t0 * 0.76), emissive: 1, additive: true, depthWrite: false });
  }
}

function drawRotor(instance, event, relation, alpha = 0.7) {
  const r = instance.renderer;
  const z = event.gateZ - 34;
  const center = [0, 5, z];
  r.glow('torus', { position: center, scale: [event.radius + 13, event.radius + 13, 1.4], color: '#7b8cff', alpha: alpha * 0.38, emissive: 1 }, 0.16, 1.09);
  r.draw('torus', { position: center, scale: [event.radius + 13, event.radius + 13, 1.4], color: '#7b8cff', alpha: alpha * 0.31, emissive: 0.8 });
  const angle = relation.rotorAngle;
  for (let arm = 0; arm < 4; arm += 1) {
    const a = angle + arm * Math.PI / 2;
    const end = [Math.cos(a) * (event.radius + 9), 5 + Math.sin(a) * (event.radius + 9), z];
    r.drawBar(center, end, 0.18, arm % 2 ? '#55f7ff' : '#9b7cff', { alpha: alpha * 0.42, emissive: 1 });
  }
  r.draw('cube', { position: [0, 5, z], scale: [3.2, 3.2, 14], color: '#182d4a', alpha: 0.82, emissive: 0.12 });
}

function drawMovingField(instance, event) {
  const r = instance.renderer;
  const mapping = mappingById.get(event.controlMappingId) || identityMapping;
  const [a, b, c, d] = mapping.matrix;
  const xAxis = norm([a, c]);
  const yAxis = norm([b, d]);
  for (let z = event.fieldEntryZ; z <= event.fieldExitZ; z += 52) {
    const pulse = 1 + Math.sin(instance.worldTime * 2.2 + z * 0.02) * 0.025;
    r.draw('torus', { position: [0, 4, z], scale: [52 * pulse, 43 * pulse, 1.05], color: '#7788ff', alpha: 0.24, emissive: 0.9 });
    const center = [0, 4, z + 0.4];
    r.drawBar(center, [xAxis[0] * 42, 4 + xAxis[1] * 34, z + 0.4], 0.08, '#55f7ff', { alpha: 0.32, emissive: 1 });
    r.drawBar(center, [yAxis[0] * 34, 4 + yAxis[1] * 28, z + 0.4], 0.08, '#ffd166', { alpha: 0.32, emissive: 1 });
  }
  if (event.reflected) {
    for (let i = 0; i < 5; i += 1) {
      const phase = (instance.worldTime * 0.55 + i / 5) % 1;
      r.glow('octa', { position: [-44 + phase * 88, 31 - i * 6, event.fieldEntryZ + 75 + i * 26], scale: [0.7, 0.7, 0.7], color: '#ff4fd8', alpha: 0.4, emissive: 1 }, 0.18, 1.35);
    }
  }
}

function drawTemporal(instance, event, relation) {
  const r = instance.renderer;
  const z1 = event.startZ + 155;
  const z2 = event.gateZ - 25;
  const color = relation.temporalOpen ? '#75ff9b' : '#9b7cff';
  r.drawBar([-68, COURSE_MIN_Y + 3, z1], [68, COURSE_MIN_Y + 3, z1], 0.16, '#55f7ff', { alpha: 0.34, emissive: 1 });
  r.drawBar([-68, COURSE_MIN_Y + 3, z2], [68, COURSE_MIN_Y + 3, z2], 0.16, '#ff4fd8', { alpha: 0.34, emissive: 1 });
  const pulse = 1 + Math.sin(instance.worldTime * 4.2) * 0.04;
  r.glow('torus', { position: [0, 4, (z1 + z2) / 2], scale: [58 * pulse, 45 * pulse, 1], color, alpha: 0.2, emissive: 1 }, 0.13, 1.08);
}

function drawFormation(instance, relation) {
  const r = instance.renderer;
  const refs = relation.primaryRacers;
  if (!refs?.length) return;
  for (let i = 0; i < Math.min(3, refs.length); i += 1) {
    const a = refs[i]; const b = refs[(i + 1) % Math.min(3, refs.length)];
    if (!a || !b) continue;
    r.drawBar([a.x, a.y, a.z], [b.x, b.y, b.z], 0.06, i % 2 ? '#9b7cff' : '#55f7ff', { alpha: 0.17, emissive: 1, additive: true, depthWrite: false });
  }
}

function drawCommittedConsequence(instance, event, relation) {
  if (!event.committed) return;
  const r = instance.renderer;
  const target = event.targetAtCommit || relation.target;
  const alpha = event.executed ? 0.08 : 0.2;
  for (let i = 0; i < 6; i += 1) {
    const z0 = event.commitZ + i * ((event.gateZ - event.commitZ) / 6);
    const z1 = event.commitZ + (i + 1) * ((event.gateZ - event.commitZ) / 6);
    const sway = Math.sin(instance.worldTime * 2.6 + i) * 0.7;
    r.drawBar([target[0] + sway, target[1], z0], [target[0] - sway, target[1], z1], 0.11, event.relationalCorrect ? '#55f7ff' : '#8a7bd1', { alpha, emissive: 1, additive: true, depthWrite: false });
  }
}

function renderWorldEvent(instance, event) {
  const relation = resolveWorldRelation(event, worldContext(instance));
  const r = instance.renderer;
  if (event.family === 'slipstream-intercept') drawWake(r, relation.primaryRacers[0], '#55f7ff', 140, 0.32);
  else if (event.family === 'wake-intersection') {
    drawWake(r, relation.primaryRacers[0], '#55f7ff', 145, 0.28);
    drawWake(r, relation.primaryRacers[1], '#9b7cff', 145, 0.28);
  } else if (event.family === 'rotor-relative') drawRotor(instance, event, relation, 0.84);
  else if (event.family === 'formation-mirror') { drawFormation(instance, relation); drawWake(r, relation.leader, '#55f7ff', 95, 0.19); }
  else if (event.family === 'moving-frame') drawMovingField(instance, event);
  else if (event.family === 'temporal-window') {
    drawTemporal(instance, event, relation);
    drawWake(r, relation.primaryRacers[0], '#55f7ff', 95, 0.18);
    drawWake(r, relation.primaryRacers[1], '#9b7cff', 95, 0.18);
  } else if (event.family === 'role-switch') { drawFormation(instance, relation); drawWake(r, relation.leader, '#ffd166', 100, 0.17); }
  else {
    drawRotor(instance, event, relation, 0.52);
    drawWake(r, relation.primaryRacers[0], '#55f7ff', 100, 0.19);
    drawWake(r, relation.primaryRacers[1], '#9b7cff', 100, 0.19);
  }
  for (const x of [-42, 0, 42]) {
    r.drawBar([x, COURSE_MIN_Y + 2, event.gateZ - 22], [x, COURSE_MAX_Y - 2, event.gateZ + 22], 0.055, '#526985', { alpha: 0.08, emissive: 0.4, depthWrite: false });
  }
  drawCommittedConsequence(instance, event, relation);
}

function installRuntimePatches(instance) {
  updateMenuCopy();
  installControlFieldProcessor(instance);
  const baseStartRace = instance.startRace.bind(instance);
  const baseReturnToMenu = instance.returnToMenu.bind(instance);
  const baseUpdatePlayer = instance.updatePlayer.bind(instance);
  const baseUpdateAi = instance.updateAi.bind(instance);
  const baseFinishRace = instance.finishRace.bind(instance);
  const baseUpdateHud = instance.updateHud.bind(instance);

  instance.startRace = function startWorldRace(mode) { baseStartRace(mode); initializeWorld(this); };
  instance.returnToMenu = function returnWorldMenu() {
    if (this.race?.world) recordWorldHistory(this);
    baseReturnToMenu();
    document.querySelector('#controlRelationSystem')?.classList.add('hidden');
  };
  instance.activeSector = function noLegacySector() { return null; };
  instance.ensureChallenges = function noLegacyChallengeGeneration() {};
  instance.updateChallengeState = function updateEndogenousRelations() { updateWorldState(this); };
  instance.renderControlFrameHologram = function noAbstractControlHologram() {};
  instance.updateBoosts = function noInvisiblePickupBoosts() {};

  instance.updatePlayer = function updateReasoningPoweredFlight(dt, input, prestart) {
    this.worldLastInput = input;
    baseUpdatePlayer(dt, input, prestart);
    if (!prestart && this.race?.world) {
      this.race.player.speed = clamp(this.race.player.speed + (this.race.reasoningDrive || 0) * 78 * dt, 18, this.race.config.baseSpeed * 1.68);
    }
  };

  instance.updateAi = function updateReasoningAis(dt) {
    baseUpdateAi(dt);
    const race = this.race;
    if (!race?.world || this.state === 'countdown') return;
    const event = eventAtZ(this, race.player.z, 60);
    if (!event || !event.committed || event.executed) return;
    const relation = resolveWorldRelation(event, worldContext(this));
    for (const ai of race.racers) {
      event.aiStates[ai.id] ||= (() => {
        const rng = new WorldPRNG(`${race.seed}:world:${event.index}:ai:${ai.id}`);
        const correct = rng.next() < ai.skill;
        const alternative = relation.alternatives[Math.floor(rng.next() * relation.alternatives.length)] || relation.alternatives[0];
        return { correct, reactionAt: this.gameTime + 0.22 + (1 - ai.skill) * 1.35 + rng.next() * 0.25, target: correct ? [...relation.target] : [...alternative.point], scored: false };
      })();
      const state = event.aiStates[ai.id];
      if (this.gameTime >= state.reactionAt && ai.z <= event.gateZ + 35) {
        ai.vx += (state.target[0] - ai.x) * 0.85 * dt;
        ai.vy += (state.target[1] - ai.y) * 0.8 * dt;
      }
      if (!state.scored && ai.z >= event.gateZ) {
        state.scored = true;
        if (state.correct) ai.speed += 6 + ai.skill * 10;
        else ai.speed *= 0.86;
      }
    }
  };

  instance.renderRaceObjects = function renderEndogenousWorld() {
    const race = this.race;
    const playerZ = race.player.z;
    for (const event of race.world?.events || []) {
      if (event.endZ < playerZ - 120 || event.startZ > playerZ + 900) continue;
      renderWorldEvent(this, event);
    }
    for (const obstacle of race.obstacles) {
      if (obstacle.z < playerZ - 50 || obstacle.z > playerZ + 760 || obstacle.hit) continue;
      this.renderObstacle(obstacle);
    }
    if (race.finishZ < playerZ + 900) this.renderFinishGate(race.finishZ);
  };

  instance.updateHud = function updateWorldHud() {
    baseUpdateHud();
    if (!this.race?.world) return;
    const records = this.race.records;
    const relation = records.length ? records.filter((record) => record.relationalCorrect).length / records.length : null;
    const pilot = records.length ? average(records.map((record) => record.motorPrecision)) : null;
    this.ui.relationValue.textContent = relation === null ? '—' : `${Math.round(relation * 100)}%`;
    this.ui.pilotValue.textContent = pilot === null ? '—' : `${Math.round(pilot * 100)}%`;
  };

  instance.finishRace = function finishWorldRace() {
    if (this.race?.world) recordWorldHistory(this);
    baseFinishRace();
    const section = document.querySelector('#controlRelationResults');
    if (section) section.classList.remove('hidden');
    const fields = this.race?.world?.events?.filter((event) => event.family === 'moving-frame' && event.controlEnteredAt) || [];
    const first = fields.filter((event) => event.controlFirstAction).map((event) => event.controlFirstAction.correct ? 1 : 0);
    const latency = fields.filter((event) => event.controlFirstAction).map((event) => event.controlFirstAction.latency);
    const recovery = fields.filter((event) => event.controlRecoveryAt).map((event) => event.controlRecoveryAt - event.controlEnteredAt);
    const set = (selector, value) => { const el = document.querySelector(selector); if (el) el.textContent = value; };
    set('#resultControlRelation', fields.length ? `${Math.round(average(first) * 100)}%` : '—');
    set('#controlFrameScore', fields.length ? `${Math.round(average(first) * 100)}%` : '—');
    set('#controlSwitches', String(fields.length));
    set('#controlFirstAction', first.length ? `${Math.round(average(first) * 100)}%` : '—');
    set('#controlInferenceLatency', latency.length ? `${average(latency).toFixed(2)} s` : '—');
    set('#controlRecovery', recovery.length ? `${average(recovery).toFixed(2)} s` : '—');
    set('#controlSwitchCost', 'WORLD-COUPLED');
    set('#controlTransitionNovelty', `${Math.round(noveltyRate(this.race.world.events) * 100)}%`);
    set('#controlAdaptation', 'ENVIRONMENTAL');
    const errors = fields.flatMap((event) => event.controlFirstAction && !event.controlFirstAction.correct ? [event.controlFirstAction.category] : []);
    const topology = document.querySelector('#controlErrorTopology');
    if (topology) topology.innerHTML = errors.length ? [...new Set(errors)].map((error) => `<span class="family-chip">${error}</span>`).join('') : '<span class="family-chip">no dominant control-frame error</span>';
  };

  const installExport = () => {
    instance.exportTelemetry = function exportWorldTelemetry() {
      if (!this.race) return;
      const payload = {
        schema: 'dream-unity.impulse-run.endogenous-relational-racing.v2',
        exportedAt: new Date().toISOString(),
        session: { mode: this.mode, seed: this.race.seed, durationSeconds: this.gameTime, finalRank: this.race.finalRank, collisions: this.race.collisions, reasoningDrive: this.race.reasoningDrive, results: this.computeResults() },
        relationalTrajectoryRecords: this.race.records,
        environmentalControlFields: this.input.controlRelations?.snapshot?.() || null,
        engineConsequences: this.race.world?.engineImpulses || [],
        worldSchedule: this.race.world?.events?.map((event) => ({ sector: event.index + 1, family: event.family, signature: event.signature, relationalCorrect: event.relationalCorrect ?? null, errorModel: event.errorModel ?? null })) || [],
        notice: 'Experimental game telemetry. It does not establish IQ, general-intelligence transfer or clinical validity.',
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `impulse-run-world-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    };
  };
  installExport();
  setTimeout(installExport, 180);
}

installRuntimePatches(app);
