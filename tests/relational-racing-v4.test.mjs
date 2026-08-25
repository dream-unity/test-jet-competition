import assert from 'node:assert/strict';
import {
  RELATION_FAMILIES,
  generateEpisodeSchedule,
  resolveEpisode,
  scoreTrajectoryHypotheses,
  motorExecutionScore,
  temporalFieldOpen,
  structuralComplexity,
} from '../src/relational-racing.js';

const baseObservation = {
  time: 22,
  player: { distance: 1040, speed: 285, lateral: -3, vertical: 2, energy: 0.54 },
  actors: [
    { id: 'alpha', rank: 1, distance: 1410, lateral: -28, vertical: 10, lateralVelocity: 3.2, verticalVelocity: 0.7, speed: 305, roll: 0.42, energy: 0.84, boostSignal: 0.92 },
    { id: 'beta', rank: 2, distance: 1370, lateral: 31, vertical: -9, lateralVelocity: -2.8, verticalVelocity: 0.3, speed: 296, roll: -0.31, energy: 0.48, boostSignal: 0.18 },
    { id: 'gamma', rank: 3, distance: 1325, lateral: 5, vertical: 25, lateralVelocity: 0.7, verticalVelocity: -1.6, speed: 288, roll: 0.66, energy: 0.62, boostSignal: 0.44 },
    { id: 'delta', rank: 4, distance: 1280, lateral: -8, vertical: -22, lateralVelocity: 1.1, verticalVelocity: 1.3, speed: 282, roll: -0.12, energy: 0.38, boostSignal: 0.09 },
  ],
  previousLeader: { id: 'beta', rank: 2, distance: 1370, lateral: 31, vertical: -9, lateralVelocity: -2.8, verticalVelocity: 0.3, speed: 296, roll: -0.31, energy: 0.48, boostSignal: 0.18 },
  course: { turnSign: 1, curvature: 0.018 },
};

const schedule = generateEpisodeSchedule({ seed: 'integrity', mode: 'grand-prix', courseLength: 11500, count: 16 });
assert.deepEqual(new Set(schedule.map((event) => event.family)), new Set(RELATION_FAMILIES));
assert.equal(new Set(schedule.map((event) => event.signature)).size, schedule.length, 'episode signatures must be structurally novel');

for (const family of RELATION_FAMILIES) {
  const event = schedule.find((candidate) => candidate.family === family) || {
    ...schedule[0], family,
  };
  const resolved = resolveEpisode(event, baseObservation, [-3, 2]);
  const repeated = resolveEpisode(event, structuredClone(baseObservation), [-3, 2]);
  assert.deepEqual(repeated.correctTarget, resolved.correctTarget, `${family} must be deterministically derivable from public observation`);
  assert.ok(resolved.paths.length >= 4, `${family} must expose a meaningful error topology`);
  assert.ok(resolved.paths.some((path) => path.errorType === null));
  assert.ok(resolved.paths.filter((path) => path.errorType).length >= 3);
  assert.ok(Math.abs(resolved.correctTarget[0]) <= 88 && Math.abs(resolved.correctTarget[1]) <= 58);
  assert.ok(structuralComplexity(event) >= 2);

  const exactSamples = Array.from({ length: 18 }, (_, index) => {
    const u = index / 17;
    return {
      u,
      time: baseObservation.time + u * 3,
      predictedArrivalTime: resolved.correctArrivalTime ?? baseObservation.time + 4,
      offset: resolved.paths.find((path) => path.id === resolved.correctId).pointAt(u),
    };
  });
  const scored = scoreTrajectoryHypotheses(exactSamples, resolved.paths, { motorSigma: 6, timingSigma: 0.8 });
  assert.equal(scored.best.id, resolved.correctId, `${family} exact relational path must classify correctly`);
  assert.ok(motorExecutionScore(exactSamples, resolved.paths.find((path) => path.id === resolved.correctId), 6) > 0.99);

  const diagnostic = resolved.paths.find((path) => path.errorType);
  const wrongSamples = Array.from({ length: 18 }, (_, index) => {
    const u = index / 17;
    return {
      u,
      time: baseObservation.time + u * 3,
      predictedArrivalTime: diagnostic.targetArrivalTime ?? baseObservation.time + 4,
      offset: diagnostic.pointAt(u),
    };
  });
  const wrongScored = scoreTrajectoryHypotheses(wrongSamples, resolved.paths, { motorSigma: 6, timingSigma: 0.8 });
  assert.equal(wrongScored.best.id, diagnostic.id, `${family} diagnostic trajectory must remain identifiable`);
}

const vortexEvent = schedule.find((event) => event.family === 'vortex-convergence');
const vortexA = resolveEpisode(vortexEvent, baseObservation, [0, 0]);
const changedObservation = structuredClone(baseObservation);
changedObservation.actors[0].lateralVelocity *= -1;
changedObservation.actors[1].lateralVelocity *= -1;
const vortexB = resolveEpisode(vortexEvent, changedObservation, [0, 0]);
assert.notDeepEqual(vortexA.correctTarget, vortexB.correctTarget, 'vortex solution must depend on relative motion, not static appearance');

const rotorEvent = schedule.find((event) => event.family === 'rotating-frame');
const rotorNow = resolveEpisode(rotorEvent, baseObservation, [0, 0]);
const laterObservation = structuredClone(baseObservation);
laterObservation.time += 1.7;
const rotorLater = resolveEpisode(rotorEvent, laterObservation, [0, 0]);
assert.notDeepEqual(rotorNow.correctTarget, rotorLater.correctTarget, 'rotating-frame solution must evolve with the visible frame');

const temporalEvent = schedule.find((event) => event.family === 'temporal-relay');
const temporal = resolveEpisode(temporalEvent, baseObservation, [0, 0]);
assert.equal(temporalFieldOpen(temporal, temporal.evidence.openAt - 0.01), false);
assert.equal(temporalFieldOpen(temporal, (temporal.evidence.openAt + temporal.evidence.closeAt) / 2), true);
assert.equal(temporalFieldOpen(temporal, temporal.evidence.closeAt + 0.01), false);

const transfer = generateEpisodeSchedule({ seed: 'held-out', mode: 'transfer', courseLength: 11500, count: 12 });
assert.ok(transfer.filter((event) => event.heldOutComposition).length >= 6, 'transfer mode must predominantly use held-out composition');

const targets = [];
for (let seed = 0; seed < 120; seed += 1) {
  const event = generateEpisodeSchedule({ seed: `balance-${seed}`, mode: 'grand-prix', courseLength: 11500, count: 1 })[0];
  const observation = structuredClone(baseObservation);
  const mirror = seed % 2 ? -1 : 1;
  const verticalShift = ((seed * 17) % 21) - 10;
  observation.actors.forEach((actor, index) => {
    actor.lateral = mirror * actor.lateral + ((seed * (index + 3)) % 11) - 5;
    actor.lateralVelocity = mirror * actor.lateralVelocity;
    actor.vertical += verticalShift * (index % 2 ? 0.35 : -0.28);
  });
  const resolved = resolveEpisode(event, observation, [0, 0]);
  targets.push(Math.sign(resolved.correctTarget[0]));
}
const positive = targets.filter((sign) => sign > 0).length;
const negative = targets.filter((sign) => sign < 0).length;
assert.ok(positive > 30 && negative > 30, 'absolute left/right must not become a shortcut');

console.log('Relational racing: observable causal rules, continuous trajectory hypotheses, diagnostics, timing, compositions and transfer validated.');
