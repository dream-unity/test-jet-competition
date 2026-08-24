/**
 * Endogenous relational-racing model for Impulse Run.
 *
 * This module contains only deterministic geometry / generation logic so it can
 * be stress-tested without a DOM. The player never sees a symbolic premise or
 * an A:B::C:? panel. Relations are encoded by racers, wakes, moving frames,
 * rotating structures, timing windows and trajectories in the race world.
 */

export const WORLD_RELATION_VERSION = '2.0.0';

export const WORLD_FAMILIES = Object.freeze([
  'slipstream-intercept',
  'wake-intersection',
  'rotor-relative',
  'formation-mirror',
  'moving-frame',
  'temporal-window',
  'composed-intercept',
  'role-switch',
]);

export const FAMILY_LABELS = Object.freeze({
  'slipstream-intercept': 'SLIPSTREAM INTERCEPT',
  'wake-intersection': 'WAKE INTERSECTION',
  'rotor-relative': 'ROTATING FRAME',
  'formation-mirror': 'FORMATION GEOMETRY',
  'moving-frame': 'MOVING REFERENCE FRAME',
  'temporal-window': 'TEMPORAL INTERCEPT',
  'composed-intercept': 'COMPOSED TRAJECTORY',
  'role-switch': 'COMPETITIVE ROLE SHIFT',
});

export const ERROR_TOPOLOGY = Object.freeze({
  'current-state': 'reacted to current rather than future position',
  'inverse-relation': 'reversed the operative relation',
  'absolute-frame': 'used world coordinates instead of the moving frame',
  'stale-reference': 'tracked an obsolete competitor/reference',
  'single-source': 'followed one racer instead of the relation between racers',
  'partial-composition': 'solved only one stage of a composed relation',
  'timing-order': 'misread the temporal ordering window',
  'surface-route': 'followed the visually simplest route',
});

export const CONTROL_FIELD_MAPPINGS = Object.freeze([
  Object.freeze({ id: 'identity', matrix: Object.freeze([1, 0, 0, 1]) }),
  Object.freeze({ id: 'mirror-x', matrix: Object.freeze([-1, 0, 0, 1]) }),
  Object.freeze({ id: 'mirror-y', matrix: Object.freeze([1, 0, 0, -1]) }),
  Object.freeze({ id: 'half-turn', matrix: Object.freeze([-1, 0, 0, -1]) }),
  Object.freeze({ id: 'quarter-right', matrix: Object.freeze([0, 1, -1, 0]) }),
  Object.freeze({ id: 'quarter-left', matrix: Object.freeze([0, -1, 1, 0]) }),
  Object.freeze({ id: 'swap-diagonal', matrix: Object.freeze([0, 1, 1, 0]) }),
  Object.freeze({ id: 'swap-antidiagonal', matrix: Object.freeze([0, -1, -1, 0]) }),
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 4) => Number(value.toFixed(digits));
const mag = (v) => Math.hypot(v[0], v[1]);
const norm = (v) => {
  const m = mag(v) || 1;
  return [v[0] / m, v[1] / m];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const scale = (v, s) => [v[0] * s, v[1] * s];
const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

export function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
}

export class WorldPRNG {
  constructor(seed = 'world-relations') {
    this.state = hashSeed(seed) || 0x6d2b79f5;
  }
  next() {
    let t = this.state += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.state = t >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  pick(items) { return items[Math.floor(this.next() * items.length)]; }
  bool(p = 0.5) { return this.next() < p; }
  shuffle(items) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

export function rotate2(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

export function reflectAcrossAxis(point, origin, axis) {
  const u = norm(axis);
  const local = sub(point, origin);
  const projected = scale(u, dot(local, u));
  const perpendicular = sub(local, projected);
  return add(origin, sub(projected, perpendicular));
}

export function applyMapping(mapping, vector) {
  const matrix = typeof mapping === 'string'
    ? CONTROL_FIELD_MAPPINGS.find((item) => item.id === mapping)?.matrix
    : mapping?.matrix || mapping;
  const [a, b, c, d] = matrix || [1, 0, 0, 1];
  return [a * vector[0] + b * vector[1], c * vector[0] + d * vector[1]];
}

export function mappingForQuarterTurns(turns, reflected = false) {
  const q = ((turns % 4) + 4) % 4;
  if (reflected) {
    return [
      CONTROL_FIELD_MAPPINGS[1],
      CONTROL_FIELD_MAPPINGS[6],
      CONTROL_FIELD_MAPPINGS[2],
      CONTROL_FIELD_MAPPINGS[7],
    ][q];
  }
  return [
    CONTROL_FIELD_MAPPINGS[0],
    CONTROL_FIELD_MAPPINGS[5],
    CONTROL_FIELD_MAPPINGS[3],
    CONTROL_FIELD_MAPPINGS[4],
  ][q];
}

function modeDifficulty(mode) {
  if (mode === 'training') return 0.72;
  if (mode === 'assessment') return 1.0;
  if (mode === 'transfer') return 1.22;
  return 0.95;
}

/**
 * Generate a structurally varied schedule. Geometry, roles and sign are all
 * counterbalanced; no colour or absolute side is predictive of the solution.
 */
export function generateWorldSchedule({ seed, count, mode = 'grand-prix', sectors = [] } = {}) {
  const rng = new WorldPRNG(`${seed}:${mode}:endogenous-world`);
  const difficulty = modeDifficulty(mode);
  const simple = ['slipstream-intercept', 'rotor-relative', 'formation-mirror'];
  const dynamic = ['wake-intersection', 'moving-frame', 'temporal-window', 'role-switch'];
  const advanced = ['composed-intercept', 'moving-frame', 'wake-intersection', 'role-switch'];
  const schedule = [];
  let previousFamily = '';
  let previousSignature = '';

  for (let index = 0; index < count; index += 1) {
    const progress = count <= 1 ? 1 : index / (count - 1);
    let pool = progress < 0.25 ? simple : progress < 0.6 ? [...simple, ...dynamic] : [...dynamic, ...advanced];
    if (mode === 'transfer' && index > 0) pool = [...dynamic, ...advanced];
    pool = pool.filter((family) => family !== previousFamily || pool.length < 2);
    const forced = new Map();
    if (count >= 4) forced.set(Math.min(3, count - 1), 'moving-frame');
    if (count >= 6) forced.set(Math.min(5, count - 1), 'temporal-window');
    if (count >= 8) forced.set(Math.min(7, count - 1), 'moving-frame');
    if (count >= 8 && mode !== 'training') forced.set(count - 1, 'composed-intercept');
    const family = forced.get(index) || rng.pick(pool);
    const sector = sectors[index] || {};
    const polarity = rng.bool() ? 1 : -1;
    const phase = rng.next() * Math.PI * 2;
    const rate = (0.32 + rng.next() * 0.42) * polarity * difficulty;
    const radius = 20 + rng.next() * 18;
    const offset = 8 + rng.next() * 11;
    const prediction = 1.35 + rng.next() * (1.7 + progress * 1.6) * difficulty;
    const roleSalt = rng.int(0, 9999);
    const quarterTurns = rng.int(0, 3);
    const reflected = rng.bool(progress > 0.45 ? 0.42 : 0.16);
    const controlMapping = mappingForQuarterTurns(quarterTurns, reflected);
    const compositionDepth = progress > 0.72 ? (rng.bool(0.6) ? 3 : 2) : progress > 0.4 ? 2 : 1;
    const signature = [family, polarity, Math.round(radius / 4), Math.round(offset / 3), Math.round(prediction * 2), quarterTurns, reflected ? 1 : 0, compositionDepth].join(':');

    const effectiveSignature = signature === previousSignature ? `${signature}:v${roleSalt % 7}` : signature;
    const startZ = Number(sector.startZ ?? 500 + index * 790);
    const commitZ = Number(sector.commitZ ?? startZ + 505);
    const gateZ = Number(sector.gateZ ?? startZ + 650);

    schedule.push({
      index,
      family,
      polarity,
      phase: round(phase, 5),
      rate: round(rate, 5),
      radius: round(radius, 3),
      offset: round(offset, 3),
      prediction: round(prediction, 3),
      roleSalt,
      quarterTurns,
      reflected,
      controlMappingId: controlMapping.id,
      compositionDepth,
      startZ,
      evidenceZ: startZ + 70,
      commitZ,
      gateZ,
      endZ: gateZ + 120,
      fieldEntryZ: startZ + 300,
      fieldExitZ: gateZ + 45,
      signature: effectiveSignature,
      committed: false,
      executed: false,
      seenAt: null,
      lockHold: 0,
      inferenceAt: null,
      pathErrorIntegral: 0,
      pathSamples: 0,
      aiStates: {},
    });
    previousFamily = family;
    previousSignature = effectiveSignature;
  }
  return schedule;
}

function normalizedRacers(context) {
  return (context.racers || []).map((racer, index) => ({
    id: racer.id ?? index,
    x: Number(racer.x) || 0,
    y: Number(racer.y) || 0,
    z: Number(racer.z) || 0,
    vx: Number(racer.vx) || 0,
    vy: Number(racer.vy) || 0,
    speed: Number(racer.speed) || 0,
  }));
}

function predicted(racer, horizon) {
  return [racer.x + racer.vx * horizon, racer.y + racer.vy * horizon];
}

function nearestAhead(context, count = 2) {
  const playerZ = context.player?.z || 0;
  const racers = normalizedRacers(context);
  const ahead = racers.filter((r) => r.z >= playerZ - 15).sort((a, b) => (a.z - playerZ) - (b.z - playerZ));
  const fallback = racers.sort((a, b) => Math.abs(a.z - playerZ) - Math.abs(b.z - playerZ));
  return (ahead.length >= count ? ahead : fallback).slice(0, count);
}

function raceOrder(context) {
  return normalizedRacers(context).sort((a, b) => b.z - a.z);
}

function boundPoint(point) {
  return [clamp(point[0], -63, 63), clamp(point[1], -28, 40)];
}

function alt(id, point) { return { id, point: boundPoint(point) }; }

export function resolveWorldRelation(event, context) {
  const player = context.player || { x: 0, y: 0, z: 0 };
  const time = Number(context.time) || 0;
  const racers = normalizedRacers(context);
  const near = nearestAhead(context, 3);
  const leaderOrder = raceOrder(context);
  const leader = leaderOrder[0] || near[0] || { id: -1, x: 0, y: 0, z: player.z + 50, vx: 0, vy: 0, speed: 100 };
  const first = near[0] || leader;
  const second = near[1] || leaderOrder[1] || first;
  const third = near[2] || leaderOrder[2] || second;
  const h = event.prediction;
  const p1 = predicted(first, h);
  const p2 = predicted(second, h);
  const p3 = predicted(third, h);
  const c1 = [first.x, first.y];
  const c2 = [second.x, second.y];
  const phase = event.phase + time * event.rate;
  const rotorAxis = [Math.cos(phase), Math.sin(phase)];
  const rotorPerp = [-rotorAxis[1] * event.polarity, rotorAxis[0] * event.polarity];
  let target = [0, 0];
  let alternatives = [];
  let references = [first.id, second.id];
  let temporalOpen = true;
  let controlMappingId = 'identity';
  let ruleVector = [0, 1];

  if (event.family === 'slipstream-intercept') {
    const velocity = norm([first.vx, first.vy + 0.001]);
    const lateral = [-velocity[1], velocity[0]];
    const future = p1;
    target = add(future, scale(lateral, event.offset * event.polarity));
    alternatives = [
      alt('current-state', add(c1, scale(lateral, event.offset * event.polarity))),
      alt('inverse-relation', add(future, scale(lateral, -event.offset * event.polarity))),
      alt('surface-route', c1),
    ];
    references = [first.id];
    ruleVector = lateral;
  } else if (event.family === 'wake-intersection') {
    const midFuture = midpoint(p1, p2);
    const relative = norm([first.vx - second.vx, first.vy - second.vy || 0.001]);
    const normal = [-relative[1], relative[0]];
    target = add(midFuture, scale(normal, event.offset * event.polarity));
    alternatives = [
      alt('current-state', add(midpoint(c1, c2), scale(normal, event.offset * event.polarity))),
      alt('inverse-relation', add(midFuture, scale(normal, -event.offset * event.polarity))),
      alt('single-source', p1),
    ];
    ruleVector = normal;
  } else if (event.family === 'rotor-relative') {
    const reference = p1;
    const local = sub(reference, [0, 5]);
    const rotated = rotate2(local, event.polarity * Math.PI / 2);
    target = add([0, 5], scale(norm(rotated), event.radius));
    alternatives = [
      alt('absolute-frame', [event.polarity * event.radius, 5]),
      alt('inverse-relation', add([0, 5], scale(norm(rotate2(local, -event.polarity * Math.PI / 2)), event.radius))),
      alt('current-state', scale(norm(c1), event.radius)),
    ];
    ruleVector = rotorPerp;
  } else if (event.family === 'formation-mirror') {
    const axis = mag([leader.vx, leader.vy]) > 0.8 ? [leader.vx, leader.vy] : rotorAxis;
    const axisUnit = norm(axis);
    const formationPerp = [-axisUnit[1], axisUnit[0]];
    const leaderFuture = predicted(leader, h);
    const wing = first.id === leader.id ? second : first;
    const wingFuture = predicted(wing, h);
    const mirrored = reflectAcrossAxis(wingFuture, leaderFuture, axis);
    target = add(mirrored, scale(formationPerp, event.offset * 0.55 * event.polarity));
    alternatives = [
      alt('single-source', wingFuture),
      alt('absolute-frame', [2 * leaderFuture[0] - wingFuture[0], wingFuture[1]]),
      alt('stale-reference', reflectAcrossAxis(p2, p1, axis)),
    ];
    references = [leader.id, wing.id];
    ruleVector = norm(axis);
  } else if (event.family === 'moving-frame') {
    const local = [event.radius * 0.72 * event.polarity, event.offset * 0.55];
    const transformed = rotate2(local, phase);
    target = transformed;
    const quantizedTurns = ((Math.round(phase / (Math.PI / 2)) % 4) + 4) % 4;
    const fieldMapping = mappingForQuarterTurns((event.quarterTurns + quantizedTurns) % 4, event.reflected);
    controlMappingId = fieldMapping.id;
    alternatives = [
      alt('absolute-frame', local),
      alt('inverse-relation', rotate2(local, -phase)),
      alt('stale-reference', rotate2(local, event.phase)),
    ];
    references = [];
    ruleVector = rotorAxis;
  } else if (event.family === 'temporal-window') {
    const secondEntered = second.z >= event.startZ + 155;
    const firstFinished = first.z >= event.gateZ - 25;
    temporalOpen = secondEntered && !firstFinished;
    const orderSign = first.z >= second.z ? event.polarity : -event.polarity;
    target = [orderSign * event.radius, clamp((p1[1] + p2[1]) * 0.35, -18, 26)];
    alternatives = [
      alt('timing-order', [-orderSign * event.radius, target[1]]),
      alt('current-state', [orderSign * event.radius, clamp((first.y + second.y) * 0.35, -18, 26)]),
      alt('surface-route', [0, target[1]]),
    ];
    ruleVector = [orderSign, 0];
  } else if (event.family === 'role-switch') {
    const reference = leaderOrder[(event.roleSalt + 1) % Math.max(1, Math.min(3, leaderOrder.length))] || leader;
    const lead = leaderOrder[0] || reference;
    const relation = sub(predicted(reference, h), predicted(lead, h));
    target = add(predicted(lead, h), scale(norm(rotate2(relation, event.polarity * Math.PI / 2)), event.radius));
    alternatives = [
      alt('stale-reference', p1),
      alt('inverse-relation', add(predicted(lead, h), scale(norm(rotate2(relation, -event.polarity * Math.PI / 2)), event.radius))),
      alt('current-state', [reference.x, reference.y]),
    ];
    references = [lead.id, reference.id];
    ruleVector = norm(relation);
  } else {
    const relationalMid = midpoint(p1, p2);
    const centered = sub(relationalMid, [0, 4]);
    const stage2 = rotate2(centered, event.polarity * Math.PI / 2);
    const stage3 = event.compositionDepth >= 3 ? reflectAcrossAxis(stage2, [0, 0], rotorAxis) : stage2;
    target = add([0, 4], add(scale(norm(stage3), event.radius), scale(rotorPerp, event.offset * 0.55)));
    alternatives = [
      alt('partial-composition', add([0, 4], scale(norm(stage2), event.radius))),
      alt('current-state', midpoint(c1, c2)),
      alt('inverse-relation', add([0, 4], scale(norm(rotate2(centered, -event.polarity * Math.PI / 2)), event.radius))),
    ];
    references = [first.id, second.id];
    ruleVector = rotorPerp;
  }

  target = boundPoint(target);
  alternatives = alternatives.map((item) => ({ ...item, point: boundPoint(item.point) }));
  return {
    target,
    alternatives,
    references,
    temporalOpen,
    controlMappingId,
    rotorAngle: phase,
    rotorAxis,
    ruleVector: norm(ruleVector),
    primaryRacers: [first, second, third],
    leader,
  };
}

export function classifyCommit({ position, target, alternatives, correctRadius = 15.5, margin = 2.5 }) {
  const dTarget = Math.hypot(position[0] - target[0], position[1] - target[1]);
  const ranked = (alternatives || []).map((item) => ({
    ...item,
    distance: Math.hypot(position[0] - item.point[0], position[1] - item.point[1]),
  })).sort((a, b) => a.distance - b.distance);
  const nearestAlt = ranked[0] || { id: 'surface-route', distance: Infinity };
  const correct = dTarget <= correctRadius && dTarget + margin < nearestAlt.distance;
  return {
    correct,
    targetDistance: round(dTarget, 4),
    nearestAlternative: nearestAlt.id,
    alternativeDistance: round(nearestAlt.distance, 4),
    confidenceMargin: round(nearestAlt.distance - dTarget, 4),
  };
}

export function relationAlignment(player, target) {
  const intent = norm([player.vx || 0, player.vy || 0]);
  const desired = norm([target[0] - (player.x || 0), target[1] - (player.y || 0)]);
  return mag([player.vx || 0, player.vy || 0]) < 1.2 ? 0 : dot(intent, desired);
}

export function noveltyRate(events) {
  if (!events.length) return 0;
  return new Set(events.map((event) => event.signature)).size / events.length;
}

export const WorldMath = Object.freeze({ clamp, norm, dot, sub, add, scale, midpoint, predicted, boundPoint });
