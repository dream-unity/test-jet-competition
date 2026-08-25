import { clamp } from './math3d.js';

export function shapeControlAxis(value, deadzone = 0.055) {
  const raw = clamp(Number(value) || 0, -1, 1);
  const magnitude = Math.abs(raw);
  if (magnitude <= deadzone) return 0;
  const normalized = (magnitude - deadzone) / (1 - deadzone);
  const shaped = normalized * 0.34 + normalized ** 3 * 0.66;
  return Math.sign(raw) * shaped;
}

export function composeFlightAxes({
  keyboardPitch = 0,
  keyboardRoll = 0,
  keyboardYaw = 0,
  keyboardThrottle = 0,
  stickPitch = 0,
  stickRoll = 0,
  systemsYaw = 0,
  systemsThrottle = 0,
  mousePitch = 0,
  mouseRoll = 0,
  gamepadPitch = 0,
  gamepadRoll = 0,
  gamepadYaw = 0,
  gamepadThrottle = 0,
  invertPitch = false,
} = {}) {
  const rawPitch = clamp(keyboardPitch + stickPitch + mousePitch + gamepadPitch, -1, 1);
  const pitch = shapeControlAxis(rawPitch) * (invertPitch ? -1 : 1);
  return {
    pitch,
    roll: shapeControlAxis(clamp(keyboardRoll + stickRoll + mouseRoll + gamepadRoll, -1, 1)),
    yaw: shapeControlAxis(clamp(keyboardYaw + systemsYaw + gamepadYaw, -1, 1)),
    throttleDelta: shapeControlAxis(clamp(keyboardThrottle + systemsThrottle + gamepadThrottle, -1, 1), 0.08),
  };
}

function bindVirtualStick(element, knob, axis) {
  if (!element) return () => {};
  let activePointer = null;

  const update = (event) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = Math.max(24, Math.min(rect.width, rect.height) * 0.36);
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = dx / length * radius;
      dy = dy / length * radius;
    }
    axis.x = clamp(dx / radius, -1, 1);
    axis.y = clamp(-dy / radius, -1, 1);
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const reset = () => {
    axis.x = 0;
    axis.y = 0;
    if (knob) knob.style.transform = 'translate(0px, 0px)';
  };

  element.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    activePointer = event.pointerId;
    element.setPointerCapture?.(event.pointerId);
    update(event);
  }, { passive: false });
  element.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    update(event);
  }, { passive: false });
  const release = (event) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    reset();
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', reset);
  return reset;
}

function bindHoldButton(element, setter) {
  if (!element) return;
  element.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    element.setPointerCapture?.(event.pointerId);
    setter(true);
    element.classList.add('pressed');
  });
  const release = () => {
    setter(false);
    element.classList.remove('pressed');
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', release);
}

export class FighterInput {
  constructor({
    canvas,
    flightStick,
    flightKnob,
    systemsStick,
    systemsKnob,
    afterburnerButton,
    airbrakeButton,
    pauseButton,
    invertPitch = false,
  } = {}) {
    this.canvas = canvas;
    this.keys = new Set();
    this.flightAxis = { x: 0, y: 0 };
    this.systemsAxis = { x: 0, y: 0 };
    this.mouseAxis = { x: 0, y: 0 };
    this.mouseActive = false;
    this.mousePointer = null;
    this.mouseOrigin = null;
    this.afterburnerTouch = false;
    this.airbrakeTouch = false;
    this.pauseQueued = false;
    this.cameraQueued = false;
    this.lastGamepadPause = false;
    this.lastGamepadCamera = false;
    this.invertPitch = Boolean(invertPitch);
    this.resetFlightStick = bindVirtualStick(flightStick, flightKnob, this.flightAxis);
    this.resetSystemsStick = bindVirtualStick(systemsStick, systemsKnob, this.systemsAxis);
    bindHoldButton(afterburnerButton, (pressed) => { this.afterburnerTouch = pressed; });
    bindHoldButton(airbrakeButton, (pressed) => { this.airbrakeTouch = pressed; });
    pauseButton?.addEventListener('click', () => { this.pauseQueued = true; });
    this.bind();
  }

  setPitchInverted(inverted) {
    this.invertPitch = Boolean(inverted);
  }

  isPitchInverted() {
    return this.invertPitch;
  }

  bind() {
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      if (event.code === 'Escape' || event.code === 'KeyP') this.pauseQueued = true;
      if (event.code === 'KeyC') this.cameraQueued = true;
    }, { passive: false });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.release());

    if (!this.canvas) return;
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      event.preventDefault();
      this.mouseActive = true;
      this.mousePointer = event.pointerId;
      this.mouseOrigin = [event.clientX, event.clientY];
      this.canvas.setPointerCapture?.(event.pointerId);
      this.updateMouse(event);
    }, { passive: false });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.mouseActive || event.pointerType !== 'mouse' || event.pointerId !== this.mousePointer) return;
      event.preventDefault();
      this.updateMouse(event);
    }, { passive: false });
    const releaseMouse = (event) => {
      if (event.pointerType !== 'mouse' || (this.mousePointer !== null && event.pointerId !== this.mousePointer)) return;
      this.mouseActive = false;
      this.mousePointer = null;
      this.mouseOrigin = null;
      this.mouseAxis.x = 0;
      this.mouseAxis.y = 0;
    };
    this.canvas.addEventListener('pointerup', releaseMouse);
    this.canvas.addEventListener('pointercancel', releaseMouse);
    this.canvas.addEventListener('lostpointercapture', releaseMouse);
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  updateMouse(event) {
    if (!this.mouseOrigin) this.mouseOrigin = [event.clientX, event.clientY];
    const rect = this.canvas.getBoundingClientRect();
    const horizontalRange = Math.max(120, rect.width * 0.22);
    const verticalRange = Math.max(90, rect.height * 0.24);
    const dx = event.clientX - this.mouseOrigin[0];
    const dy = this.mouseOrigin[1] - event.clientY;
    this.mouseAxis.x = clamp(dx / horizontalRange, -1, 1);
    this.mouseAxis.y = clamp(dy / verticalRange, -1, 1);
  }

  release() {
    this.keys.clear();
    this.afterburnerTouch = false;
    this.airbrakeTouch = false;
    this.mouseActive = false;
    this.mousePointer = null;
    this.mouseOrigin = null;
    this.mouseAxis.x = 0;
    this.mouseAxis.y = 0;
    this.resetFlightStick?.();
    this.resetSystemsStick?.();
  }

  sample() {
    const keyboardPitch = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0)
      - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const keyboardRoll = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0)
      - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const keyboardYaw = (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);
    const keyboardThrottle = (this.keys.has('KeyR') ? 1 : 0) - (this.keys.has('KeyF') ? 1 : 0);

    let gamepadPitch = 0;
    let gamepadRoll = 0;
    let gamepadYaw = 0;
    let gamepadThrottle = 0;
    let gamepadAfterburner = false;
    let gamepadAirbrake = false;
    const pads = navigator.getGamepads?.() || [];
    const gamepad = [...pads].find(Boolean);
    if (gamepad) {
      const deadzone = (value, threshold = 0.13) => Math.abs(value) < threshold ? 0 : value;
      gamepadRoll = deadzone(gamepad.axes[0] || 0);
      gamepadPitch = -deadzone(gamepad.axes[1] || 0);
      gamepadYaw = deadzone(gamepad.axes[2] || 0);
      gamepadThrottle = -deadzone(gamepad.axes[3] || 0, 0.2);
      gamepadAfterburner = Boolean(gamepad.buttons[0]?.pressed || gamepad.buttons[7]?.pressed);
      gamepadAirbrake = Boolean(gamepad.buttons[1]?.pressed || gamepad.buttons[6]?.pressed);
      const pausePressed = Boolean(gamepad.buttons[9]?.pressed);
      if (pausePressed && !this.lastGamepadPause) this.pauseQueued = true;
      this.lastGamepadPause = pausePressed;
      const cameraPressed = Boolean(gamepad.buttons[3]?.pressed);
      if (cameraPressed && !this.lastGamepadCamera) this.cameraQueued = true;
      this.lastGamepadCamera = cameraPressed;
    }

    const axes = composeFlightAxes({
      keyboardPitch,
      keyboardRoll,
      keyboardYaw,
      keyboardThrottle,
      stickPitch: this.flightAxis.y,
      stickRoll: this.flightAxis.x,
      systemsYaw: this.systemsAxis.x,
      systemsThrottle: this.systemsAxis.y,
      mousePitch: this.mouseAxis.y,
      mouseRoll: this.mouseAxis.x,
      gamepadPitch,
      gamepadRoll,
      gamepadYaw,
      gamepadThrottle,
      invertPitch: this.invertPitch,
    });

    const afterburner = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
      || this.afterburnerTouch || gamepadAfterburner;
    const airbrake = this.keys.has('Space') || this.airbrakeTouch || gamepadAirbrake;
    const pause = this.pauseQueued;
    const camera = this.cameraQueued;
    this.pauseQueued = false;
    this.cameraQueued = false;
    return { ...axes, afterburner, airbrake, pause, camera };
  }
}
