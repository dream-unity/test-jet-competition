import assert from 'node:assert/strict';
import {
  RELATION_FAMILIES,
  generateEpisodeSchedule,
  resolveEpisode,
  scoreTrajectoryHypotheses,
  motorExecutionScore,
} from '../src/relational-racing.js';
import { V2 } from '../src/math3d.js';

const observation = {
  time: 18.25,
  player: { distance: 900, speed: 292, lateral: -4, vertical: 3, energy: 0.52 },
  actors: [
    { id: 'a', rank: 1, distance: 1290, lateral: -29, vertical: 8, lateralVelocity: 3.1, verticalVelocity: 0.9, speed: 306, roll: 0.38, energy: 0.86, boostSignal: 0.9 },
    { id: 'b', rank: 2, distance: 1250, lateral: 30, vertical: -10, lateralVelocity: -2.7, verticalVelocity: 0.4, speed: 298, roll: -0.34, energy: 0.46, boostSignal: 0.16 },
    { id: 'c', rank: 3, distance: 1200, lateral: 7, vertical: 24, lateralVelocity: 0.8, verticalVelocity: -1.4, speed: 289, roll: 0.61, energy: 0.65, boostSignal: 0.4 },
    { id: 'd', rank: 4, distance: 1160, lateral: -10, vertical: -21, lateralVelocity: 1.2, verticalVelocity: 1.1, speed: 280, roll: -0.14, energy: 0.36, boostSignal: 0.08 },
  ],
  previousLeader: { id: 'b', rank: 2, distance: 1250, lateral: 30, vertical: -10, lateralVelocity: -2.7, verticalVelocity: 0.4, speed: 298, roll: -0.34, energy: 0.46, boostSignal: 0.16 },
  course: { turnSign: -1, curvature: 0.019 },
};

const schedule = generateEpisodeSchedule({ seed: 'validity-contract', mode: 'assessment', courseLength: 11200, count: 16 });

function eventFor(family) {
  const found = schedule.find((event) => event.family === family) || schedule[0];
  return { ...found, family };
}

function rotateObservation(source, angle) {
  const rotated = structuredClone(source);
  for (const actor of rotated.actors) {
    [actor.lateral, actor.vertical] = V2.rotate([actor.lateral, actor.vertical], angle);
    [actor.lateralVelocity, actor.verticalVelocity] = V2.rotate([actor.lateralVelocity, actor.verticalVelocity], angle);
    actor.roll += angle;
  }
  if (rotated.previousLeader) {
    [rotated.previousLeader.lateral, rotated.previousLeader.vertical] = V2.rotate(
      [rotated.previousLeader.lateral, rotated.previousLeader.vertical], angle,
    );
    [rotated.previousLeader.lateralVelocity, rotated.previousLeader.verticalVelocity] = V2.rotate(
      [rotated.previousLeader.lateralVelocity, rotated.previousLeader.verticalVelocity], angle,
    );
    rotated.previousLeader.roll += angle;
  }
  [rotated.player.lateral, rotated.player.vertical] = V2.rotate(
    [rotated.player.lateral, rotated.player.vertical], angle,
  );
  return rotated;
}

// The leader-axis rule must be equivariant: rotating the complete visible configuration
// rotates the solution, rather than changing it to a memorised absolute side.
{
  const angle = 0.73;
  const event = eventFor('formation-mirror');
  const compact = structuredClone(observation);
  compact.actors.forEach((actor) => {
    actor.lateral *= 0.48; actor.vertical *= 0.48;
    actor.lateralVelocity *= 0.48; actor.verticalVelocity *= 0.48;
  });
  compact.player.lateral *= 0.48; compact.player.vertical *= 0.48;
  const original = resolveEpisode(event, compact, [compact.player.lateral, compact.player.vertical]);
  const rotatedObservation = rotateObservation(compact, angle);
  const rotatedStart = V2.rotate([compact.player.lateral, compact.player.vertical], angle);
  const rotated = resolveEpisode(event, rotatedObservation, rotatedStart);
  assert.ok(V2.distance(rotated.correctTarget, V2.rotate(original.correctTarget, angle)) < 1e-7);
}

// The rotating-frame rule must likewise transform with the entire visible frame.
{
  const angle = -0.61;
  const event = structuredClone(eventFor('rotating-frame'));
  const original = resolveEpisode(event, observation, [0, 0]);
  const transformedEvent = structuredClone(event);
  transformedEvent.rotor.center = V2.rotate(event.rotor.center, angle);
  transformedEvent.rotor.initialAngle += angle;
  const rotated = resolveEpisode(transformedEvent, rotateObservation(observation, angle), [0, 0]);
  assert.ok(V2.distance(rotated.correctTarget, V2.rotate(original.correctTarget, angle)) < 1e-6);
}

// Moderate motor noise must not destroy model identification. This checks the
// measurement layer, not merely exact, noiseless trajectories.
let classifications = 0;
let successes = 0;
for (const family of RELATION_FAMILIES) {
  const event = eventFor(family);
  const resolved = resolveEpisode(event, observation, [observation.player.lateral, observation.player.vertical]);
  const correct = resolved.paths.find((path) => path.id === resolved.correctId);
  for (let trial = 0; trial < 24; trial += 1) {
    const samples = Array.from({ length: 24 }, (_, index) => {
      const u = index / 23;
      const expected = correct.pointAt(u);
      const noise = [
        Math.sin((trial + 1) * 1.73 + index * 2.11) * 2.1,
        Math.cos((trial + 1) * 2.27 + index * 1.47) * 1.8,
      ];
      return {
        u,
        time: observation.time + u * 3.4,
        predictedArrivalTime: correct.targetArrivalTime ?? observation.time + 4,
        offset: V2.add(expected, noise),
      };
    });
    const fit = scoreTrajectoryHypotheses(samples, resolved.paths, { motorSigma: 7, timingSigma: 0.9 });
    classifications += 1;
    if (fit.best?.id === resolved.correctId) successes += 1;
  }
}
assert.ok(successes / classifications > 0.94, 'causal model classification must remain robust under realistic steering noise');

// Reasoning and piloting must dissociate: a player can execute a wrong model
// precisely. The model classification should be wrong while motor execution is high.
{
  const resolved = resolveEpisode(eventFor('vortex-frame-compose'), observation, [-4, 3]);
  const wrong = resolved.paths.find((path) => path.errorType);
  const samples = Array.from({ length: 28 }, (_, index) => {
    const u = index / 27;
    return { u, offset: wrong.pointAt(u), predictedArrivalTime: wrong.targetArrivalTime ?? observation.time + 4 };
  });
  const fit = scoreTrajectoryHypotheses(samples, resolved.paths, { motorSigma: 6, timingSigma: 0.8 });
  assert.equal(fit.best.id, wrong.id);
  assert.ok(motorExecutionScore(samples, wrong, 6) > 0.99);
  assert.notEqual(wrong.id, resolved.correctId);
}

// Changing only the visible race role must change a live-role solution.
{
  const event = eventFor('race-role');
  const before = resolveEpisode(event, observation, [0, 0]);
  const changed = structuredClone(observation);
  changed.actors[0].rank = 2;
  changed.actors[1].rank = 1;
  changed.previousLeader = structuredClone(observation.actors[0]);
  const after = resolveEpisode(event, changed, [0, 0]);
  assert.notDeepEqual(after.correctTarget, before.correctTarget);
}

// Cross-session signatures supplied as history should not be reproduced when the
// generator has structurally different configurations available.
{
  const first = generateEpisodeSchedule({ seed: 'history-a', mode: 'grand-prix', courseLength: 11200, count: 9 });
  const second = generateEpisodeSchedule({
    seed: 'history-b', mode: 'grand-prix', courseLength: 11200, count: 9,
    history: first.map((event) => event.signature),
  });
  assert.equal(second.filter((event) => first.some((old) => old.signature === event.signature)).length, 0);
}

console.log('Relational validity: observable equivariance, noisy identification, reasoning/motor dissociation, live roles and cross-session novelty validated.');
