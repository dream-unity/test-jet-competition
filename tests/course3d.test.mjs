import assert from 'node:assert/strict';
import { Course3D } from '../src/course3d.js';
import { V3 } from '../src/math3d.js';

const course = new Course3D('course-test');
assert.ok(course.length > 48000, 'course must sustain a full Mach-class ten-level race');
assert.ok(course.samples.length > 1600, 'course must be densely sampled for stable high-speed free flight');
assert.ok(course.width >= 180 && course.height >= 130, 'course envelope must allow genuine fighter manoeuvring');

let minimumAltitude = Infinity;
let maximumAltitude = -Infinity;
let curvatureSeen = false;
let strongBankSeen = false;
for (let distance = 0; distance <= course.length; distance += 360) {
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
  if (Math.abs(frame.bank) > 0.35) strongBankSeen = true;
}
assert.ok(maximumAltitude - minimumAltitude > 700, 'course must exploit substantial vertical space');
assert.ok(curvatureSeen, 'course must include banked three-dimensional turns');
assert.ok(strongBankSeen, 'course must include visually meaningful high-speed banking');

for (const distance of [0, 1200, 9400, 21800, 37600, course.length - 30]) {
  const world = course.offsetToWorld(distance, 31, -19);
  const nearest = course.nearestProgress(world, distance);
  assert.ok(Math.abs(nearest.distance - distance) < 30);
  assert.ok(Math.abs(nearest.lateral - 31) < 2.2);
  assert.ok(Math.abs(nearest.vertical + 19) < 2.2);
}

const checkpoints = course.checkpointDistances(20);
assert.equal(checkpoints.length, 20);
assert.ok(checkpoints.every((value, index) => index === 0 || value > checkpoints[index - 1]));

console.log('Course: 48+ km Mach circuit, wide 3D envelope, banking and high-speed offset recovery validated.');
