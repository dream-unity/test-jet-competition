import assert from 'node:assert/strict';
import {
  composeMatrix,
  mat4Identity,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
} from '../src/renderer.js';

const model = composeMatrix([3, -2, 7], [0.2, -0.4, 0.7], [1.2, 0.8, 2.1]);
assert.equal(model.length, 16);
assert.ok([...model].every(Number.isFinite), 'model matrix must contain only finite numbers');
assert.deepEqual([...composeMatrix()], [...mat4Identity()], 'default model matrix must be identity');

const view = mat4LookAt([0, 10, -30], [0, 0, 40]);
const projection = mat4Perspective(Math.PI / 3, 16 / 9, 0.1, 1800);
const viewProjection = mat4Multiply(projection, view);
assert.ok([...view].every(Number.isFinite));
assert.ok([...projection].every(Number.isFinite));
assert.ok([...viewProjection].every(Number.isFinite));

console.log('Renderer math: finite transforms and valid camera projection.');
