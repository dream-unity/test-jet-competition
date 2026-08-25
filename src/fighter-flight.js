import { clamp, smoothstep, V3, Q } from './math3d.js';

const GRAVITY = 9.80665;

const DEFAULT_CONFIG = Object.freeze({
  mass: 11800,
  cruiseSpeed: 285,
  minimumControlSpeed: 72,
  structuralSpeed: 610,
  baseThrustAcceleration: 28,
  afterburnerAcceleration: 19,
  dragCoefficient: 0.00025,
  airbrakeCoefficient: 0.00072,
  inducedDrag: 8.5,
  pitchRate: 1.28,
  yawRate: 0.72,
  rollRate: 2.35,
  angularResponse: 5.4,
  angularDamping: 1.7,
  velocityAlignment: 1.12,
  liftAuthority: 2.65,
  stabilityAssist: 0.82,
  afterburnerDrain: 0.115,
  afterburnerRecharge: 0.052,
  throttleResponse: 1.45,
});

export function createInitialFighterState({
  position = [0, 140, 0],
  forward = [0, 0, 1],
  up = [0, 1, 0],
  speed = 275,
  throttle = 0.76,
} = {}) {
  const orientation = Q.lookRotation(forward, up);
  return {
    position: [...position],
    velocity: V3.scale(V3.normalize(forward), speed),
    orientation,
    angularVelocity: [0, 0, 0],
    throttle,
    commandedThrottle: throttle,
    afterburnerEnergy: 1,
    airbrake: 0,
    health: 1,
    shield: 1,
    heat: 0,
    gLoad: 1,
    angleOfAttack: 0,
    sideslip: 0,
    stall: 0,
    speed,
    mach: speed / 343,
    altitude: position[1],
    controlSurfaces: { pitch: 0, roll: 0, yaw: 0 },
    lastAcceleration: [0, 0, 0],
    afterburnerActive: false,
  };
}

export class FighterFlightModel {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = createInitialFighterState(config.initialState || {});
    this.input = {
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttleDelta: 0,
      throttleSet: null,
      afterburner: false,
      airbrake: false,
    };
  }

  reset(options = {}) {
    this.state = createInitialFighterState(options);
    return this.state;
  }

  setInput(input = {}) {
    this.input.pitch = clamp(Number(input.pitch) || 0, -1, 1);
    this.input.roll = clamp(Number(input.roll) || 0, -1, 1);
    this.input.yaw = clamp(Number(input.yaw) || 0, -1, 1);
    this.input.throttleDelta = clamp(Number(input.throttleDelta) || 0, -1, 1);
    this.input.throttleSet = Number.isFinite(input.throttleSet) ? clamp(input.throttleSet, 0, 1) : null;
    this.input.afterburner = Boolean(input.afterburner);
    this.input.airbrake = Boolean(input.airbrake);
  }

  axes() {
    const q = this.state.orientation;
    return {
      right: Q.rotateVector(q, [1, 0, 0]),
      up: Q.rotateVector(q, [0, 1, 0]),
      forward: Q.rotateVector(q, [0, 0, 1]),
    };
  }

  applyImpulse(impulse) {
    this.state.velocity = V3.add(this.state.velocity, impulse);
  }

  update(dt, externalAccelerations = []) {
    const step = clamp(dt, 0, 0.04);
    if (step <= 0) return this.state;
    const state = this.state;
    const config = this.config;
    const input = this.input;

    if (input.throttleSet !== null) state.commandedThrottle = input.throttleSet;
    state.commandedThrottle = clamp(state.commandedThrottle + input.throttleDelta * step * 0.42, 0.12, 1);
    state.throttle += (state.commandedThrottle - state.throttle) * (1 - Math.exp(-config.throttleResponse * step));

    const speedBefore = Math.max(0.01, V3.length(state.velocity));
    const controlAuthority = clamp((speedBefore - 35) / (config.minimumControlSpeed + 25), 0.24, 1.08);
    const targetRates = [
      -input.pitch * config.pitchRate * controlAuthority,
      input.yaw * config.yawRate * controlAuthority,
      input.roll * config.rollRate * controlAuthority,
    ];
    const angularBlend = 1 - Math.exp(-config.angularResponse * step);
    state.angularVelocity = state.angularVelocity.map((value, index) => (
      value + (targetRates[index] - value) * angularBlend
    ));
    const damping = Math.exp(-config.angularDamping * step * (0.18 + (1 - controlAuthority) * 0.55));
    state.angularVelocity = state.angularVelocity.map((value) => value * damping);
    state.orientation = Q.integrateBodyRates(state.orientation, state.angularVelocity, step);

    const axes = this.axes();
    const velocityDirection = V3.normalize(state.velocity);
    const localVelocity = Q.inverseRotateVector(state.orientation, state.velocity);
    const forwardComponent = Math.max(0.1, localVelocity[2]);
    state.angleOfAttack = Math.atan2(-localVelocity[1], forwardComponent);
    state.sideslip = Math.atan2(localVelocity[0], forwardComponent);
    const absoluteAoA = Math.abs(state.angleOfAttack);
    state.stall = smoothstep((absoluteAoA - 0.34) / 0.46) * smoothstep((115 - speedBefore) / 65 + 0.28);

    const afterburnerAvailable = input.afterburner && state.afterburnerEnergy > 0.004 && state.throttle > 0.72;
    state.afterburnerActive = afterburnerAvailable;
    if (afterburnerAvailable) {
      state.afterburnerEnergy = Math.max(0, state.afterburnerEnergy - config.afterburnerDrain * step);
      state.heat = Math.min(1, state.heat + step * 0.18);
    } else {
      state.afterburnerEnergy = Math.min(1, state.afterburnerEnergy + config.afterburnerRecharge * step * (input.airbrake ? 1.28 : 1));
      state.heat = Math.max(0, state.heat - step * 0.08);
    }
    state.airbrake += ((input.airbrake ? 1 : 0) - state.airbrake) * (1 - Math.exp(-8 * step));

    const throttleCurve = 0.22 + state.throttle * state.throttle * 0.78;
    const thrustAcceleration = config.baseThrustAcceleration * throttleCurve
      + (afterburnerAvailable ? config.afterburnerAcceleration * (0.75 + 0.25 * state.afterburnerEnergy) : 0);

    const speedRatio = speedBefore / config.cruiseSpeed;
    const liftBase = clamp(speedRatio, 0, 1.18) * (1 - state.stall * 0.78);
    const pullMagnitude = Math.max(0, Math.abs(input.pitch) - 0.04);
    const maneuverLift = pullMagnitude * config.liftAuthority * controlAuthority * (1 - state.stall * 0.82);
    const liftAcceleration = GRAVITY * (liftBase + maneuverLift);

    const inducedDragAcceleration = config.inducedDrag * (
      Math.abs(input.pitch) * 0.72
      + Math.abs(input.yaw) * 0.36
      + Math.abs(input.roll) * 0.13
      + state.stall * 1.9
      + Math.abs(state.sideslip) * 0.72
    );
    const parasiticDragAcceleration = config.dragCoefficient * speedBefore * speedBefore;
    const airbrakeDragAcceleration = config.airbrakeCoefficient * speedBefore * speedBefore * state.airbrake;
    const overspeedDrag = speedBefore > config.structuralSpeed
      ? (speedBefore - config.structuralSpeed) * 0.22
      : 0;

    const alignRate = config.velocityAlignment
      * (0.35 + controlAuthority * 0.65)
      * (1 - state.stall * 0.72)
      * (0.72 + config.stabilityAssist * 0.35);
    const alignment = 1 - Math.exp(-alignRate * step);
    const alignedVelocity = V3.scale(axes.forward, speedBefore);
    state.velocity = V3.lerp(state.velocity, alignedVelocity, alignment);

    let acceleration = [0, -GRAVITY, 0];
    acceleration = V3.madd(acceleration, axes.forward, thrustAcceleration);
    acceleration = V3.madd(acceleration, axes.up, liftAcceleration);
    const dragDirection = V3.lengthSq(state.velocity) > 1e-6 ? V3.normalize(state.velocity) : axes.forward;
    acceleration = V3.madd(
      acceleration,
      dragDirection,
      -(parasiticDragAcceleration + airbrakeDragAcceleration + inducedDragAcceleration + overspeedDrag),
    );

    for (const external of externalAccelerations) {
      if (!external) continue;
      const vector = Array.isArray(external) ? external : external.acceleration;
      if (Array.isArray(vector) && vector.length >= 3) acceleration = V3.add(acceleration, vector);
    }

    state.velocity = V3.madd(state.velocity, acceleration, step);
    let speedAfter = V3.length(state.velocity);
    if (speedAfter < 36) {
      state.velocity = V3.scale(V3.normalize(state.velocity), 36);
      speedAfter = 36;
    }
    state.position = V3.madd(state.position, state.velocity, step);

    const properAcceleration = V3.add(acceleration, [0, GRAVITY, 0]);
    state.gLoad = clamp(V3.length(properAcceleration) / GRAVITY, 0, 12);
    state.lastAcceleration = acceleration;
    state.speed = speedAfter;
    state.mach = speedAfter / 343;
    state.altitude = state.position[1];
    state.controlSurfaces.pitch += (input.pitch - state.controlSurfaces.pitch) * (1 - Math.exp(-10 * step));
    state.controlSurfaces.roll += (input.roll - state.controlSurfaces.roll) * (1 - Math.exp(-10 * step));
    state.controlSurfaces.yaw += (input.yaw - state.controlSurfaces.yaw) * (1 - Math.exp(-10 * step));
    return state;
  }
}

export const FIGHTER_CONSTANTS = Object.freeze({ GRAVITY, DEFAULT_CONFIG });
