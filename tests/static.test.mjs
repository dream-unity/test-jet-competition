import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html', 'styles.css', 'control-relations.css',
  'src/main.js', 'src/renderer.js', 'src/relational.js',
  'src/control-relations.js', 'src/systems.js',
  'src/world-relations.js', 'src/world-racing.js',
  'tests/world-relations.test.mjs',
  '.github/workflows/pages.yml', 'README.md', 'ASSET_MANIFEST.json',
  'THIRD_PARTY_NOTICES.md', '.nojekyll',
];
for (const path of required) {
  const details = await stat(new URL(`../${path}`, import.meta.url));
  assert.ok(details.isFile(), `${path} must be a file`);
}

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.match(index, /<canvas id="gameCanvas"/);
assert.match(index, /href="\.\/control-relations\.css"/);
assert.match(index, /id="controlRelationSystem"/);
assert.match(index, /id="controlRelationResults"/);
assert.match(index, /type="module" src="\.\/src\/main\.js"/);
assert.match(index, /type="module" src="\.\/src\/world-racing\.js"/);
assert.match(index, /No picture puzzles/);
assert.match(index, /control remapping occurs only inside visible moving-frame fields/);
assert.doesNotMatch(index, /16–30 second intervals/);
assert.doesNotMatch(index, /(?:src|href)="\//);
assert.doesNotMatch(index, /https?:\/\//);

const scripts = [
  'src/main.js', 'src/renderer.js', 'src/relational.js',
  'src/control-relations.js', 'src/systems.js',
  'src/world-relations.js', 'src/world-racing.js',
];
for (const script of scripts) {
  execFileSync(process.execPath, ['--check', new URL(`../${script}`, import.meta.url).pathname], { stdio: 'inherit' });
}

const worldModel = await readFile(new URL('../src/world-relations.js', import.meta.url), 'utf8');
assert.match(worldModel, /slipstream-intercept/);
assert.match(worldModel, /wake-intersection/);
assert.match(worldModel, /formation-mirror/);
assert.match(worldModel, /moving-frame/);
assert.match(worldModel, /temporal-window/);
assert.match(worldModel, /composed-intercept/);
assert.match(worldModel, /role-switch/);
assert.match(worldModel, /classifyCommit/);

const runtime = await readFile(new URL('../src/world-racing.js', import.meta.url), 'utf8');
assert.match(runtime, /reasoningDrive/);
assert.match(runtime, /updateReasoningAis/);
assert.match(runtime, /moving-frame-field/);
assert.match(runtime, /renderEndogenousWorld/);
assert.match(runtime, /environmental-control-fields\.v2/);
assert.doesNotMatch(runtime, /renderPattern\(/);
assert.doesNotMatch(runtime, /correctIndex|candidate\.pattern/);

// Legacy modules remain as a flight/rendering substrate and compatibility layer,
// but the active game entrypoint must supersede their puzzle/control scheduling.
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(main, /window\.impulseRun = new ImpulseRun/);
const controlModule = await readFile(new URL('../src/control-relations.js', import.meta.url), 'utf8');
assert.match(controlModule, /ControlRelationController/);
assert.doesNotMatch(worldModel, /https?:\/\//);
assert.doesNotMatch(runtime, /https?:\/\//);

const manifest = JSON.parse(await readFile(new URL('../ASSET_MANIFEST.json', import.meta.url), 'utf8'));
assert.equal(manifest.external_assets.length, 0);
assert.equal(manifest.runtime_dependencies.length, 0);

console.log('Static deployment: endogenous relational racing enabled, puzzle runtime bypassed, world-coupled control fields syntax-valid.');
