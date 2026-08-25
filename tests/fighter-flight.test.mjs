import assert from 'node:assert/strict';
import { FighterFlightModel } from '../src/fighter-flight.js';
import { V3 } from '../src/math3d.js';

function simulate(input, seconds = 4, setup = null) {
  const model = new FighterFlightModel();
  if (setup) setup(model);
  model.setInput(input);
  const trace = [];
  for (let step = 0; step < seconds * 120; step += 1) {
    model.update(1 / 120);
    if (step % 4 === 0) {
      trace.push({
        position: [...model.state.position],
        speed: model.state.speed,
        gLoad: model.state.gLoad,
        forward: [...model.axes().forward],
        up: [...model.axes().up],
      });
    }
  }
  return { model, trace };
}

const baseline = simulate({}, 4);
const boosted = simulate({ afterburner: true }, 4);
const braking = simulate({ airbrake: true }, 4);
assert.ok(boosted.model.state.speed > baseline.model.state.speed + 35, 'afterburner must create substantial acceleration');
assert.ok(braking.model.state.speed < baseline.model.state.speed - 65, 'airbrake must create substantial deceleration');

const sustainedBoost = simulate({ afterburner: true, throttleSet: 1 }, 7);
assert.ok(sustainedBoost.model.state.speed > 650, 'fighter must sustain more than 2,300 km/h under afterburner');
assert.ok(sustainedBoost.trace.some((sample) => sample.speed > 750), 'fighter must enter a genuine Mach-class racing envelope');

const yawed = simulate({ yaw: 1 }, 2.5);
assert.ok(Math.abs(yawed.model.axes().forward[0]) > 0.55, 'yaw must change the true aircraft heading');

const rolled = simulate({ roll: 1 }, 0.8);
assert.ok(Math.abs(rolled.model.axes().up[0]) > 0.45, 'roll must rotate the aircraft lift axis');

const bankAndPull = simulate({ roll: 0.72, pitch: 0.68 }, 4);
assert.ok(Math.abs(bankAndPull.model.state.position[0]) > 130, 'bank-and-pull must generate a real curved flight path');
assert.ok(bankAndPull.model.state.speed < baseline.model.state.speed - 35, 'high-G turning must bleed energy');
assert.ok(Math.max(...bankAndPull.trace.map((sample) => sample.gLoad)) > 1.8, 'hard manoeuvring must generate measurable G-load');

const loop = simulate({ pitch: 1 }, 4.6);
const minimumForwardZ = Math.min(...loop.trace.map((sample) => sample.forward[2]));
const loopAltitudes = loop.trace.map((sample) => sample.position[1]);
assert.ok(minimumForwardZ < -0.45, 'sustained pitch must pass through backward-facing orientation during a loop');
assert.ok(Math.max(...loopAltitudes) - Math.min(...loopAltitudes) > 140, 'the loop must trace a substantial vertical arc');

const climb = simulate({ pitch: 0.58 }, 2.6);
const dive = simulate({ pitch: -0.58 }, 2.6);
assert.ok(climb.model.state.position[1] > dive.model.state.position[1] + 180, 'pitch must control three-dimensional altitude');
assert.ok(dive.model.state.speed > climb.model.state.speed + 18, 'dives must exchange altitude for energy');

const inverted = simulate({ roll: 1 }, 1.4);
assert.ok(inverted.trace.some((sample) => V3.dot(sample.up, [0, 1, 0]) < -0.65), 'fighter must support inverted flight');

for (const result of [baseline, boosted, braking, sustainedBoost, yawed, rolled, bankAndPull, loop, climb, dive, inverted]) {
  const model = result.model;
  const qLength = Math.hypot(...model.state.orientation);
  assert.ok(Math.abs(qLength - 1) < 1e-6, 'orientation quaternion must remain normalized');
  const axes = model.axes();
  assert.ok(Math.abs(V3.dot(axes.forward, axes.up)) < 1e-6, 'fighter axes must remain orthogonal');
  assert.ok(Number.isFinite(model.state.gLoad));
}

console.log('Fighter flight: Mach-class acceleration, 6-DoF heading, banked turns, loops, inversion and energy exchange validated.');
