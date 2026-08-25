import assert from 'node:assert/strict';
import { registerFighterMeshes, FIGHTER_AIRFRAMES } from '../src/fighter-visuals.js';

const renderer = {
  meshes: {},
  createMesh(data) { return data; },
};
registerFighterMeshes(renderer);

const requiredMeshes = [
  'fighterFuselageV4', 'fighterEngineV4', 'fighterNozzleV4', 'fighterCanopyV4',
  'fighterWingPairV4', 'fighterTailPairV4', 'fighterCanardPairV4', 'fighterFinV4',
];
for (const name of requiredMeshes) assert.ok(renderer.meshes[name], `${name} must be procedurally generated`);

const fuselage = renderer.meshes.fighterFuselageV4;
const canopy = renderer.meshes.fighterCanopyV4;
assert.ok(fuselage.positions.length / 3 >= 270, 'fuselage must be a volumetric multi-section body rather than a triangle arrow');
assert.ok(fuselage.indices.length / 3 >= 450, 'fuselage must have substantial surface geometry');
assert.ok(canopy.indices.length / 3 >= 600, 'canopy must be smoothly curved');

const triangleCount = Object.values(renderer.meshes)
  .reduce((sum, mesh) => sum + (mesh.indices?.length || mesh.positions.length / 3) / 3, 0);
assert.ok(triangleCount >= 1400, 'procedural fighter component library must exceed low-poly placeholder geometry by orders of magnitude');
assert.deepEqual(Object.keys(FIGHTER_AIRFRAMES).sort(), ['apex', 'kestrel', 'spectre']);

console.log(`Fighter visuals: ${Math.round(triangleCount)} procedural component triangles and three differentiated airframes validated.`);
