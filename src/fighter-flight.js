import { clamp, smoothstep, V3, Q } from './math3d.js';

const GRAVITY = 9.80665;
const WORLD_UP = [0, 1, 0];

const DEFAULT_CONFIG = Object.freeze({
  mass: 11800,
  cruiseSpeed: 440,
  minimumControlSpeed: 62,
  structuralSpeed: 875,
  maximumSpeed: 1020,
  baseThrustAcceleration: 76,
  afterburnerAcceleration: 84,
  dragCoefficient: 0.00011,
  airbrakeCoefficient: 0.00034,
  inducedDrag: 15.5,
  pitchRate: 1.82,
  yawRate: 1.08,
  rollRate: 3.22,
  angularResponse: 10.5,
  angularDamping: 0.62,
  velocityAlignment: 3.05,
  liftAuthority: 4.15,
  stabilityAssist: 0.74,
  autoLevel: 0.72,
  coordinatedTurnAssist: 0.64,
  afterburnerDrain: 0.13,
  afterburnerRecharge: 0.062,
  throttleResponse: 2.25,
  maxG: 11.5,
  substepSeconds: 1 / 120,
});

function clampMagnitude(vector, maximum) {
  const length = V3.length(vector);
  if (length <= maximum || length <= 1e-9) return vector;
  return V3.scale(vector, maximum / length);
}

function signedBankAngle(axes) {
  return Math.atan2(V3.dot(axes.right, WORLD_UP), V3.dot(axes.up, WORLD_UP));
}

export function createInitialFighterState({
  position = [0, 180, 0],
  forward = [0, 0, 1],
  up = [0, 1, 0],
  speed = 430,
  throttle = 0.86,
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
    bankAngle: 0,
    flightPathAngle: 0,
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
    const total = clamp(dt, 0, 0.05);
    if (total <= 0) return this.state;
    const substeps = Math.max(1, Math.ceil(total / this.config.substepSeconds));
    const step = total / substeps;
    for (let index = 0; index < substeps; index += 1) this.integrate(step, externalAccelerations);
    return this.state;
  }

  integrate(step, externalAccelerations) {
    const state = this.state;
    const config = this.config;
    const input = this.input;

    if (input.throttleSet !== null) state.commandedThrottle = input.throttleSet;
    state.commandedThrottle = clamp(state.commandedThrottle + input.throttleDelta * step * 0.68, 0.24, 1);
    state.throttle += (state.commandedThrottle - state.throttle) * (1 - Math.exp(-config.throttleResponse * step));

    const speedBefore = Math.max(0.01, V3.length(state.velocity));
    const lowSpeedAuthority = clamp((speedBefore - 28) / Math.max(1, config.minimumControlSpeed), 0.34, 1);
    const highSpeedAttenuation = 1 - clamp((speedBefore - 760) / 500, 0, 0.26);
    const controlAuthority = lowSpeedAuthority * highSpeedAttenuation;
    const axesBefore = this.axes();
    const bankAngle = signedBankAngle(axesBefore);
    state.bankAngle = bankAngle;

    let targetPitchRate = -input.pitch * config.pitchRate * controlAuthority;
    let targetYawRate = input.yaw * config.yawRate * controlAuthority;
    let targetRollRate = -input.roll * config.rollRate * controlAuthority;

    const bankTurn = -Math.sin(bankAngle)
      * config.coordinatedTurnAssist
      * clamp(speedBefore / config.cruiseSpeed, 0.35, 1.25)
      * (0.24 + Math.max(0, input.pitch) * 0.76);
    if (Math.abs(input.yaw) < 0.12) targetYawRate += bankTurn;

    const uprightness = V3.dot(axesBefore.up, WORLD_UP);
    if (Math.abs(input.roll) < 0.08 && Math.abs(bankAngle) < 1.42 && uprightness > 0.08) {
      targetRollRate += -bankAngle * config.autoLevel * (1 - Math.abs(input.pitch) * 0.35);
    }

    const targetRates = [targetPitchRate, targetYawRate, targetRollRate];
    const angularBlend = 1 - Math.exp(-config.angularResponse * step);
    state.angularVelocity = state.angularVelocity.map((value, index) => (
      value + (targetRates[index] - value) * angularBlend
    ));
    const damping = Math.exp(-config.angularDamping * step * (0.35 + (1 - controlAuthority) * 0.4));
    state.angularVelocity = state.angularVelocity.map((value) => value * damping);
    state.orientation = Q.integrateBodyRates(state.orientation, state.angularVelocity, step);

    const axes = this.axes();
    const localVelocity = Q.inverseRotateVector(state.orientation, state.velocity);
    const forwardComponent = Math.max(0.1, localVelocity[2]);
    state.angleOfAttack = Math.atan2(-localVelocity[1], forwardComponent);
    state.sideslip = Math.atan2(localVelocity[0], forwardComponent);
    const absoluteAoA = Math.abs(state.angleOfAttack);
    const lowSpeedStall = smoothstep((118 - speedBefore) / 62 + 0.2);
    state.stall = smoothstep((absoluteAoA - 0.38) / 0.48) * lowSpeedStall;

    const afterburnerAvailable = input.afterburner && state.afterburnerEnergy > 0.004 && state.throttle > 0.66;
    state.afterburnerActive = afterburnerAvailable;
    if (afterburnerAvailable) {
      state.afterburnerEnergy = Math.max(0, state.afterburnerEnergy - config.afterburnerDrain * step);
      state.heat = Math.min(1, state.heat + step * 0.21);
    } else {
      const rechargeScale = input.airbrake ? 1.2 : 1;
      state.afterburnerEnergy = Math.min(1, state.afterburnerEnergy + config.afterburnerRecharge * rechargeScale * step);
      state.heat = Math.max(0, state.heat - step * 0.095);
    }
    state.airbrake += ((input.airbrake ? 1 : 0) - state.airbrake) * (1 - Math.exp(-10 * step));

    const throttleCurve = 0.18 + state.throttle * state.throttle * 0.82;
    const thrustAcceleration = config.baseThrustAcceleration * throttleCurve
      + (afterburnerAvailable ? config.afterburnerAcceleration * (0.76 + 0.24 * state.afterburnerEnergy) : 0);

    const speedRatio = speedBefore / config.cruiseSpeed;
    const baseLiftG = clamp(speedRatio * speedRatio, 0.18, 1.28) * (1 - state.stall * 0.76);
    const signedManeuverLiftG = input.pitch * config.liftAuthority * controlAuthority * (1 - state.stall * 0.86);
    const liftG = clamp(baseLiftG + signedManeuverLiftG, -1.8, config.maxG * 0.78);
    const liftAcceleration = GRAVITY * liftG;

    const inducedDragAcceleration = config.inducedDrag * (
      Math.abs(input.pitch) * 0.86
      + Math.abs(input.yaw) * 0.42
      + Math.abs(input.roll) * 0.17
      + state.stall * 2.2
      + Math.abs(state.sideslip) * 0.82
      + Math.max(0, Math.abs(liftG) - 1) * 0.16
    );
    const parasiticDragAcceleration = config.dragCoefficient * speedBefore * speedBefore;
    const airbrakeDragAcceleration = config.airbrakeCoefficient * speedBefore * speedBefore * state.airbrake;
    const overspeedDrag = speedBefore > config.structuralSpeed
      ? (speedBefore - config.structuralSpeed) * 0.42
      : 0;

    let acceleration = [0, -GRAVITY, 0];
    acceleration = V3.madd(acceleration, axes.forward, thrustAcceleration);
    acceleration = V3.madd(acceleration, axes.up, liftAcceleration);

    const dragDirection = V3.lengthSq(state.velocity) > 1e-6 ? V3.normalize(state.velocity) : axes.forward;
    acceleration = V3.madd(
      acceleration,
      dragDirection,
      -(parasiticDragAcceleration + airbrakeDragAcceleration + inducedDragAcceleration + overspeedDrag),
    );

    const desiredVelocity = V3.scale(axes.forward, speedBefore);
    const alignmentRate = config.velocityAlignment
      * (0.42 + controlAuthority * 0.58)
      * (1 - state.stall * 0.72)
      * (0.7 + config.stabilityAssist * 0.42);
    const alignmentAcceleration = V3.scale(V3.sub(desiredVelocity, state.velocity), alignmentRate);
    acceleration = V3.add(acceleration, clampMagnitude(alignmentAcceleration, config.maxG * GRAVITY * 0.86));

    for (const external of externalAccelerations) {
      if (!external) continue;
      const vector = Array.isArray(external) ? external : external.acceleration;
      if (Array.isArray(vector) && vector.length >= 3) acceleration = V3.add(acceleration, vector);
    }

    const gravityFree = V3.add(acceleration, [0, GRAVITY, 0]);
    const limitedGravityFree = clampMagnitude(gravityFree, config.maxG * GRAVITY);
    acceleration = V3.add(limitedGravityFree, [0, -GRAVITY, 0]);

    state.velocity = V3.madd(state.velocity, acceleration, step);
    let speedAfter = V3.length(state.velocity);
    if (speedAfter < 58) {
      const safeDirection = V3.lengthSq(state.velocity) > 1e-6 ? V3.normalize(state.velocity) : axes.forward;
      state.velocity = V3.scale(safeDirection, 58);
      speedAfter = 58;
    }
    if (speedAfter > config.maximumSpeed) {
      state.velocity = V3.scale(V3.normalize(state.velocity), config.maximumSpeed);
      speedAfter = config.maximumSpeed;
    }

    state.position = V3.madd(state.position, state.velocity, step);
    const properAcceleration = V3.add(acceleration, [0, GRAVITY, 0]);
    state.gLoad = clamp(V3.length(properAcceleration) / GRAVITY, 0, config.maxG + 0.25);
    state.lastAcceleration = acceleration;
    state.speed = speedAfter;
    state.mach = speedAfter / 343;
    state.altitude = state.position[1];
    state.flightPathAngle = Math.asin(clamp(V3.normalize(state.velocity)[1], -1, 1));
    state.controlSurfaces.pitch += (input.pitch - state.controlSurfaces.pitch) * (1 - Math.exp(-12 * step));
    state.controlSurfaces.roll += (input.roll - state.controlSurfaces.roll) * (1 - Math.exp(-12 * step));
    state.controlSurfaces.yaw += (input.yaw - state.controlSurfaces.yaw) * (1 - Math.exp(-12 * step));
  }
}

export const FIGHTER_CONSTANTS = Object.freeze({ GRAVITY, DEFAULT_CONFIG });
