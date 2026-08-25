export class FighterAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.engineOscillator = null;
    this.engineGain = null;
    this.windOscillator = null;
    this.windGain = null;
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
    this.master.gain.value = 0.17;
    this.master.connect(this.context.destination);

    this.engineOscillator = this.context.createOscillator();
    this.engineOscillator.type = 'sawtooth';
    const engineFilter = this.context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 820;
    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0.0001;
    this.engineOscillator.connect(engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOscillator.start();

    this.windOscillator = this.context.createOscillator();
    this.windOscillator.type = 'triangle';
    this.windGain = this.context.createGain();
    this.windGain.gain.value = 0.0001;
    this.windOscillator.connect(this.windGain).connect(this.master);
    this.windOscillator.start();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.master && this.context) this.master.gain.setTargetAtTime(enabled ? 0.17 : 0.0001, this.context.currentTime, 0.04);
  }

  update(speedRatio, afterburner, active) {
    if (!this.context || !this.unlocked) return;
    const now = this.context.currentTime;
    const gain = active && this.enabled ? 1 : 0;
    this.engineOscillator.frequency.setTargetAtTime(52 + speedRatio * 132 + (afterburner ? 54 : 0), now, 0.05);
    this.windOscillator.frequency.setTargetAtTime(130 + speedRatio * 430 + (afterburner ? 150 : 0), now, 0.06);
    this.engineGain.gain.setTargetAtTime(gain * (0.028 + speedRatio * 0.044 + (afterburner ? 0.025 : 0)), now, 0.08);
    this.windGain.gain.setTargetAtTime(gain * (0.004 + speedRatio * 0.024), now, 0.08);
  }

  tone(frequency, duration = 0.18, type = 'sine', gainValue = 0.08, delay = 0) {
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
    oscillator.stop(now + duration + 0.04);
  }

  cue(kind) {
    if (kind === 'correct') {
      this.tone(520, 0.14, 'sine', 0.08);
      this.tone(780, 0.24, 'triangle', 0.07, 0.08);
      this.tone(1040, 0.2, 'sine', 0.045, 0.16);
    } else if (kind === 'incorrect') {
      this.tone(155, 0.24, 'sawtooth', 0.065);
      this.tone(105, 0.3, 'square', 0.04, 0.08);
    } else if (kind === 'gate') {
      this.tone(390, 0.08, 'triangle', 0.035);
    } else if (kind === 'boost') {
      this.tone(240, 0.12, 'sawtooth', 0.05);
      this.tone(470, 0.2, 'triangle', 0.05, 0.05);
    } else if (kind === 'collision') {
      this.tone(72, 0.18, 'square', 0.085);
    } else if (kind === 'finish') {
      [440, 554, 659, 880].forEach((frequency, index) => this.tone(frequency, 0.32, 'triangle', 0.065, index * 0.11));
    }
  }
}
