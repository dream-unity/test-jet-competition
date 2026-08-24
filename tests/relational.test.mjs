import assert from 'node:assert/strict';
import {
  generateChallenge,
  validateChallenge,
  RelationalGenerator,
  INTERNALS,
} from '../src/relational.js';

assert.equal(INTERNALS.rotations, 23, 'cube rotation set should contain 23 non-identity rotations');
assert.equal(INTERNALS.reflections, 24, 'signed permutation reflection set should contain 24 matrices');
assert.equal(INTERNALS.frames, 24, 'frame set should contain 24 proper rotations');

const familyCoverage = new Set();
const signatures = new Set();
let generated = 0;

for (let level = 1; level <= 10; level += 1) {
  for (let index = 0; index < 180; index += 1) {
    const seed = `stress-${level}-${index}`;
    const challenge = generateChallenge({ seed, level, variant: index % 7 === 0 ? 'transfer' : 'mixed' });
    const validation = validateChallenge(challenge);
    assert.equal(validation.valid, true, `${seed}: ${validation.errors.join(', ')}`);
    assert.equal(challenge.candidates.length, challenge.candidateCount);
    assert.equal(challenge.layout.positions.length, challenge.candidateCount);
    assert.equal(challenge.candidates[challenge.correctIndex].errorModel, 'correct');
    assert.ok(challenge.correctIndex >= 0 && challenge.correctIndex < challenge.candidates.length);
    assert.ok(challenge.level >= 1 && challenge.level <= 10);
    familyCoverage.add(challenge.family);
    signatures.add(challenge.noveltySignature);
    generated += 1;

    const repeat = generateChallenge({ seed, level, variant: index % 7 === 0 ? 'transfer' : 'mixed' });
    assert.deepEqual(repeat, challenge, `${seed}: generation must be deterministic`);
  }
}

for (const family of ['rotation', 'reflection', 'trajectory', 'expansion', 'composition', 'frame', 'attribute']) {
  assert.ok(familyCoverage.has(family), `stress corpus did not cover ${family}`);
}
assert.ok(signatures.size > generated * 0.82, 'novelty signatures should have a large effective space');

const generator = new RelationalGenerator('session-seed');
const sessionSignatures = new Set();
for (let index = 0; index < 300; index += 1) {
  const challenge = generator.next(1 + (index % 10), index % 4 === 0 ? 'transfer' : 'mixed');
  assert.equal(sessionSignatures.has(challenge.noveltySignature), false, 'session generator repeated a novelty signature');
  sessionSignatures.add(challenge.noveltySignature);
}

const avoided = [...sessionSignatures].slice(0, 50);
const novel = generateChallenge({ seed: 'avoid-test', level: 8, variant: 'transfer', avoidSignatures: avoided });
assert.equal(avoided.includes(novel.noveltySignature), false);

console.log(`Relational engine: ${generated + 301} validated challenges; ${familyCoverage.size} families; no duplicate session signatures.`);
