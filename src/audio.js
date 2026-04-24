import {
  APPROACH_PITCH,
  MAX_AUDIBLE_DISTANCE,
  ENGINE_POOL_SIZE,
  rowToZ,
} from './config.js';

// Web Audio API wrapper. Procedural SFX (no WAV assets) so there's no asset pipeline.
// AudioContext must be created inside a user-gesture handler — see resume().

const ENGINE_BASE_FREQ = { truck: 58, sedan: 92 };

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.liveEngineCount = 0;
  }

  // Call from a user gesture (the start-overlay click).
  async resume() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  // Short wet "splat" on frog landing.
  playHop() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const duration = 0.08;

    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      const envelope = Math.exp(-t * 55);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 1;
    const gain = ctx.createGain();
    gain.gain.value = 0.45;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
  }

  // Longer wet squish + low thump on death.
  playSquish() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const duration = 0.3;

    // Noise component (the "wet" splatter).
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      const envelope = Math.exp(-t * 12);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = 'lowpass';
    nFilter.frequency.value = 450;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.5;
    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now);

    // Low sine thump with pitch drop.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.2);
    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.0001, now);
    oGain.gain.linearRampToValueAtTime(0.6, now + 0.01);
    oGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(oGain);
    oGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration);
  }

  // Attach a looping engine voice to a vehicle. Idempotent — safe to call twice.
  // Silently no-ops if the pool is full; far-away vehicles will be silent until a slot frees.
  attachEngine(vehicle) {
    if (!this.ctx) return;
    if (vehicle._engine) return;
    if (this.liveEngineCount >= ENGINE_POOL_SIZE) return;
    const baseFreq = ENGINE_BASE_FREQ[vehicle.typeName] ?? 75;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = baseFreq;
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 800;
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 0;
    osc.connect(lowpass);
    lowpass.connect(gainNode);
    gainNode.connect(this.masterGain);
    osc.start();
    vehicle._engine = { osc, gainNode, lowpass, baseFreq };
    this.liveEngineCount++;
  }

  detachEngine(vehicle) {
    if (!vehicle._engine) return;
    const { osc, gainNode, lowpass } = vehicle._engine;
    try {
      osc.stop();
    } catch (_) {}
    osc.disconnect();
    lowpass.disconnect();
    gainNode.disconnect();
    vehicle._engine = null;
    this.liveEngineCount--;
  }

  // Called each frame: sets per-engine gain and pitch based on distance + approach.
  updateEngines(frog, vehicles) {
    if (!this.ctx) return;
    const frogX = frog.group.position.x;
    const frogZ = frog.group.position.z;
    const now = this.ctx.currentTime;
    const smoothing = 0.03;

    for (const v of vehicles) {
      if (!v._engine) continue;
      const vz = rowToZ(v.row);
      const dx = v.x - frogX;
      const dz = vz - frogZ;
      const dist = Math.hypot(dx, dz);
      const distanceFactor = Math.max(0, 1 - dist / MAX_AUDIBLE_DISTANCE);

      // Approaching if vehicle's motion would decrease dx magnitude.
      // d(|dx|)/dt = sign(dx) * direction * speed → approaching when sign(dx) * direction < 0.
      const approachingSign = -Math.sign(dx) * v.direction;
      const pitchMult = 1 + APPROACH_PITCH * approachingSign * distanceFactor;

      const targetGain = 0.22 * distanceFactor;
      const targetFreq = v._engine.baseFreq * pitchMult;
      v._engine.osc.frequency.setTargetAtTime(targetFreq, now, smoothing);
      v._engine.gainNode.gain.setTargetAtTime(targetGain, now, smoothing);
    }
  }
}
