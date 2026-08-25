import {
  clamp,
  smootherstep,
  V2,
  PRNG,
  hashString,
} from './math3d.js';

export const RELATION_FAMILIES = Object.freeze([
  'vortex-convergence',
  'formation-mirror',
  'rotating-frame',
  'temporal-relay',
  'energy-intercept',
  'race-role',
  'vortex-frame-compose',
  'formation-temporal-compose',
]);

const SIMPLE_FAMILIES = RELATION_FAMILIES.slice(0, 6);
const COMPOSED_FAMILIES = RELATION_FAMILIES.slice(6);
const MODE_FAMILY_PLAN = Object.freeze({
  training: [
    'vortex-convergence', 'formation-mirror', 'rotating-frame', 'temporal-relay',
    'vortex-convergence', 'energy-intercept', 'race-role', 'formation-mirror',
  ],
  'grand-prix': [
    'vortex-convergence', 'formation-mirror', 'rotating-frame', 'energy-intercept',
    'temporal-relay', 'race-role', 'vortex-frame-compose', 'formation-temporal-compose',
  ],
  assessment: [
    'formation-mirror', 'vortex-convergence', 'temporal-relay', 'rotating-frame',
    'energy-intercept', 'race-role', 'vortex-frame-compose', 'formation-temporal-compose',
  ],
  transfer: [
    'vortex-frame-compose', 'formation-temporal-compose', 'rotating-frame', 'race-role',
    'vortex-frame-compose', 'energy-intercept', 'formation-temporal-compose', 'vortex-convergence',
  ],
});

const clampOffset = (offset, width = 88, height = 58) => [
  clamp(offset[0], -width, width),
  clamp(offset[1], -height, height),
];

function actorOffset(actor) {
  return [Number(actor?.lateral) || 0, Number(actor?.vertical) || 0];
}

function actorOffsetVelocity(actor) {
  return [Number(actor?.lateralVelocity) || 0, Number(actor?.verticalVelocity) || 0];
}

function sortByRank(actors) {
  return [...actors].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
}

function currentLeader(actors) {
  return sortByRank(actors)[0] || actors[0];
}

function secondPlace(actors) {
  return sortByRank(actors)[1] || actors[1] || actors[0];
}

function recentBooster(actors) {
  return [...actors].sort((a, b) => (b.boostSignal ?? 0) - (a.boostSignal ?? 0))[0] || currentLeader(actors);
}

function closestWingman(leader, actors) {
  // Formation role is defined by visible race order: the highest-ranked non-leader.
  // This avoids a hidden proximity selector and makes the reference object legible.
  return sortByRank(actors).find((actor) => actor.id !== leader?.id)
    || actors.find((actor) => actor.id !== leader?.id)
    || leader;
}

function convergingPair(actors) {
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < actors.length; i += 1) {
    for (let j = i + 1; j < actors.length; j += 1) {
      const a = actors[i];
      const b = actors[j];
      const delta = V2.sub(actorOffset(b), actorOffset(a));
      const relativeVelocity = V2.sub(actorOffsetVelocity(b), actorOffsetVelocity(a));
      const separation = Math.max(1, V2.length(delta));
      const closing = -V2.dot(V2.normalize(delta), relativeVelocity);
      const rankWeight = 1 / (1 + Math.min(a.rank ?? 5, b.rank ?? 5) * 0.08);
      const score = closing * 1.8 + (48 - Math.min(48, separation)) * 0.08 + rankWeight;
      if (score > bestScore) {
        bestScore = score;
        best = [a, b];
      }
    }
  }
  return best || [actors[0], actors[1] || actors[0]];
}

function alternativePair(actors, primary) {
  const excluded = new Set(primary.map((actor) => actor?.id));
  const available = actors.filter((actor) => !excluded.has(actor.id));
  if (available.length >= 2) return [available[0], available[1]];
  if (available.length === 1) return [primary[0], available[0]];
  return primary;
}

function arrivalSeconds(event, observation, targetDistance = event.fieldStartDistance) {
  const remaining = Math.max(20, targetDistance - observation.player.distance);
  return clamp(remaining / Math.max(90, observation.player.speed), 0.35, 6.5);
}

export function vortexPoint(actor, directionSign, horizon, { outer = false } = {}) {
  const offset = actorOffset(actor);
  const velocity = actorOffsetVelocity(actor);
  const roll = Number(actor?.roll) || 0;
  const inner = outer ? -directionSign : directionSign;
  const wingOrigin = V2.add(offset, [inner * 5.2, Math.sin(roll) * 1.1]);
  const curve = [
    inner * (0.7 * horizon + 0.42 * horizon * horizon),
    -0.35 * horizon + Math.sin(roll) * (1.2 * horizon + 0.18 * horizon * horizon),
  ];
  return V2.add(wingOrigin, V2.add(V2.scale(velocity, horizon), curve));
}

function vortexSolution(event, observation, options = {}) {
  const pair = options.pair || convergingPair(observation.actors);
  const [rawA, rawB] = pair;
  const ordered = actorOffset(rawA)[0] <= actorOffset(rawB)[0] ? [rawA, rawB] : [rawB, rawA];
  const horizon = options.horizon ?? arrivalSeconds(event, observation);
  const leftPoint = vortexPoint(ordered[0], 1, horizon, { outer: options.outer });
  const rightPoint = vortexPoint(ordered[1], -1, horizon, { outer: options.outer });
  return {
    pair: ordered,
    horizon,
    leftPoint,
    rightPoint,
    target: clampOffset(V2.scale(V2.add(leftPoint, rightPoint), 0.5)),
  };
}

function formationSolution(event, observation, options = {}) {
  const leader = options.leader || currentLeader(observation.actors);
  const wingman = options.wingman || closestWingman(leader, observation.actors);
  const leaderOffset = actorOffset(leader);
  const relative = V2.sub(actorOffset(wingman), leaderOffset);
  const axisAngle = Number(options.axisAngle ?? leader?.roll ?? 0);
  const axis = [Math.cos(axisAngle), Math.sin(axisAngle)];
  const reflected = V2.reflectAcrossAxis(relative, axis);
  return {
    leader,
    wingman,
    axis,
    target: clampOffset(V2.add(leaderOffset, reflected)),
    sameSide: clampOffset(actorOffset(wingman)),
    worldMirror: clampOffset(V2.add(leaderOffset, [-relative[0], relative[1]])),
    center: clampOffset(leaderOffset),
  };
}

function rotorAngle(event, time) {
  return event.rotor.initialAngle + event.rotor.angularSpeed * time;
}

function rotatingFrameSolution(event, observation, options = {}) {
  const role = options.role || currentLeader(observation.actors);
  const center = event.rotor.center;
  const nowAngle = rotorAngle(event, observation.time);
  const horizon = options.horizon ?? arrivalSeconds(event, observation);
  const futureAngle = nowAngle + event.rotor.angularSpeed * horizon;
  const roleVectorWorld = V2.sub(actorOffset(role), center);
  const roleVectorLocal = V2.rotate(roleVectorWorld, -nowAngle);
  const oppositeLocal = V2.scale(V2.normalize(roleVectorLocal), -event.rotor.radius);
  const target = clampOffset(V2.add(center, V2.rotate(oppositeLocal, futureAngle)));
  const currentFrameTarget = clampOffset(V2.add(center, V2.rotate(oppositeLocal, nowAngle)));
  const worldOpposite = clampOffset(V2.add(center, V2.scale(V2.normalize(roleVectorWorld), -event.rotor.radius)));
  const sameSide = clampOffset(V2.add(center, V2.scale(V2.normalize(roleVectorWorld), event.rotor.radius)));
  return {
    role,
    center,
    nowAngle,
    futureAngle,
    target,
    currentFrameTarget,
    worldOpposite,
    sameSide,
  };
}

function temporalSolution(event, observation, options = {}) {
  const leader = options.leader || currentLeader(observation.actors);
  const second = options.second || secondPlace(observation.actors);
  const now = observation.time;
  const toA = Math.max(0, event.temporal.boundaryA - leader.distance);
  const toB = Math.max(0, event.temporal.boundaryB - second.distance);
  let openAt = now + toA / Math.max(80, leader.speed);
  let closeAt = now + toB / Math.max(80, second.speed);
  if (closeAt <= openAt + 0.55) closeAt = openAt + 0.55 + Math.abs(closeAt - openAt) * 0.35;
  const midpoint = (openAt + closeAt) * 0.5;
  const aperture = clampOffset([
    (actorOffset(leader)[0] + actorOffset(second)[0]) * 0.22 + event.temporal.aperture[0] * 0.78,
    (actorOffset(leader)[1] + actorOffset(second)[1]) * 0.18 + event.temporal.aperture[1] * 0.82,
  ]);
  return {
    leader,
    second,
    openAt,
    closeAt,
    midpoint,
    aperture,
    earlyAt: openAt - Math.max(0.7, (closeAt - openAt) * 0.55),
    lateAt: closeAt + Math.max(0.7, (closeAt - openAt) * 0.55),
    open: now >= openAt && now <= closeAt,
  };
}

function energySolution(event, observation, options = {}) {
  const role = options.role || recentBooster(observation.actors);
  const horizon = options.horizon ?? arrivalSeconds(event, observation);
  const predicted = V2.add(actorOffset(role), V2.scale(actorOffsetVelocity(role), horizon));
  const playerEnergy = observation.player.energy ?? 0.5;
  const roleEnergy = role.energy ?? role.boostSignal ?? 0.5;
  const energyDifference = clamp(roleEnergy - playerEnergy, -1, 1);
  const verticalExchange = clamp(energyDifference * -24 + (role.vertical - observation.player.vertical) * 0.22, -28, 28);
  const courseTurn = clamp(observation.course?.turnSign || 0, -1, 1);
  const lateralLead = clamp((role.lateralVelocity || 0) * horizon * 0.55 + courseTurn * 10, -24, 24);
  return {
    role,
    horizon,
    predicted,
    target: clampOffset([predicted[0] + lateralLead, predicted[1] + verticalExchange]),
    current: clampOffset(actorOffset(role)),
    wrongEnergy: clampOffset([predicted[0] + lateralLead, predicted[1] - verticalExchange]),
    noLead: clampOffset([predicted[0], predicted[1] + verticalExchange]),
  };
}

function raceRoleSolution(event, observation, options = {}) {
  const leader = options.leader || currentLeader(observation.actors);
  const previousLeader = observation.previousLeader
    || sortByRank(observation.actors).find((actor) => actor.id !== leader?.id)
    || leader;
  const turnSign = Math.sign(observation.course?.turnSign || 1);
  const radius = 18 + Math.min(24, Math.abs(observation.course?.curvature || 0) * 950);
  const outside = [turnSign * -radius, clamp((leader.roll || 0) * 12, -15, 15)];
  return {
    leader,
    previousLeader,
    target: clampOffset(V2.add(actorOffset(leader), outside)),
    inside: clampOffset(V2.add(actorOffset(leader), V2.scale(outside, -1))),
    absoluteSide: clampOffset(V2.add(actorOffset(leader), [-radius, outside[1]])),
    staleLeader: clampOffset(V2.add(actorOffset(previousLeader), outside)),
  };
}

function makePath(id, errorType, startOffset, targetOffset, {
  targetArrivalTime = null,
  weight = 1,
  metadata = {},
} = {}) {
  const target = clampOffset(targetOffset);
  const start = clampOffset(startOffset);
  return {
    id,
    errorType,
    target,
    targetArrivalTime,
    weight,
    metadata,
    pointAt(u) {
      return V2.lerp(start, target, smootherstep(u));
    },
  };
}

function uniquePaths(paths) {
  const output = [];
  for (const path of paths) {
    if (output.some((existing) => V2.distance(existing.target, path.target) < 2.8
      && (existing.targetArrivalTime === null || path.targetArrivalTime === null
        || Math.abs(existing.targetArrivalTime - path.targetArrivalTime) < 0.45))) continue;
    output.push(path);
  }
  return output;
}

export function resolveEpisode(event, observation, startOffset = [observation.player.lateral, observation.player.vertical]) {
  const paths = [];
  let evidence = {};
  let correctTarget = [0, 0];
  let correctArrivalTime = null;

  if (event.family === 'vortex-convergence') {
    const solution = vortexSolution(event, observation);
    const current = vortexSolution(event, observation, { horizon: 0.05 });
    const outer = vortexSolution(event, observation, { outer: true });
    const reversed = vortexSolution(event, observation, { horizon: -solution.horizon * 0.72 });
    const wrongPair = vortexSolution(event, observation, { pair: alternativePair(observation.actors, solution.pair) });
    correctTarget = solution.target;
    evidence = { kind: event.family, ...solution };
    paths.push(
      makePath('predictive-convergence', null, startOffset, solution.target, { metadata: { relation: 'future-inner-vortex-intersection' } }),
      makePath('current-convergence', 'current-state-chasing', startOffset, current.target),
      makePath('single-wake', 'single-source-capture', startOffset, solution.leftPoint),
      makePath('outer-left', 'inverse-vortex-selection', startOffset, outer.leftPoint),
      makePath('outer-right', 'inverse-vortex-selection', startOffset, outer.rightPoint),
      makePath('reversed-time', 'reversed-prediction', startOffset, reversed.target),
      makePath('wrong-pair', 'wrong-reference-pair', startOffset, wrongPair.target),
    );
  } else if (event.family === 'formation-mirror') {
    const solution = formationSolution(event, observation);
    const wrongRole = formationSolution(event, observation, { leader: secondPlace(observation.actors) });
    correctTarget = solution.target;
    evidence = { kind: event.family, ...solution };
    paths.push(
      makePath('leader-axis-mirror', null, startOffset, solution.target),
      makePath('same-side', 'surface-following', startOffset, solution.sameSide),
      makePath('world-mirror', 'wrong-reference-frame', startOffset, solution.worldMirror),
      makePath('leader-follow', 'relation-collapse', startOffset, solution.center),
      makePath('wrong-leader', 'wrong-reference-object', startOffset, wrongRole.target),
    );
  } else if (event.family === 'rotating-frame') {
    const solution = rotatingFrameSolution(event, observation);
    const wrongRole = rotatingFrameSolution(event, observation, { role: secondPlace(observation.actors) });
    correctTarget = solution.target;
    evidence = { kind: event.family, ...solution };
    paths.push(
      makePath('future-local-opposite', null, startOffset, solution.target),
      makePath('current-frame', 'current-frame-capture', startOffset, solution.currentFrameTarget),
      makePath('world-opposite', 'world-frame-substitution', startOffset, solution.worldOpposite),
      makePath('same-side', 'relation-inversion', startOffset, solution.sameSide),
      makePath('wrong-role', 'wrong-reference-object', startOffset, wrongRole.target),
    );
  } else if (event.family === 'temporal-relay') {
    const solution = temporalSolution(event, observation);
    correctTarget = solution.aperture;
    correctArrivalTime = solution.midpoint;
    evidence = { kind: event.family, ...solution };
    paths.push(
      makePath('relational-window', null, startOffset, solution.aperture, { targetArrivalTime: solution.midpoint }),
      makePath('early-entry', 'premature-timing', startOffset, solution.aperture, { targetArrivalTime: solution.earlyAt }),
      makePath('late-entry', 'late-timing', startOffset, solution.aperture, { targetArrivalTime: solution.lateAt }),
      makePath('wrong-order', 'temporal-order-reversal', startOffset, V2.scale(solution.aperture, -0.72), { targetArrivalTime: solution.midpoint }),
      makePath('spatial-only', 'temporal-relation-omission', startOffset, solution.aperture, { targetArrivalTime: null }),
    );
  } else if (event.family === 'energy-intercept') {
    const solution = energySolution(event, observation);
    const wrongRole = energySolution(event, observation, { role: currentLeader(observation.actors) });
    correctTarget = solution.target;
    evidence = { kind: event.family, ...solution };
    paths.push(
      makePath('energy-lead-intercept', null, startOffset, solution.target),
      makePath('current-position', 'current-state-chasing', startOffset, solution.current),
      makePath('wrong-energy-sign', 'energy-relation-inversion', startOffset, solution.wrongEnergy),
      makePath('no-lateral-lead', 'partial-prediction', startOffset, solution.noLead),
      makePath('wrong-energy-source', 'wrong-reference-object', startOffset, wrongRole.target),
    );
  } else if (event.family === 'race-role') {
    const solution = raceRoleSolution(event, observation);
    correctTarget = solution.target;
    evidence = { kind: event.family, ...solution };
    paths.push(
      makePath('live-leader-outside', null, startOffset, solution.target),
      makePath('inside-turn', 'relation-inversion', startOffset, solution.inside),
      makePath('absolute-left', 'absolute-position-shortcut', startOffset, solution.absoluteSide),
      makePath('stale-leader', 'obsolete-role-perseveration', startOffset, solution.staleLeader),
      makePath('leader-center', 'relation-collapse', startOffset, actorOffset(solution.leader)),
    );
  } else if (event.family === 'vortex-frame-compose') {
    const vortex = vortexSolution(event, observation);
    const frame = rotatingFrameSolution(event, observation);
    const center = event.rotor.center;
    const nowAngle = frame.nowAngle;
    const futureAngle = frame.futureAngle;
    const localVortex = V2.rotate(V2.sub(vortex.target, center), -nowAngle);
    const composedTarget = clampOffset(V2.add(center, V2.rotate(localVortex, futureAngle)));
    const reversedOrder = clampOffset(V2.add(center, V2.rotate(V2.scale(localVortex, -1), futureAngle)));
    correctTarget = composedTarget;
    evidence = { kind: event.family, vortex, frame, composedTarget };
    paths.push(
      makePath('vortex-then-frame', null, startOffset, composedTarget),
      makePath('vortex-only', 'incomplete-composition', startOffset, vortex.target),
      makePath('frame-only', 'single-relation-capture', startOffset, frame.target),
      makePath('current-frame-composition', 'current-frame-capture', startOffset, V2.add(center, V2.rotate(localVortex, nowAngle))),
      makePath('reversed-composition', 'operation-order-reversal', startOffset, reversedOrder),
    );
  } else if (event.family === 'formation-temporal-compose') {
    const formation = formationSolution(event, observation);
    const temporal = temporalSolution(event, observation);
    correctTarget = formation.target;
    correctArrivalTime = temporal.midpoint;
    evidence = { kind: event.family, formation, temporal };
    paths.push(
      makePath('formation-in-window', null, startOffset, formation.target, { targetArrivalTime: temporal.midpoint }),
      makePath('formation-early', 'temporal-relation-omission', startOffset, formation.target, { targetArrivalTime: temporal.earlyAt }),
      makePath('window-without-formation', 'spatial-relation-omission', startOffset, temporal.aperture, { targetArrivalTime: temporal.midpoint }),
      makePath('world-mirror-in-window', 'wrong-reference-frame', startOffset, formation.worldMirror, { targetArrivalTime: temporal.midpoint }),
      makePath('stale-formation', 'obsolete-role-perseveration', startOffset, formation.sameSide, { targetArrivalTime: temporal.midpoint }),
    );
  } else {
    correctTarget = [0, 0];
    paths.push(makePath('course-center', null, startOffset, correctTarget));
  }

  const distinct = uniquePaths(paths);
  const correctId = distinct.find((path) => path.errorType === null)?.id || distinct[0]?.id;
  const correctPath = distinct.find((path) => path.id === correctId) || distinct[0] || null;
  return {
    family: event.family,
    evidence,
    correctId,
    correctTarget,
    correctArrivalTime,
    correctPath,
    paths: distinct,
  };
}

export function scoreTrajectoryHypotheses(samples, hypotheses, {
  motorSigma = 7,
  timingSigma = 0.8,
} = {}) {
  const sigmaSq = Math.max(4, motorSigma * motorSigma);
  const scores = hypotheses.map((hypothesis) => {
    let spatial = 0;
    let timing = 0;
    let weight = 0;
    for (const sample of samples) {
      const expected = sample.expectedById?.[hypothesis.id] || hypothesis.pointAt(clamp(sample.u, 0, 1));
      const error = V2.distance(sample.offset, expected);
      const sampleWeight = sample.weight ?? 1;
      spatial += (error * error / sigmaSq) * sampleWeight;
      weight += sampleWeight;
    }
    if (hypothesis.targetArrivalTime !== null && samples.length) {
      const final = samples.at(-1);
      const predictedArrival = final.predictedArrivalTime ?? final.time;
      timing = ((predictedArrival - hypothesis.targetArrivalTime) / timingSigma) ** 2;
    } else if (hypothesis.id === 'spatial-only') {
      timing = 0.35;
    }
    const normalizedSpatial = weight > 0 ? spatial / weight : Number.POSITIVE_INFINITY;
    return { id: hypothesis.id, errorType: hypothesis.errorType, score: normalizedSpatial + timing, spatial: normalizedSpatial, timing };
  }).sort((a, b) => a.score - b.score);
  const best = scores[0] || null;
  const second = scores[1] || null;
  const margin = best && second ? second.score - best.score : 0;
  const confidence = best ? 1 - Math.exp(-Math.max(0, margin)) : 0;
  return { best, second, confidence, scores };
}

export function motorExecutionScore(samples, chosenPath, motorSigma = 7) {
  if (!samples.length || !chosenPath) return 0;
  const meanError = samples.reduce((sum, sample) => (
    sum + V2.distance(sample.offset, sample.expectedById?.[chosenPath.id] || chosenPath.pointAt(clamp(sample.u, 0, 1)))
  ), 0) / samples.length;
  return clamp(Math.exp(-meanError / Math.max(3, motorSigma * 1.35)), 0, 1);
}

export function relationFieldStrength(offset, resolved, radius = 12, pathProgress = 1) {
  const target = resolved.correctPath?.pointAt(clamp(pathProgress, 0, 1)) || resolved.correctTarget;
  const distance = V2.distance(offset, target);
  return Math.exp(-(distance * distance) / (2 * radius * radius));
}

export function diagnosticField(offset, resolved, pathProgress = 1) {
  const progress = clamp(pathProgress, 0, 1);
  const correctPoint = resolved.correctPath?.pointAt(progress) || resolved.correctTarget;
  let best = { id: resolved.correctId, errorType: null, distance: V2.distance(offset, correctPoint), target: correctPoint };
  for (const path of resolved.paths) {
    const target = path.pointAt(progress);
    const distance = V2.distance(offset, target);
    if (distance < best.distance) best = { id: path.id, errorType: path.errorType, distance, target };
  }
  return best;
}

export function temporalFieldOpen(resolved, time) {
  const evidence = resolved?.evidence;
  if (!evidence) return true;
  if (evidence.kind === 'temporal-relay') return time >= evidence.openAt && time <= evidence.closeAt;
  if (evidence.kind === 'formation-temporal-compose') return time >= evidence.temporal.openAt && time <= evidence.temporal.closeAt;
  return true;
}

export function generateEpisodeSchedule({
  seed = 'relational-race',
  mode = 'grand-prix',
  courseLength = 10400,
  count = 9,
  history = [],
} = {}) {
  const rng = new PRNG(`${seed}:${mode}:episodes`);
  const plan = MODE_FAMILY_PLAN[mode] || MODE_FAMILY_PLAN['grand-prix'];
  const avoid = new Set(history.slice(-200));
  const startMargin = 760;
  const endMargin = 540;
  const usable = courseLength - startMargin - endMargin;
  const spacing = usable / count;
  const events = [];
  for (let index = 0; index < count; index += 1) {
    let family = plan[index % plan.length];
    if (mode === 'grand-prix' && index >= 5 && rng.bool(0.28)) family = rng.pick(COMPOSED_FAMILIES);
    if (mode === 'training' && index < 4) family = plan[index];
    if (mode === 'transfer') family = index % 3 === 2 ? rng.pick(SIMPLE_FAMILIES) : rng.pick(COMPOSED_FAMILIES);
    const startDistance = startMargin + index * spacing;
    const endDistance = startDistance + spacing * 0.88;
    const observeDistance = startDistance;
    const demonstrationEndDistance = startDistance + spacing * (mode === 'training' ? 0.25 : 0.18);
    const commitDistance = startDistance + spacing * 0.54;
    const fieldStartDistance = startDistance + spacing * 0.61;
    const fieldEndDistance = startDistance + spacing * 0.78;
    const rotor = {
      center: [rng.range(-18, 18), rng.range(-10, 20)],
      radius: rng.range(27, 43),
      initialAngle: rng.range(-Math.PI, Math.PI),
      angularSpeed: rng.pick([-1, 1]) * rng.range(0.35, 0.78),
    };
    const temporal = {
      boundaryA: fieldStartDistance - rng.range(35, 70),
      boundaryB: fieldStartDistance + rng.range(45, 90),
      aperture: [rng.range(-26, 26), rng.range(-18, 24)],
    };
    let signature = '';
    for (let attempt = 0; attempt < 24; attempt += 1) {
      signature = [
        family,
        Math.round(rotor.center[0] / 5),
        Math.round(rotor.center[1] / 5),
        Math.sign(rotor.angularSpeed),
        Math.round(rotor.radius / 5),
        Math.round(temporal.aperture[0] / 6),
        Math.round(temporal.aperture[1] / 6),
        index % 4,
      ].join(':');
      if (!avoid.has(signature) && !events.some((event) => event.signature === signature)) break;
      rotor.initialAngle += rng.range(0.35, 1.2);
      rotor.center = [rng.range(-20, 20), rng.range(-12, 22)];
      temporal.aperture = [rng.range(-28, 28), rng.range(-20, 26)];
    }
    events.push({
      id: `${index}-${hashString(`${seed}:${signature}`).toString(36)}`,
      index,
      family,
      difficulty: clamp(index + (mode === 'transfer' ? 4 : 1), 1, 10),
      observeDistance,
      demonstrationEndDistance,
      commitDistance,
      fieldStartDistance,
      fieldEndDistance,
      endDistance,
      rotor,
      temporal,
      signature,
      heldOutComposition: mode === 'transfer' && COMPOSED_FAMILIES.includes(family),
    });
  }
  return events;
}

export function structuralComplexity(event) {
  const base = {
    'vortex-convergence': 2,
    'formation-mirror': 2,
    'rotating-frame': 3,
    'temporal-relay': 3,
    'energy-intercept': 3,
    'race-role': 4,
    'vortex-frame-compose': 6,
    'formation-temporal-compose': 6,
  }[event.family] || 1;
  return base + (event.heldOutComposition ? 1 : 0);
}
