import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import {
  WORLD_FAMILIES,
  CONTROL_FIELD_MAPPINGS,
  generateWorldSchedule,
  resolveWorldRelation,
  classifyCommit,
  applyMapping,
  noveltyRate,
} from '../src/world-relations.js';

function syntheticContext(t = 10, playerZ = 900, mirror = 1) {
  return {
    time: t,
    player: { x: 3 * mirror, y: 5, z: playerZ, vx: 2.4 * mirror, vy: -1.1, speed: 108 },
    racers: [
      { id: 0, x: -18 * mirror, y: 12, z: playerZ + 92, vx: 8.5 * mirror, vy: 2.4, speed: 111 },
      { id: 1, x: 16 * mirror, y: -4, z: playerZ + 56, vx: -5.1 * mirror, vy: 4.8, speed: 106 },
      { id: 2, x: 4 * mirror, y: 19, z: playerZ + 20, vx: 3.2 * mirror, vy: -5.7, speed: 103 },
      { id: 3, x: -8 * mirror, y: 2, z: playerZ - 14, vx: -1.4 * mirror, vy: 6.2, speed: 101 },
      { id: 4, x: 27 * mirror, y: 8, z: playerZ - 40, vx: 4.1 * mirror, vy: 1.3, speed: 99 },
    ],
  };
}

const sectors = Array.from({ length: 12 }, (_, index) => ({
  startZ: 500 + index * 790,
  commitZ: 1005 + index * 790,
  gateZ: 1150 + index * 790,
}));

for (const mode of ['training', 'grand-prix', 'assessment', 'transfer']) {
  for (let seed = 0; seed < 80; seed += 1) {
    const a = generateWorldSchedule({ seed: `stress-${seed}`, count: sectors.length, mode, sectors });
    const b = generateWorldSchedule({ seed: `stress-${seed}`, count: sectors.length, mode, sectors });
    assert.deepEqual(a, b, 'world schedule must be deterministic for seed/mode');
    assert.equal(a.length, sectors.length);
    assert.ok(a.every((event) => WORLD_FAMILIES.includes(event.family)));
    assert.ok(noveltyRate(a) >= 0.66, 'structural signatures should remain substantially novel within a run');
    assert.ok(a.filter((event) => event.family === 'moving-frame').length >= 2, 'long runs must contain multiple embodied control-frame fields');
    assert.equal(a[3].family, 'moving-frame');
    assert.equal(a[5].family, 'temporal-window');
    if (mode !== 'training') assert.equal(a.at(-1).family, 'composed-intercept');
  }
}

const seenFamilies = new Set();
for (let seed = 0; seed < 240; seed += 1) {
  const schedule = generateWorldSchedule({ seed: `family-${seed}`, count: 12, mode: 'grand-prix', sectors });
  for (const event of schedule) {
    seenFamilies.add(event.family);
    for (const t of [4, 11, 23]) {
      const relation = resolveWorldRelation(event, syntheticContext(t, event.startZ + 280));
      assert.equal(relation.target.length, 2);
      assert.ok(Number.isFinite(relation.target[0]) && Number.isFinite(relation.target[1]));
      assert.ok(Math.abs(relation.target[0]) <= 63.001);
      assert.ok(relation.target[1] >= -28.001 && relation.target[1] <= 40.001);
      assert.ok(relation.alternatives.length >= 3);
      assert.ok(relation.alternatives.every((alt) => alt.id && alt.point.length === 2));
      const exact = classifyCommit({ position: relation.target, target: relation.target, alternatives: relation.alternatives, correctRadius: 20, margin: 0 });
      assert.ok(exact.targetDistance < 1e-8);
      assert.ok(exact.confidenceMargin >= -1e-8);
    }
  }
}
assert.deepEqual([...seenFamilies].sort(), [...WORLD_FAMILIES].sort(), 'stress generation must exercise every relational-racing family');

for (const mapping of CONTROL_FIELD_MAPPINGS) {
  for (const vector of [[1, 0], [0, 1], [0.6, -0.8], [-0.3, 0.4]]) {
    const mapped = applyMapping(mapping, vector);
    assert.ok(Math.abs(Math.hypot(...mapped) - Math.hypot(...vector)) < 1e-9, `${mapping.id} must preserve input magnitude`);
  }
}

const lateralSigns = new Map(WORLD_FAMILIES.map((family) => [family, new Set()]));
for (let seed = 0; seed < 400; seed += 1) {
  const schedule = generateWorldSchedule({ seed: `balance-${seed}`, count: 12, mode: 'transfer', sectors });
  for (const event of schedule) {
    const target = resolveWorldRelation(event, syntheticContext(seed * 0.17 + 3, event.startZ + 300, seed % 2 ? -1 : 1)).target;
    if (Math.abs(target[0]) > 2) lateralSigns.get(event.family).add(Math.sign(target[0]));
  }
}
for (const [family, signs] of lateralSigns) {
  assert.ok(signs.has(-1) && signs.has(1), `${family} must not be learnable as a fixed left/right route`);
}

const runtime = await readFile(new URL('../src/world-racing.js', import.meta.url), 'utf8');
assert.doesNotMatch(runtime, /renderPattern\(/, 'endogenous runtime must not render legacy glyph-pattern puzzles');
assert.doesNotMatch(runtime, /correctIndex|candidate\.pattern/, 'endogenous runtime must not rely on picture-answer indices');
assert.match(runtime, /reasoningDrive/, 'reasoning must causally alter engine performance');
assert.match(runtime, /moving-frame-field/, 'control transforms must be attached to visible world fields');
assert.match(runtime, /updateReasoningAis/, 'AI competitors must participate in the same relational world');
execFileSync(process.execPath, ['--check', new URL('../src/world-racing.js', import.meta.url).pathname], { stdio: 'inherit' });

console.log('Endogenous relational racing: deterministic, world-coupled, practice-resistant geometry and control fields validated.');
