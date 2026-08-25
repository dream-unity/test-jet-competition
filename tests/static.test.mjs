import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html', 'fighter-v4.css',
  'src/math3d.js', 'src/renderer-v4.js', 'src/fighter-audio.js',
  'src/fighter-input.js', 'src/fighter-flight.js', 'src/course3d.js',
  'src/fighter-visuals.js', 'src/relational-racing.js', 'src/fighter-game.js',
  'tests/fighter-flight.test.mjs', 'tests/course3d.test.mjs',
  'tests/relational-racing-v4.test.mjs', 'tests/relational-validity.test.mjs',
  'tests/fighter-visuals.test.mjs',
  '.github/workflows/pr-validate.yml', '.github/workflows/pages.yml',
  '.github/workflows/ci-receipt.yml', '.github/workflows/live-verify.yml',
  'README.md', 'DESIGN_CONTRACT.md', 'ASSET_MANIFEST.json',
  'THIRD_PARTY_NOTICES.md', '.nojekyll',
];
for (const path of required) {
  const details = await stat(new URL(`../${path}`, import.meta.url));
  assert.ok(details.isFile(), `${path} must exist as a file`);
}

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.match(index, /<canvas id="gameCanvas"/);
assert.match(index, /src="\.\/src\/fighter-game\.js"/);
assert.match(index, /href="\.\/fighter-v4\.css"/);
assert.match(index, /id="flightStick"/);
assert.match(index, /id="systemsStick"/);
assert.match(index, /id="resultTransfer"/);
assert.doesNotMatch(index, /src="\.\/src\/(?:main|world-racing)\.js"/);
assert.doesNotMatch(index, /controlRelationSystem|correctIndex|candidate|A\s*(?:→|->)\s*B/i);
assert.doesNotMatch(index, /(?:src|href)="\//);
assert.doesNotMatch(index, /https?:\/\//);

const scripts = [
  'src/math3d.js', 'src/renderer-v4.js', 'src/fighter-audio.js',
  'src/fighter-input.js', 'src/fighter-flight.js', 'src/course3d.js',
  'src/fighter-visuals.js', 'src/relational-racing.js', 'src/fighter-game.js',
];
for (const script of scripts) {
  execFileSync(process.execPath, ['--check', new URL(`../${script}`, import.meta.url).pathname], { stdio: 'inherit' });
}

const runtime = await readFile(new URL('../src/fighter-game.js', import.meta.url), 'utf8');
assert.match(runtime, /new FighterFlightModel/);
assert.match(runtime, /new Course3D/);
assert.match(runtime, /scoreTrajectoryHypotheses/);
assert.match(runtime, /reasoningDrive/);
assert.match(runtime, /checkpointDistances/);
assert.match(runtime, /inferredAt/);
assert.match(runtime, /renderVortexEvidence/);
assert.match(runtime, /renderFormationEvidence/);
assert.match(runtime, /renderRotorEvidence/);
assert.match(runtime, /renderTemporalEvidence/);
assert.match(runtime, /renderEnergyEvidence/);
assert.doesNotMatch(runtime, /correctIndex|candidate\.pattern|renderPattern\(|nearestCandidate|new ImpulseRun/);

const flight = await readFile(new URL('../src/fighter-flight.js', import.meta.url), 'utf8');
for (const marker of ['orientation', 'angularVelocity', 'angleOfAttack', 'sideslip', 'afterburner', 'airbrake', 'gLoad', 'stall']) {
  assert.match(flight, new RegExp(marker));
}

const relation = await readFile(new URL('../src/relational-racing.js', import.meta.url), 'utf8');
for (const marker of [
  'vortex-convergence', 'formation-mirror', 'rotating-frame', 'temporal-relay',
  'energy-intercept', 'race-role', 'vortex-frame-compose', 'formation-temporal-compose',
  'scoreTrajectoryHypotheses', 'correctPath', 'temporalFieldOpen',
]) assert.match(relation, new RegExp(marker));
assert.doesNotMatch(relation, /correctIndex|candidate\.pattern/);

const renderer = await readFile(new URL('../src/renderer-v4.js', import.meta.url), 'utf8');
assert.doesNotMatch(renderer, /https?:\/\/|from\s+['"][^./]/);
const visuals = await readFile(new URL('../src/fighter-visuals.js', import.meta.url), 'utf8');
assert.match(visuals, /createLathe/);
assert.match(visuals, /fighterFuselageV4/);
assert.match(visuals, /fighterCanopyV4/);
assert.match(visuals, /fighterNozzleV4/);

const manifest = JSON.parse(await readFile(new URL('../ASSET_MANIFEST.json', import.meta.url), 'utf8'));
assert.equal(manifest.external_assets.length, 0);
assert.equal(manifest.runtime_dependencies.length, 0);
assert.equal(manifest.architecture, 'causal-relational-fighter-racing-v4');

const pages = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
assert.match(pages, /npm test/);
assert.match(pages, /fighter-v4\.css/);
assert.match(pages, /cp -R src/);
const live = await readFile(new URL('../.github/workflows/live-verify.yml', import.meta.url), 'utf8');
assert.match(live, /src\/fighter-game\.js/);
assert.match(live, /src\/relational-racing\.js/);
assert.match(live, /src\/fighter-flight\.js/);

console.log('Static deployment: self-contained fighter-flight runtime, causal relational engine, clean v4 entrypoint and GitHub Pages surface validated.');
