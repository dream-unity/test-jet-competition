import assert from 'node:assert/strict';
import {
  CONTROL_MAPPINGS,
  CONTROL_MODE_PROFILES,
  CONTROL_RELATION_INTERNALS,
  applyControlMapping,
  invertControlMapping,
  classifyControlResponse,
  generateControlSchedule,
  ControlRelationController,
} from '../src/control-relations.js';

assert.equal(CONTROL_RELATION_INTERNALS.mappings, 8, 'D4 control set must contain eight mappings');
assert.equal(CONTROL_RELATION_INTERNALS.simpleMappings, 4);
assert.equal(CONTROL_RELATION_INTERNALS.compoundMappings, 4);

const matrixKeys = new Set();
for (const mapping of CONTROL_MAPPINGS) {
  matrixKeys.add(mapping.matrix.join(','));
  const [a, b, c, d] = mapping.matrix;
  assert.equal(a * a + c * c, 1, `${mapping.id} first column must be unit length`);
  assert.equal(b * b + d * d, 1, `${mapping.id} second column must be unit length`);
  assert.ok(Math.abs(a * b + c * d) < 1e-12, `${mapping.id} columns must be orthogonal`);
  for (const vector of [[0.7, -0.2], [1, 0], [0, 1], [-0.4, 0.9]]) {
    const mapped = applyControlMapping(mapping, vector);
    const restored = invertControlMapping(mapping, mapped);
    assert.ok(Math.abs(restored[0] - vector[0]) < 1e-10, `${mapping.id} must invert x`);
    assert.ok(Math.abs(restored[1] - vector[1]) < 1e-10, `${mapping.id} must invert y`);
    assert.ok(Math.abs(Math.hypot(...mapped) - Math.hypot(...vector)) < 1e-10, `${mapping.id} must preserve magnitude`);
  }
}
assert.equal(matrixKeys.size, CONTROL_MAPPINGS.length, 'all mappings must be unique');

for (const mode of Object.keys(CONTROL_MODE_PROFILES)) {
  const schedule = generateControlSchedule({ seed: `schedule-${mode}`, mode, count: 600 });
  const repeat = generateControlSchedule({ seed: `schedule-${mode}`, mode, count: 600 });
  assert.deepEqual(repeat, schedule, `${mode} schedule must be deterministic`);
  assert.equal(schedule.length, 600);
  const profile = CONTROL_MODE_PROFILES[mode];
  const seen = new Set();
  const signatures = new Set();
  let compound = 0;
  schedule.forEach((event, index) => {
    assert.notEqual(event.fromId, event.toId, `${mode} cannot repeat the active mapping`);
    assert.ok(event.intervalAfter >= profile.intervalMin && event.intervalAfter <= profile.intervalMax, `${mode} interval must stay in bounds`);
    assert.ok(event.activationAt >= 10 && event.activationAt > event.cueAt);
    assert.ok(Math.abs(event.probes.input[0][0] * event.probes.input[1][1] - event.probes.input[0][1] * event.probes.input[1][0]) >= 0.45, 'probe pair must be non-collinear');
    event.probes.input.forEach((probe, probeIndex) => {
      assert.deepEqual(event.probes.output[probeIndex], applyControlMapping(event.toId, probe), 'cue output must exactly instantiate the mapping');
    });
    if (index > 0) assert.ok(event.activationAt > schedule[index - 1].activationAt, 'activation times must increase');
    seen.add(event.toId);
    signatures.add(event.signature);
    if (event.compound) compound += 1;
  });
  assert.equal(seen.size, CONTROL_MAPPINGS.length, `${mode} must eventually cover all mappings`);
  assert.ok(signatures.size > schedule.length * 0.92, `${mode} signatures require a large novelty space`);
  const share = compound / schedule.length;
  if (mode === 'transfer') assert.ok(share > 0.52, 'transfer should emphasize compound mappings');
  else assert.ok(share < 0.50, `${mode} should preserve bounded 70/30-style complexity`);
}

const avoidSource = generateControlSchedule({ seed: 'avoid-source', mode: 'transfer', count: 40 });
const avoided = avoidSource.map((event) => event.signature);
const avoidSchedule = generateControlSchedule({ seed: 'avoid-source', mode: 'transfer', count: 40, avoidSignatures: avoided });
assert.ok(avoidSchedule.every((event) => !avoided.includes(event.signature)), 'cross-session signatures must be avoidable');

const correct = classifyControlResponse({
  raw: [0, 1],
  reference: [1, 0],
  oldMapping: 'identity',
  newMapping: 'quarter-right',
});
assert.equal(correct.category, 'correct-compensation');
assert.equal(correct.correct, true);

const perseveration = classifyControlResponse({
  raw: [1, 0],
  reference: [1, 0],
  oldMapping: 'identity',
  newMapping: 'mirror-x',
});
assert.equal(perseveration.category, 'old-frame-perseveration');
assert.equal(perseveration.correct, false);

const inverse = classifyControlResponse({
  raw: [1, 0],
  reference: [1, 0],
  oldMapping: 'quarter-left',
  newMapping: 'mirror-x',
});
assert.equal(inverse.category, 'inverse-response');

const fakeApp = {
  state: 'racing',
  mode: 'grand-prix',
  gameTime: 0,
  race: {
    seed: 'headless-runtime',
    startWallTime: 123456,
    player: { x: 0, y: 0, z: 0, vx: 8, vy: 1, speed: 100, flash: 0 },
  },
  activeSector: () => null,
};
const controller = new ControlRelationController({ getApp: () => fakeApp });
let transformedSeen = false;
for (let tick = 0; tick <= 420; tick += 1) {
  fakeApp.gameTime = tick * 0.05;
  const transformed = controller.process({ x: 0.8, y: 0.2 });
  if (transformed.meta?.mapping && transformed.meta.mapping !== 'identity') transformedSeen = true;
}
assert.equal(transformedSeen, true, 'headless runtime should activate a non-identity control frame');
fakeApp.state = 'results';
controller.process({ x: 0, y: 0 });
const snapshot = controller.snapshot();
assert.ok(snapshot.summary.switches >= 1, 'headless runtime must record switch telemetry');
assert.equal(snapshot.schema, 'dream-unity.impulse-run.control-relations.v1');

console.log('Control relations: 8 orthogonal mappings, bounded jitter, deterministic novelty, runtime remapping, and diagnostic response topology validated.');
