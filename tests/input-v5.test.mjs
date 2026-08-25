import assert from 'node:assert/strict';
import { composeFlightAxes, shapeControlAxis } from '../src/fighter-input.js';

assert.equal(shapeControlAxis(0.02), 0, 'small device noise must be removed');
assert.ok(shapeControlAxis(0.35) > 0 && shapeControlAxis(0.35) < 0.35, 'mid-range input must be precision-shaped');
assert.equal(shapeControlAxis(1), 1);
assert.equal(shapeControlAxis(-1), -1);

const climb = composeFlightAxes({ keyboardPitch: 1 });
const dive = composeFlightAxes({ keyboardPitch: -1 });
assert.ok(climb.pitch > 0.99, 'W/ArrowUp/direct stick-up must command climb');
assert.ok(dive.pitch < -0.99, 'S/ArrowDown/direct stick-down must command dive');
assert.ok(composeFlightAxes({ keyboardPitch: 1, invertPitch: true }).pitch < -0.99, 'optional inverted pitch must invert only pitch');

const rightTurn = composeFlightAxes({ keyboardTurn: 1 });
const leftTurn = composeFlightAxes({ keyboardTurn: -1 });
assert.ok(rightTurn.turn > 0.99 && rightTurn.roll > 0.85 && rightTurn.yaw > 0.1, 'right input must create a coordinated right turn');
assert.ok(leftTurn.turn < -0.99 && leftTurn.roll < -0.85 && leftTurn.yaw < -0.1, 'left input must create a coordinated left turn');
assert.ok(rightTurn.pitch > 0, 'coordinated turning must add a small altitude-maintaining lift request');

const manualRoll = composeFlightAxes({ keyboardRoll: 1 });
assert.ok(manualRoll.roll > 0.99, 'manual roll must retain full barrel-roll authority');
assert.equal(manualRoll.turn, 0, 'manual roll must not masquerade as a turn request');
assert.equal(manualRoll.yaw, 0, 'manual roll must remain independent from rudder yaw');

const yaw = composeFlightAxes({ keyboardYaw: 1 });
assert.ok(yaw.yaw > 0.99 && yaw.roll === 0, 'rudder yaw must be independently controllable');

const blended = composeFlightAxes({ stickPitch: 0.35, mousePitch: 0.2, stickTurn: 0.3, mouseTurn: 0.25 });
assert.ok(blended.pitch > 0 && blended.pitch < 1);
assert.ok(blended.turn > 0 && blended.turn < 1);
assert.ok(Number.isFinite(blended.roll) && Number.isFinite(blended.yaw));

console.log('Input v5: direct pitch, coordinated turns, manual roll, rudder yaw and precision shaping validated.');
