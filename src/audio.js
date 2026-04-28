import {
  APPROACH_PITCH,
  MAX_AUDIBLE_DISTANCE,
  ENGINE_POOL_SIZE,
  FOCUS_ENGINE_LOWPASS_HZ,
  MUTE_KEY,
} from './config.js';

const ENGINE_LOWPASS_DEFAULT = 800;
const MASTER_GAIN_VALUE = 0.8;

// Web Audio API wrapper. Procedural SFX (no WAV assets) so there's no asset pipeline.
// AudioContext must be created inside a user-gesture handler — see resume().

const ENGINE_BASE_FREQ = {
  truck: 58,
  sedan: 92,
  boxVan: 75,
  motorcycle: 145, // higher whine, distinct from cars
  doubleTrailer: 48,
};

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.liveEngineCount = 0;
    this.muted = loadMuted();
  }

  // Call from a user gesture (the start-overlay click).
  async resume() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : MASTER_GAIN_VALUE;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  // Toggle mute and return the new muted state. Persists to localStorage so the
  // preference survives reloads (the "incognito play" use case). Safe to call
  // before the AudioContext exists — the persisted flag is honored on resume().
  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : MASTER_GAIN_VALUE;
    }
    saveMuted(this.muted);
    return this.muted;
  }

  // Pause everything (engine loops, in-flight one-shots) when the game is paused.
  async suspend() {
    if (!this.ctx) return;
    if (this.ctx.state === 'running') await this.ctx.suspend();
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

  // Crunch on bug pickup — short filtered noise burst plus a faint blip.
  playPickup() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const duration = 0.06;

    // Filtered noise (the wet crunch).
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      const envelope = Math.exp(-t * 60);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.32;
    noise.connect(hp);
    hp.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now);

    // Faint blip on top.
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 880;
    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.0001, now);
    oGain.gain.linearRampToValueAtTime(0.18, now + 0.005);
    oGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    osc.connect(oGain);
    oGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  // Negative "nope" buzz for a rejected hop — frog couldn't go that way
  // (obstacle or playfield edge). The previous low sine (170→95 Hz) lived
  // inside the engine fundamental band (48–145 Hz) and got masked under
  // traffic. This version uses a square wave descending 520→260 Hz, well
  // above engine fundamentals + their first harmonics, plus a brief
  // bandpassed-noise click on the attack so the START punches through even
  // if the tone gets EQ-buried.
  playBlocked() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 0.11;

    // Click transient: 25ms of bandpassed white noise around 1.6 kHz so the
    // attack reads as a percussive "tk" even on top of low-end engine rumble.
    const noiseDur = 0.025;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.exp(-(i / ctx.sampleRate) * 110);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1600;
    noiseFilter.Q.value = 1.5;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.35;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);

    // Body tone: square wave for harmonic richness, descending pitch reads
    // as "denied" without sounding alarming. Sits above the engine band.
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + dur);
    const oscFilter = ctx.createBiquadFilter();
    oscFilter.type = 'lowpass';
    oscFilter.frequency.value = 2200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(oscFilter);
    oscFilter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  // Whip sound for the tongue flick: highpass-filtered noise with descending cutoff.
  playTongueFlick() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const duration = 0.08;

    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      const envelope = Math.exp(-t * 30);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(3000, now);
    hp.frequency.exponentialRampToValueAtTime(500, now + duration);
    const gain = ctx.createGain();
    gain.gain.value = 0.28;
    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
  }

  // Frog-level-up chime: ascending arpeggio with a noise sparkle on top.
  playLevelUp() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const t0 = now + i * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.32, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.35);
    });

    // Bandpass-filtered noise sparkle on top.
    const sparkleDur = 0.2;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sparkleDur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      const envelope = Math.exp(-t * 8);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5000;
    bp.Q.value = 4;
    const sGain = ctx.createGain();
    sGain.gain.value = 0.18;
    src.connect(bp);
    bp.connect(sGain);
    sGain.connect(this.masterGain);
    src.start(now);
  }

  // Quick celebratory chime on a successful crossing.
  playWin() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    notes.forEach((freq, i) => {
      const t0 = now + i * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.35, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.4);
    });
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
    lowpass.frequency.value = ENGINE_LOWPASS_DEFAULT;
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
  // `timeScale` (default 1) multiplies the post-doppler target frequency so engines
  // pitch-down when world-time is slowed (Frog Focus). Doppler itself is distance-
  // based so the only change is the multiply on targetFreq.
  updateEngines(frog, vehicles, timeScale = 1) {
    if (!this.ctx) return;
    const frogX = frog.group.position.x;
    const frogZ = frog.group.position.z;
    const now = this.ctx.currentTime;
    const smoothing = 0.03;

    for (const v of vehicles) {
      if (!v._engine) continue;
      const dx = v.x - frogX;
      const dz = v.z - frogZ;
      const dist = Math.hypot(dx, dz);
      const distanceFactor = Math.max(0, 1 - dist / MAX_AUDIBLE_DISTANCE);

      // Approaching if vehicle's motion would decrease |dx|.
      const approachingSign = -Math.sign(dx) * v.direction;
      const pitchMult = 1 + APPROACH_PITCH * approachingSign * distanceFactor;

      const targetGain = 0.22 * distanceFactor;
      const targetFreq = v._engine.baseFreq * pitchMult * timeScale;
      v._engine.osc.frequency.setTargetAtTime(targetFreq, now, smoothing);
      v._engine.gainNode.gain.setTargetAtTime(targetGain, now, smoothing);
    }
  }

  // Sweep all live engine voices' lowpass cutoff toward the focus value or back
  // to default. Called on the rising/falling edge of Frog Focus from game.js.
  setFocusFilter(active, vehicles) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const target = active ? FOCUS_ENGINE_LOWPASS_HZ : ENGINE_LOWPASS_DEFAULT;
    for (const v of vehicles) {
      if (!v._engine) continue;
      v._engine.lowpass.frequency.setTargetAtTime(target, now, 0.05);
    }
  }

  // Short descending whoosh on Frog Focus engage.
  playFocusOn() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 0.18;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  // Short ascending whoosh on Frog Focus release.
  playFocusOff() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 0.14;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(740, now + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  // Cartoon "boing-out, boing-in" for Recombobulation: descending sine over the
  // squash phase, brief silence over the hold, ascending sine with a wobble over
  // the unsplat. Total ≈ 1.4 s, leaves ~100 ms tail before the cutscene ends.
  playRecombobulate() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Descending boing (squash).
    const downDur = 0.4;
    const down = ctx.createOscillator();
    down.type = 'triangle';
    down.frequency.setValueAtTime(880, now);
    down.frequency.exponentialRampToValueAtTime(180, now + downDur);
    const downGain = ctx.createGain();
    downGain.gain.setValueAtTime(0.0001, now);
    downGain.gain.linearRampToValueAtTime(0.32, now + 0.02);
    downGain.gain.exponentialRampToValueAtTime(0.0001, now + downDur);
    down.connect(downGain);
    downGain.connect(this.masterGain);
    down.start(now);
    down.stop(now + downDur + 0.05);

    // Ascending boing (unsplat) with a slight LFO wobble.
    const upStart = now + downDur + 0.3; // hold gap
    const upDur = 0.55;
    const up = ctx.createOscillator();
    up.type = 'triangle';
    up.frequency.setValueAtTime(180, upStart);
    up.frequency.exponentialRampToValueAtTime(960, upStart + upDur);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 25; // ±25 Hz wobble for cartoon feel
    lfo.connect(lfoGain);
    lfoGain.connect(up.frequency);
    const upGain = ctx.createGain();
    upGain.gain.setValueAtTime(0.0001, upStart);
    upGain.gain.linearRampToValueAtTime(0.34, upStart + 0.02);
    upGain.gain.exponentialRampToValueAtTime(0.0001, upStart + upDur);
    up.connect(upGain);
    upGain.connect(this.masterGain);
    up.start(upStart);
    lfo.start(upStart);
    up.stop(upStart + upDur + 0.05);
    lfo.stop(upStart + upDur + 0.05);
  }
}

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(value) {
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // localStorage unavailable — fail silently, mute still works for this session.
  }
}
