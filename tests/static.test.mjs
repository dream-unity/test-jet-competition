import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html',
  'styles.css',
  'control-relations.css',
  'src/main.js',
  'src/renderer.js',
  'src/relational.js',
  'src/control-relations.js',
  'src/systems.js',
  '.github/workflows/pages.yml',
  'README.md',
  'ASSET_MANIFEST.json',
  'THIRD_PARTY_NOTICES.md',
  '.nojekyll',
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
assert.doesNotMatch(index, /(?:src|href)="\//, 'root-absolute asset paths break repository-subpath Pages deployments');
assert.doesNotMatch(index, /https?:\/\//, 'runtime should not depend on third-party network assets');

const scripts = [
  'src/main.js',
  'src/renderer.js',
  'src/relational.js',
  'src/control-relations.js',
  'src/systems.js',
];
for (const script of scripts) {
  execFileSync(process.execPath, ['--check', new URL(`../${script}`, import.meta.url).pathname], { stdio: 'inherit' });
}

const controlModule = await readFile(new URL('../src/control-relations.js', import.meta.url), 'utf8');
assert.match(controlModule, /CONTROL_MAPPINGS/);
assert.match(controlModule, /generateControlSchedule/);
assert.match(controlModule, /classifyControlResponse/);
assert.match(controlModule, /ControlRelationController/);
assert.doesNotMatch(controlModule, /https?:\/\//, 'control-frame system must remain dependency-free');

const manifest = JSON.parse(await readFile(new URL('../ASSET_MANIFEST.json', import.meta.url), 'utf8'));
assert.equal(manifest.external_assets.length, 0);
assert.equal(manifest.runtime_dependencies.length, 0);

console.log('Static deployment: repository-relative, dependency-free, control-frame enabled and syntax-valid.');
