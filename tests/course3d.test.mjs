import assert from 'node:assert/strict';
import { Course3D } from '../src/course3d.js';
import { V3 } from '../src/math3d.js';

const course = new Course3D('course-test');
assert.ok(course.length > 10000, 'course must support a substantial high-speed race');
assert.ok(course.samples.length > 700, 'course must be densely sampled for stable free flight');

let minimumAltitude = Infinity;
let maximumAltitude = -Infinity;
let curvatureSeen = false;
for (let distance = 0; distance <= course.length; distance += 180) {
  const frame = course.frameAt(distance);
  minimumAltitude = Math.min(minimumAltitude, frame.position[1]);
  maximumAltitude = Math.max(maximumAltitude, frame.position[1]);
  assert.ok(Math.abs(V3.length(frame.forward) - 1) < 1e-5);
  assert.ok(Math.abs(V3.length(frame.right) - 1) < 1e-5);
  assert.ok(Math.abs(V3.length(frame.up) - 1) < 1e-5);
  assert.ok(Math.abs(V3.dot(frame.forward, frame.right)) < 1e-4);
  assert.ok(Math.abs(V3.dot(frame.forward, frame.up)) < 1e-4);
  assert.ok(Math.abs(V3.dot(frame.right, frame.up)) < 1e-4);
  if (Math.abs(frame.bank) > 0.05) curvatureSeen = true;
}
assert.ok(maximumAltitude - minimumAltitude > 430, 'course must exploit substantial vertical space');
assert.ok(curvatureSeen, 'course must include banked three-dimensional turns');

for (const distance of [0, 500, 2800, 6200, 9200, course.length - 20]) {
  const world = course.offsetToWorld(distance, 21, -13);
  const nearest = course.nearestProgress(world, distance);
  assert.ok(Math.abs(nearest.distance - distance) < 18);
  assert.ok(Math.abs(nearest.lateral - 21) < 1.4);
  assert.ok(Math.abs(nearest.vertical + 13) < 1.4);
}

console.log('Course: long-form 3D spline, parallel-transport frames, banking and offset recovery validated.');
