import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html', 'fighter-v4.css', 'single-race-v5.css',
  'src/math3d.js', 'src/renderer-v4.js', 'src/fighter-audio.js',
  'src/fighter-input.js', 'src/fighter-flight.js', 'src/course3d.js',
  'src/fighter-visuals.js', 'src/relational-racing.js', 'src/race-progression.js',
  'src/fighter-game.js', 'src/single-race-v5.js',
  'tests/input-v5.test.mjs', 'tests/fighter-flight.test.mjs', 'tests/course3d.test.mjs',
  'tests/race-progression.test.mjs', 'tests/relational-racing-v4.test.mjs',
  'tests/relational-validity.test.mjs', 'tests/fighter-visuals.test.mjs',
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
assert.match(index, /src="\.\/src\/single-race-v5\.js"/);
assert.match(index, /href="\.\/fighter-v4\.css"/);
assert.match(index, /href="\.\/single-race-v5\.css"/);
assert.match(index, /ONE CONTINUOUS COMPETITION/);
assert.match(index, /6 JETS · 10 LEVELS · 1 FINISH/);
assert.match(index, /id="pitchButton"/);
assert.match(index, /id="flightStick"/);
assert.match(index, /id="systemsStick"/);
assert.match(index, /id="resultTransfer"/);
assert.equal((index.match(/class="level-node/g) || []).length, 10, 'menu must show exactly ten levels');
assert.doesNotMatch(index, /class="mode-card|data-mode=|MODE SELECT|FLIGHT SCHOOL|BLIND ASSESSMENT|HELD-OUT TRANSFER CIRCUIT/i);
assert.doesNotMatch(index, /src="\.\/src\/(?:main|world-racing|fighter-game)\.js"/);
assert.doesNotMatch(index, /controlRelationSystem|correctIndex|candidate|A\s*(?:→|->)\s*B/i);
assert.doesNotMatch(index, /(?:src|href)="\//);
assert.doesNotMatch(index, /https?:\/\//);

const scripts = [
  'src/math3d.js', 'src/renderer-v4.js', 'src/fighter-audio.js',
  'src/fighter-input.js', 'src/fighter-flight.js', 'src/course3d.js',
  'src/fighter-visuals.js', 'src/relational-racing.js', 'src/race-progression.js',
  'src/fighter-game.js', 'src/single-race-v5.js',
];
for (const script of scripts) {
  execFileSync(process.execPath, ['--check', new URL(`../${script}`, import.meta.url).pathname], { stdio: 'inherit' });
}

const integration = await readFile(new URL('../src/single-race-v5.js', import.meta.url), 'utf8');
for (const marker of [
  'SINGLE_RACE_CONFIG', 'decorateProgressiveEpisodes', 'ONE RACE',
  'updateForgivingProgress', 'updateOneRaceCountdown', 'LEVEL_PLAN',
  'checkpointMiss = null', 'PITCH_SETTING_KEY',
]) assert.match(integration, new RegExp(marker));
assert.doesNotMatch(integration, /startRace\(['"](?:training|assessment|transfer)/);

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

const input = await readFile(new URL('../src/fighter-input.js', import.meta.url), 'utf8');
for (const marker of ['composeFlightAxes', 'keyboardTurn', 'manualRoll', 'turnLiftAssist', 'KeyZ', 'KeyX', 'mouseOrigin']) {
  assert.match(input, new RegExp(marker));
}
assert.match(input, /KeyW[^\n]+ArrowUp/);

const flight = await readFile(new URL('../src/fighter-flight.js', import.meta.url), 'utf8');
for (const marker of [
  'orientation', 'angularVelocity', 'angleOfAttack', 'sideslip', 'afterburner',
  'airbrake', 'gLoad', 'stall', 'maximumSpeed', 'coordinatedTurnAssist', 'substepSeconds',
]) assert.match(flight, new RegExp(marker));

const relation = await readFile(new URL('../src/relational-racing.js', import.meta.url), 'utf8');
for (const marker of [
  'vortex-convergence', 'formation-mirror', 'rotating-frame', 'temporal-relay',
  'energy-intercept', 'race-role', 'vortex-frame-compose', 'formation-temporal-compose',
  'scoreTrajectoryHypotheses', 'correctPath', 'temporalFieldOpen',
]) assert.match(relation, new RegExp(marker));
assert.doesNotMatch(relation, /correctIndex|candidate\.pattern/);

const progression = await readFile(new URL('../src/race-progression.js', import.meta.url), 'utf8');
assert.match(progression, /LEVEL_PLAN/);
assert.match(progression, /level:\s*10/);
assert.match(progression, /heldOut:\s*true/);
assert.match(progression, /playerSpeed:\s*500/);

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

const pages = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
assert.match(pages, /npm test/);
assert.match(pages, /single-race-v5\.css/);
assert.match(pages, /cp -R src/);
const live = await readFile(new URL('../.github/workflows/live-verify.yml', import.meta.url), 'utf8');
assert.match(live, /src\/single-race-v5\.js/);
assert.match(live, /single-race-v5\.css/);
assert.match(live, /src\/fighter-flight\.js/);

console.log('Static deployment: one race, ten levels, direct controls, fluid Mach flight and complete GitHub Pages surface validated.');
