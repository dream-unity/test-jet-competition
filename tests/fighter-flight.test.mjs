import assert from 'node:assert/strict';
import { FighterFlightModel } from '../src/fighter-flight.js';
import { Q, V3 } from '../src/math3d.js';

function simulate(input, seconds = 4, setup = null) {
  const model = new FighterFlightModel();
  if (setup) setup(model);
  model.setInput(input);
  for (let step = 0; step < seconds * 120; step += 1) model.update(1 / 120);
  return model;
}

const baseline = simulate({}, 4);
const boosted = simulate({ afterburner: true }, 4);
const braking = simulate({ airbrake: true }, 4);
assert.ok(boosted.state.speed > baseline.state.speed + 35, 'afterburner must create substantial acceleration');
assert.ok(braking.state.speed < baseline.state.speed - 65, 'airbrake must create substantial deceleration');

const yawed = simulate({ yaw: 1 }, 2.5);
assert.ok(Math.abs(yawed.axes().forward[0]) > 0.55, 'yaw must change the true aircraft heading');

const rolled = simulate({ roll: 1 }, 0.8);
assert.ok(Math.abs(rolled.axes().up[0]) > 0.45, 'roll must rotate the aircraft lift axis');

const bankAndPull = simulate({ roll: 0.72, pitch: 0.68 }, 4);
assert.ok(Math.abs(bankAndPull.state.position[0]) > 130, 'bank-and-pull must generate a real curved flight path');
assert.ok(bankAndPull.state.speed < baseline.state.speed - 45, 'high-G turning must bleed energy');
assert.ok(bankAndPull.state.gLoad > 1.8, 'hard manoeuvring must generate measurable G-load');

const loop = simulate({ pitch: 1 }, 4.1);
assert.ok(loop.axes().forward[2] < -0.35, 'sustained pitch must permit the fighter to pass through a loop into backward-facing orientation');
assert.ok(loop.state.position[1] > 300, 'the loop must be a genuine vertical manoeuvre');

const climb = simulate({ pitch: 0.58 }, 2.6);
const dive = simulate({ pitch: -0.58 }, 2.6);
assert.ok(climb.state.position[1] > dive.state.position[1] + 180, 'pitch must control three-dimensional altitude');
assert.ok(dive.state.speed > climb.state.speed + 18, 'dives must exchange altitude for energy');

for (const model of [baseline, boosted, braking, yawed, rolled, bankAndPull, loop, climb, dive]) {
  const qLength = Math.hypot(...model.state.orientation);
  assert.ok(Math.abs(qLength - 1) < 1e-6, 'orientation quaternion must remain normalized');
  const axes = model.axes();
  assert.ok(Math.abs(V3.dot(axes.forward, axes.up)) < 1e-6, 'fighter axes must remain orthogonal');
  assert.ok(Number.isFinite(model.state.gLoad));
}

const inverted = simulate({ roll: 1 }, 1.4);
assert.ok(V3.dot(inverted.axes().up, [0, 1, 0]) < -0.65, 'fighter must support inverted flight');

console.log('Fighter flight: 6-DoF orientation, banked turning, loops, inversion, energy exchange and afterburner validated.');
