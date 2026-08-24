import { clamp } from './relational.js';

export class InputController {
  constructor({ canvas, joystick, stick, boostButton, brakeButton, pauseButton }) {
    this.canvas = canvas;
    this.joystick = joystick;
    this.stick = stick;
    this.boostButton = boostButton;
    this.brakeButton = brakeButton;
    this.pauseButton = pauseButton;
    this.keys = new Set();
    this.touchAxis = { x: 0, y: 0 };
    this.mouseAxis = { x: 0, y: 0 };
    this.mouseActive = false;
    this.boostTouch = false;
    this.brakeTouch = false;
    this.pauseQueued = false;
    this.lastPauseKey = false;
    this.activePointer = null;
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      if (event.code === 'Escape' || event.code === 'KeyP') this.pauseQueued = true;
    }, { passive: false });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.boostTouch = false;
      this.brakeTouch = false;
      this.mouseActive = false;
      this.resetStick();
    });

    if (this.canvas) {
      this.canvas.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button === 0) {
          this.mouseActive = true;
          this.canvas.setPointerCapture?.(event.pointerId);
          this.updateMouse(event);
        }
      });
      this.canvas.addEventListener('pointermove', (event) => {
        if (this.mouseActive && event.pointerType === 'mouse') this.updateMouse(event);
      });
      const releaseMouse = (event) => {
        if (event.pointerType === 'mouse') {
          this.mouseActive = false;
          this.mouseAxis.x = 0;
          this.mouseAxis.y = 0;
        }
      };
      this.canvas.addEventListener('pointerup', releaseMouse);
      this.canvas.addEventListener('pointercancel', releaseMouse);
      this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    }

    if (this.joystick) {
      this.joystick.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.activePointer = event.pointerId;
        this.joystick.setPointerCapture?.(event.pointerId);
        this.updateStick(event);
      });
      this.joystick.addEventListener('pointermove', (event) => {
        if (event.pointerId === this.activePointer) {
          event.preventDefault();
          this.updateStick(event);
        }
      });
      const release = (event) => {
        if (event.pointerId === this.activePointer) {
          this.activePointer = null;
          this.resetStick();
        }
      };
      this.joystick.addEventListener('pointerup', release);
      this.joystick.addEventListener('pointercancel', release);
    }

    this.bindHoldButton(this.boostButton, (pressed) => { this.boostTouch = pressed; });
    this.bindHoldButton(this.brakeButton, (pressed) => { this.brakeTouch = pressed; });
    this.pauseButton?.addEventListener('click', () => { this.pauseQueued = true; });
  }

  bindHoldButton(element, setter) {
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

  updateMouse(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    this.mouseAxis.x = clamp(x, -1, 1);
    this.mouseAxis.y = clamp(-y, -1, 1);
  }

  updateStick(event) {
    const rect = this.joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width * 0.36;
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = (dx / length) * radius;
      dy = (dy / length) * radius;
    }
    this.touchAxis.x = clamp(dx / radius, -1, 1);
    this.touchAxis.y = clamp(-dy / radius, -1, 1);
    if (this.stick) this.stick.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  resetStick() {
    this.touchAxis.x = 0;
    this.touchAxis.y = 0;
    if (this.stick) this.stick.style.transform = 'translate(0px, 0px)';
  }

  sample() {
    const keyboardX = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0)
      - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const keyboardY = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0)
      - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const keyboardRoll = (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);

    let gamepadX = 0;
    let gamepadY = 0;
    let gamepadRoll = 0;
    let gamepadBoost = false;
    let gamepadBrake = false;
    const gamepads = navigator.getGamepads?.() || [];
    const gamepad = [...gamepads].find(Boolean);
    if (gamepad) {
      const deadzone = (value) => Math.abs(value) < 0.12 ? 0 : value;
      gamepadX = deadzone(gamepad.axes[0] || 0);
      gamepadY = -deadzone(gamepad.axes[1] || 0);
      gamepadRoll = deadzone(gamepad.axes[2] || 0);
      gamepadBoost = Boolean(gamepad.buttons[0]?.pressed || gamepad.buttons[7]?.pressed);
      gamepadBrake = Boolean(gamepad.buttons[1]?.pressed || gamepad.buttons[6]?.pressed);
      const pausePressed = Boolean(gamepad.buttons[9]?.pressed);
      if (pausePressed && !this.lastPauseKey) this.pauseQueued = true;
      this.lastPauseKey = pausePressed;
    }

    const x = clamp(keyboardX + this.touchAxis.x + this.mouseAxis.x + gamepadX, -1, 1);
    const y = clamp(keyboardY + this.touchAxis.y + this.mouseAxis.y + gamepadY, -1, 1);
    const roll = clamp(keyboardRoll + gamepadRoll, -1, 1);
    const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.boostTouch || gamepadBoost;
    const brake = this.keys.has('Space') || this.brakeTouch || gamepadBrake;
    const pause = this.pauseQueued;
    this.pauseQueued = false;

    return { x, y, roll, boost, brake, pause };
  }
}

export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.engineGain = null;
    this.engineOscillator = null;
    this.airGain = null;
    this.airOscillator = null;
    this.enabled = true;
    this.unlocked = false;
  }

  async unlock() {
    if (!this.enabled) return;
    if (!this.context) this.createGraph();
    if (this.context?.state === 'suspended') await this.context.resume();
    this.unlocked = true;
  }

  createGraph() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    this.context = new Context();
    this.master = this.context.createGain();
    this.master.gain.value = 0.18;
    this.master.connect(this.context.destination);

    this.engineOscillator = this.context.createOscillator();
    this.engineOscillator.type = 'sawtooth';
    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0.0001;
    const engineFilter = this.context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 720;
    this.engineOscillator.connect(engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOscillator.start();

    this.airOscillator = this.context.createOscillator();
    this.airOscillator.type = 'triangle';
    this.airGain = this.context.createGain();
    this.airGain.gain.value = 0.0001;
    this.airOscillator.connect(this.airGain).connect(this.master);
    this.airOscillator.start();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.master) this.master.gain.setTargetAtTime(enabled ? 0.18 : 0.0001, this.context.currentTime, 0.03);
  }

  update(speedRatio, boost, active) {
    if (!this.context || !this.unlocked) return;
    const now = this.context.currentTime;
    const activeGain = active && this.enabled ? 1 : 0;
    this.engineOscillator.frequency.setTargetAtTime(58 + speedRatio * 96 + (boost ? 38 : 0), now, 0.06);
    this.airOscillator.frequency.setTargetAtTime(150 + speedRatio * 340 + (boost ? 170 : 0), now, 0.05);
    this.engineGain.gain.setTargetAtTime(activeGain * (0.035 + speedRatio * 0.035), now, 0.08);
    this.airGain.gain.setTargetAtTime(activeGain * (0.008 + speedRatio * 0.02 + (boost ? 0.022 : 0)), now, 0.06);
  }

  tone(frequency, duration = 0.16, type = 'sine', gainValue = 0.11, delay = 0) {
    if (!this.context || !this.unlocked || !this.enabled) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  cue(kind) {
    if (kind === 'correct') {
      this.tone(520, 0.14, 'sine', 0.11);
      this.tone(780, 0.22, 'triangle', 0.08, 0.09);
    } else if (kind === 'incorrect') {
      this.tone(170, 0.22, 'sawtooth', 0.08);
      this.tone(118, 0.28, 'square', 0.045, 0.08);
    } else if (kind === 'gate') {
      this.tone(410, 0.08, 'triangle', 0.04);
    } else if (kind === 'boost') {
      this.tone(260, 0.12, 'sawtooth', 0.05);
      this.tone(420, 0.18, 'triangle', 0.05, 0.05);
    } else if (kind === 'collision') {
      this.tone(88, 0.16, 'square', 0.09);
    } else if (kind === 'finish') {
      [440, 554, 659, 880].forEach((frequency, index) => this.tone(frequency, 0.32, 'triangle', 0.07, index * 0.11));
    }
  }
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
