/**
 * Township Aerial Challenge — SoundManager (Phase 4)
 * Zero-dependency Web Audio API procedural synthesizer and music sequencer.
 * Requires zero external MP3/WAV network fetches so it never fails on GitHub Pages or offline.
 * Mobile-safe audio unlocking on first user gesture with persisted mute state in localStorage.
 */

import { FLIGHT_STATE } from './Constants.js';

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.engineGain = null;

    // Persistent mute state
    this.isMuted = this.loadMuteState();
    this.isUnlocked = false;

    // BGM Sequencer State (~126 BPM in C / F major)
    this.isBGMPlaying = false;
    this.bgmInterval = null;
    this.tempoBPM = 126;
    this.secondsPerBeat = 60.0 / 126.0; // ~0.4762s
    this.current16thStep = 0;
    this.nextNoteTime = 0.0;
    this.total16thSteps = 8 * 16; // 8 measures of 16 steps = 128 steps

    // Engine Audio Nodes & State
    this.engineRunning = false;
    this.engineState = 'STOPPED';
    this.enginePropOsc = null;
    this.enginePropGain = null;
    this.engineWindNode = null;
    this.engineWindGain = null;
    this.engineBoosterNode = null;
    this.engineBoosterGain = null;
    this.engineBoosterOsc = null;
    this.engineRumbleNode = null;
    this.engineRumbleGain = null;

    // Magnet Hum Nodes
    this.magnetHumOsc = null;
    this.magnetHumGain = null;
    this.magnetLfo = null;
    this.isMagnetHumming = false;

    // SFX Throttling & Combos
    this.lastStretchTime = 0;
    this.lastStretchTension = 0;
    this.starComboCount = 0;
    this.lastStarTime = 0;

    // Automatic gesture unlocking
    if (typeof window !== 'undefined') {
      this.setupUnlockListeners();
    }
  }

  /* ========================================================================
     PERSISTENCE & MOBILE AUDIO CONTEXT UNLOCKING
     ======================================================================== */

  loadMuteState() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem('aerial_challenge_muted') === 'true';
      }
    } catch {
      // LocalStorage access fallback
    }
    return false;
  }

  saveMuteState(muted) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('aerial_challenge_muted', muted ? 'true' : 'false');
      }
    } catch {
      // LocalStorage access fallback
    }
  }

  ensureContext() {
    if (this.ctx) return true;
    if (typeof window === 'undefined') return false;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;

    try {
      this.ctx = new AudioContextClass();

      // Master output
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0.0 : 1.0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // BGM Bus: comfortable low background volume (~0.20)
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(0.20, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);

      // SFX Bus: punchy crisp volume (~0.85)
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // Engine Bus: smooth modulated volume (~0.40)
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.40, this.ctx.currentTime);
      this.engineGain.connect(this.masterGain);

      return true;
    } catch {
      return false;
    }
  }

  setupUnlockListeners() {
    const unlockHandler = () => {
      this.unlock();
      ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'click'].forEach(evt => {
        window.removeEventListener(evt, unlockHandler, true);
      });
    };

    ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'click'].forEach(evt => {
      window.addEventListener(evt, unlockHandler, { once: true, capture: true });
    });
  }

  unlock() {
    if (!this.ensureContext()) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        this.isUnlocked = true;
        if (!this.isMuted && !this.isBGMPlaying) {
          this.startBGM();
        }
      }).catch(() => {});
    } else {
      this.isUnlocked = true;
      if (!this.isMuted && !this.isBGMPlaying) {
        this.startBGM();
      }
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.saveMuteState(this.isMuted);

    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0.0 : 1.0, now);
    }

    if (this.isMuted) {
      this.stopBGM();
      this.stopEngine();
      this.stopMagnetHum();
    } else {
      if (this.isUnlocked || this.ensureContext()) {
        this.startBGM();
      }
    }

    return this.isMuted;
  }

  setMuted(muted) {
    if (this.isMuted === muted) return;
    this.toggleMute();
  }

  /* ========================================================================
     (2) CHEERFUL TOWNSHIP AVIATION BGM SEQUENCER
     Bouncy ~126 BPM loop in C major / F major:
     Oom-pah triangle/warm-bass accompaniment, cheerful staccato melody,
     and subtle propeller brush rhythm at comfortable background volume.
     ======================================================================== */

  startBGM() {
    if (this.isMuted) return;
    if (this.isBGMPlaying) return;
    if (!this.ensureContext()) return;

    this.isBGMPlaying = true;
    this.current16thStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    // Lookahead sequencer interval (every 40ms, schedule notes for the next 120ms)
    this.bgmInterval = setInterval(() => {
      if (!this.isBGMPlaying || !this.ctx || this.isMuted) return;

      const scheduleAheadTime = 0.12;
      while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
        this.scheduleBGMStep(this.current16thStep, this.nextNoteTime);
        this.nextNoteTime += this.secondsPerBeat / 4.0;
        this.current16thStep = (this.current16thStep + 1) % this.total16thSteps;
      }
    }, 40);
  }

  stopBGM() {
    this.isBGMPlaying = false;
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }

  scheduleBGMStep(step, time) {
    if (!this.ctx || !this.bgmGain) return;

    const measure = Math.floor(step / 16);
    const stepInMeasure = step % 16;
    const isQuarterBeat = (stepInMeasure % 4 === 0);
    const beatIndex = Math.floor(stepInMeasure / 4); // 0, 1, 2, 3

    // 1. Warm Bouncy Bass: Beats 1 & 3 (oom-pah root & fifth)
    if (isQuarterBeat && (beatIndex === 0 || beatIndex === 2)) {
      this.playBGMBassNote(measure, beatIndex, time);
    }

    // 2. Oom-pah Offbeat Chords: Beats 2 & 4
    if (isQuarterBeat && (beatIndex === 1 || beatIndex === 3)) {
      this.playBGMOomPahChord(measure, time);
    }

    // 3. Subtle Brush Propeller Rhythm: soft 16th-note highpass noise taps
    if (stepInMeasure % 2 === 0) {
      this.playBGMBrush(time, stepInMeasure % 4 === 0 ? 0.035 : 0.020);
    }

    // 4. Cheerful Staccato Melody (catchy Town Aviation tune)
    this.playBGMMelodyStep(step, time);
  }

  playBGMBassNote(measure, beatIndex, time) {
    // Harmony progression across 8 measures: C - C - F - F - G - G - C - C
    let rootFreq = 65.41; // C2
    let fifthFreq = 98.00; // G2

    if (measure === 2 || measure === 3) {
      rootFreq = 87.31; // F2
      fifthFreq = 65.41; // C2
    } else if (measure === 4 || measure === 5) {
      rootFreq = 98.00; // G2
      fifthFreq = 73.42; // D2
    }

    const freq = (beatIndex === 0) ? rootFreq : fifthFreq;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, time);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.24, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + 0.24);
  }

  playBGMOomPahChord(measure, time) {
    // Warm staccato offbeat chords on beats 2 & 4
    // C Major: [E4, G4, C5] = [329.63, 392.00, 523.25]
    // F Major: [F4, A4, C5] = [349.23, 440.00, 523.25]
    // G Major: [D4, G4, B4] = [293.66, 392.00, 493.88]
    let chordFreqs = [329.63, 392.00, 523.25];
    if (measure === 2 || measure === 3) {
      chordFreqs = [349.23, 440.00, 523.25];
    } else if (measure === 4 || measure === 5) {
      chordFreqs = [293.66, 392.00, 493.88];
    }

    chordFreqs.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, time);

      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.08, time + 0.010);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(time);
      osc.stop(time + 0.16);
    });
  }

  playBGMBrush(time, volume) {
    // Soft highpass noise burst for vintage brush/propeller swing
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.04);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.038);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    whiteNoise.start(time);
    whiteNoise.stop(time + 0.04);
  }

  playBGMMelodyStep(step, time) {
    // 8-measure cheerful staccato melody pattern (128 sixteenth notes)
    // Map sixteenth note step to melodic note (Hz) or 0 (rest)
    // Frequencies: G4: 392.0, A4: 440.0, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, G5: 784.0, A5: 880.0, C6: 1046.5
    const melodyMap = {
      // M1 (C): G4 - C5 - E5 - G5
      0: 392.0, 4: 523.3, 8: 659.3, 12: 784.0,
      // M2 (C): A5 - G5 - E5 - D5
      16: 880.0, 20: 784.0, 24: 659.3, 28: 587.3,
      // M3 (F): F5 - A5 - C6 - A5
      32: 698.5, 36: 880.0, 40: 1046.5, 44: 880.0,
      // M4 (F): G5 - F5 - E5 - D5
      48: 784.0, 52: 698.5, 56: 659.3, 60: 587.3,
      // M5 (G): B4 - D5 - G5 - B5
      64: 493.9, 68: 587.3, 72: 784.0, 76: 987.8,
      // M6 (G): C6 - B5 - A5 - G5
      80: 1046.5, 84: 987.8, 88: 880.0, 92: 784.0,
      // M7 (C): E5 - G5 - C6 - E6
      96: 659.3, 100: 784.0, 104: 1046.5, 108: 1318.5,
      // M8 (C): D6 - B5 - C6 (hold cadence)
      112: 1174.7, 116: 987.8, 120: 1046.5
    };

    const noteFreq = melodyMap[step];
    if (!noteFreq) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(noteFreq, time);

    // Soft cartoon whistle envelope: smooth 6ms attack, lively 130ms staccato decay
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.12, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + 0.16);
  }

  /* ========================================================================
     (3) SLINGSHOT & CONTINUOUS ENGINE/BOOSTER SYSTEM
     ======================================================================== */

  /**
   * (a) Elastic rubber-band stretch creak whose pitch scales with tension (0.2 to 1.0)
   */
  playSlingshotStretch(tension) {
    if (this.isMuted) return;

    const now = Date.now();
    // Throttle to avoid excessive clicks while dragging
    if (now - this.lastStretchTime < 65 && Math.abs(tension - this.lastStretchTension) < 0.05) {
      return;
    }
    this.lastStretchTime = now;
    this.lastStretchTension = tension;

    if (!this.ensureContext()) return;

    const ctxNow = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    // Base pitch scales dynamically with pull tension: 240Hz at 0.20 to 600Hz at 1.0
    const clampedTension = Math.max(0.2, Math.min(1.0, tension));
    const baseFreq = 220 + clampedTension * 380;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, ctxNow);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.75, ctxNow + 0.038);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(baseFreq * 1.5, ctxNow);
    filter.Q.setValueAtTime(3.0, ctxNow);

    gain.gain.setValueAtTime(0.001, ctxNow);
    gain.gain.linearRampToValueAtTime(0.14 * clampedTension, ctxNow + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, ctxNow + 0.038);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(ctxNow);
    osc.stop(ctxNow + 0.042);
  }

  /**
   * (b) Snappy catapult rubber twang + upward launch whoosh
   */
  playSlingshotRelease() {
    if (this.isMuted) return;
    if (!this.ensureContext()) return;

    const now = this.ctx.currentTime;

    // 1. Snappy Rubber Twang (sawtooth snap dropping 720Hz -> 130Hz)
    const twangOsc = this.ctx.createOscillator();
    const twangFilter = this.ctx.createBiquadFilter();
    const twangGain = this.ctx.createGain();

    twangOsc.type = 'sawtooth';
    twangOsc.frequency.setValueAtTime(740, now);
    twangOsc.frequency.exponentialRampToValueAtTime(125, now + 0.18);

    twangFilter.type = 'lowpass';
    twangFilter.frequency.setValueAtTime(1400, now);
    twangFilter.frequency.exponentialRampToValueAtTime(280, now + 0.18);

    twangGain.gain.setValueAtTime(0.48, now);
    twangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    twangOsc.connect(twangFilter);
    twangFilter.connect(twangGain);
    twangGain.connect(this.sfxGain);

    twangOsc.start(now);
    twangOsc.stop(now + 0.24);

    // 2. Upward Launch Whoosh (resonant noise sweeping upward 320Hz -> 1900Hz)
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.38);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const whooshSource = this.ctx.createBufferSource();
    whooshSource.buffer = noiseBuffer;

    const whooshFilter = this.ctx.createBiquadFilter();
    whooshFilter.type = 'bandpass';
    whooshFilter.Q.setValueAtTime(3.2, now);
    whooshFilter.frequency.setValueAtTime(320, now);
    whooshFilter.frequency.exponentialRampToValueAtTime(1950, now + 0.32);

    const whooshGain = this.ctx.createGain();
    whooshGain.gain.setValueAtTime(0.001, now);
    whooshGain.gain.linearRampToValueAtTime(0.42, now + 0.08);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    whooshSource.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(this.sfxGain);

    whooshSource.start(now);
    whooshSource.stop(now + 0.38);
  }

  /**
   * (c) Continuous modulated biplane propeller/engine audio system
   * Smooth low chug in PRE_LAUNCH, smooth wind+propeller hum in AIRBORNE_GLIDE,
   * roaring booster rocket flame + high-RPM climb in AIRBORNE_POWERED that cuts
   * back to glide hum the exact frame the player releases their finger.
   */
  startEngine() {
    if (this.engineRunning || !this.ensureContext()) return;
    this.engineRunning = true;

    const now = this.ctx.currentTime;

    // 1. Propeller Engine Stroke Oscillator (Sawtooth low-RPM pulse)
    this.enginePropOsc = this.ctx.createOscillator();
    this.enginePropOsc.type = 'sawtooth';
    this.enginePropOsc.frequency.setValueAtTime(28, now); // 28Hz idle

    const propFilter = this.ctx.createBiquadFilter();
    propFilter.type = 'lowpass';
    propFilter.frequency.setValueAtTime(320, now);

    this.enginePropGain = this.ctx.createGain();
    this.enginePropGain.gain.setValueAtTime(0.22, now);

    this.enginePropOsc.connect(propFilter);
    propFilter.connect(this.enginePropGain);
    this.enginePropGain.connect(this.engineGain);
    this.enginePropOsc.start(now);

    // 2. Continuous Wind Rush Noise Node
    const noiseSize = Math.floor(this.ctx.sampleRate * 2.0);
    const noiseBuffer = this.ctx.createBuffer(1, noiseSize, this.ctx.sampleRate);
    const nData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseSize; i++) {
      nData[i] = Math.random() * 2 - 1;
    }

    this.engineWindNode = this.ctx.createBufferSource();
    this.engineWindNode.buffer = noiseBuffer;
    this.engineWindNode.loop = true;

    this.engineWindFilter = this.ctx.createBiquadFilter();
    this.engineWindFilter.type = 'lowpass';
    this.engineWindFilter.frequency.setValueAtTime(650, now);

    this.engineWindGain = this.ctx.createGain();
    this.engineWindGain.gain.setValueAtTime(0.001, now); // silent in pre-launch

    this.engineWindNode.connect(this.engineWindFilter);
    this.engineWindFilter.connect(this.engineWindGain);
    this.engineWindGain.connect(this.engineGain);
    this.engineWindNode.start(now);

    // 3. Energetic Roaring Rocket Booster Flame + High-RPM Whine
    this.engineBoosterNode = this.ctx.createBufferSource();
    this.engineBoosterNode.buffer = noiseBuffer;
    this.engineBoosterNode.loop = true;

    const boosterFilter = this.ctx.createBiquadFilter();
    boosterFilter.type = 'bandpass';
    boosterFilter.frequency.setValueAtTime(280, now);
    boosterFilter.Q.setValueAtTime(2.2, now);

    this.engineBoosterGain = this.ctx.createGain();
    this.engineBoosterGain.gain.setValueAtTime(0.0001, now); // Off until boost

    this.engineBoosterOsc = this.ctx.createOscillator();
    this.engineBoosterOsc.type = 'sawtooth';
    this.engineBoosterOsc.frequency.setValueAtTime(320, now); // Turbine whine

    const boosterWhineGain = this.ctx.createGain();
    boosterWhineGain.gain.setValueAtTime(0.12, now);

    this.engineBoosterNode.connect(boosterFilter);
    boosterFilter.connect(this.engineBoosterGain);

    this.engineBoosterOsc.connect(boosterWhineGain);
    boosterWhineGain.connect(this.engineBoosterGain);

    this.engineBoosterGain.connect(this.engineGain);

    this.engineBoosterNode.start(now);
    this.engineBoosterOsc.start(now);

    // 4. Ground Rollout Rumble Node (for RUNWAY_TAXI)
    this.engineRumbleNode = this.ctx.createBufferSource();
    this.engineRumbleNode.buffer = noiseBuffer;
    this.engineRumbleNode.loop = true;

    const rumbleFilter = this.ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(160, now);

    this.engineRumbleGain = this.ctx.createGain();
    this.engineRumbleGain.gain.setValueAtTime(0.0001, now);

    this.engineRumbleNode.connect(rumbleFilter);
    rumbleFilter.connect(this.engineRumbleGain);
    this.engineRumbleGain.connect(this.engineGain);

    this.engineRumbleNode.start(now);
  }

  updateEngine(state, options = {}) {
    this.engineState = state;
    if (!this.ensureContext()) return;
    if (!this.engineRunning) {
      this.startEngine();
    }
    if (!this.ctx || !this.enginePropOsc) return;
    const now = this.ctx.currentTime;
    const vx = options.vx || 0;
    const maxTaxiVx = options.maxTaxiVx || 225.0;

    switch (state) {
      case FLIGHT_STATE.PRE_LAUNCH:
        // Gentle low biplane chug idling at 28Hz
        this.enginePropOsc.frequency.setTargetAtTime(28, now, 0.08);
        this.enginePropGain.gain.setTargetAtTime(0.20, now, 0.08);
        this.engineWindGain.gain.setTargetAtTime(0.0001, now, 0.08);
        this.engineBoosterGain.gain.setTargetAtTime(0.0001, now, 0.015);
        this.engineRumbleGain.gain.setTargetAtTime(0.0001, now, 0.05);
        break;

      case FLIGHT_STATE.LAUNCHING:
      case FLIGHT_STATE.AIRBORNE_GLIDE:
        // Smooth wind + mid-RPM propeller hum (~62Hz)
        this.enginePropOsc.frequency.setTargetAtTime(62, now, 0.06);
        this.enginePropGain.gain.setTargetAtTime(0.26, now, 0.06);
        this.engineWindFilter.frequency.setTargetAtTime(750, now, 0.08);
        this.engineWindGain.gain.setTargetAtTime(0.18, now, 0.06);
        // Cut booster flame immediately the exact frame finger is released
        this.engineBoosterGain.gain.setValueAtTime(0.0001, now);
        this.engineRumbleGain.gain.setTargetAtTime(0.0001, now, 0.05);
        break;

      case FLIGHT_STATE.AIRBORNE_POWERED:
        // Energetic roaring booster flame + high-RPM climb whine (~135Hz)
        this.enginePropOsc.frequency.setTargetAtTime(135, now, 0.04);
        this.enginePropGain.gain.setTargetAtTime(0.45, now, 0.04);
        this.engineWindFilter.frequency.setTargetAtTime(1450, now, 0.04);
        this.engineWindGain.gain.setTargetAtTime(0.36, now, 0.04);
        // Energetic combustion roar
        this.engineBoosterGain.gain.cancelScheduledValues(now);
        this.engineBoosterGain.gain.setValueAtTime(0.52, now);
        this.engineBoosterOsc.frequency.setTargetAtTime(420, now, 0.04);
        this.engineRumbleGain.gain.setTargetAtTime(0.0001, now, 0.05);
        break;

      case FLIGHT_STATE.RUNWAY_TAXI:
        // Decelerating ground-taxi roll rumble that pitches down to silence as vx reaches 0
        const taxiRatio = Math.max(0.0, Math.min(1.0, vx / maxTaxiVx));
        const propPitch = 18.0 + 38.0 * taxiRatio;
        this.enginePropOsc.frequency.setTargetAtTime(propPitch, now, 0.05);
        this.enginePropGain.gain.setTargetAtTime(0.18 * taxiRatio, now, 0.05);
        this.engineWindGain.gain.setTargetAtTime(0.0001, now, 0.05);
        this.engineBoosterGain.gain.setValueAtTime(0.0001, now);

        // Ground roll rumble
        this.engineRumbleGain.gain.setTargetAtTime(0.32 * taxiRatio, now, 0.04);
        break;

      case FLIGHT_STATE.FLIGHT_OVER:
      default:
        // Silence all engine components when stationary
        this.enginePropGain.gain.setTargetAtTime(0.0001, now, 0.08);
        this.engineWindGain.gain.setTargetAtTime(0.0001, now, 0.08);
        this.engineBoosterGain.gain.setValueAtTime(0.0001, now);
        this.engineRumbleGain.gain.setTargetAtTime(0.0001, now, 0.08);
        break;
    }
  }

  stopEngine() {
    if (!this.engineRunning) return;
    this.engineRunning = false;
    this.engineState = 'STOPPED';

    try {
      if (this.enginePropOsc) { this.enginePropOsc.stop(); this.enginePropOsc.disconnect(); }
      if (this.engineWindNode) { this.engineWindNode.stop(); this.engineWindNode.disconnect(); }
      if (this.engineBoosterNode) { this.engineBoosterNode.stop(); this.engineBoosterNode.disconnect(); }
      if (this.engineBoosterOsc) { this.engineBoosterOsc.stop(); this.engineBoosterOsc.disconnect(); }
      if (this.engineRumbleNode) { this.engineRumbleNode.stop(); this.engineRumbleNode.disconnect(); }
    } catch {}

    this.enginePropOsc = null;
    this.engineWindNode = null;
    this.engineBoosterNode = null;
    this.engineBoosterOsc = null;
    this.engineRumbleNode = null;
  }

  /**
   * (d) Rubber tire touchdown chirp
   */
  playTouchdownChirp() {
    if (this.isMuted) return;
    if (!this.ensureContext()) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    // High rubber tire skid chirp sweeping down 1850Hz -> 820Hz in 55ms
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1850, now);
    osc.frequency.exponentialRampToValueAtTime(820, now + 0.055);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1300, now);
    filter.Q.setValueAtTime(2.8, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.075);
  }

  /* ========================================================================
     (4) COLLECTIBLE & POWER-UP SOUND EFFECTS
     ======================================================================== */

  /**
   * (a) Winged Star: bright sparkling glockenspiel/bell chime that steps up in pitch across consecutive rapid star pickups
   */
  playStarCollect(comboCount) {
    if (this.isMuted) return;

    const now = Date.now();
    if (now - this.lastStarTime < 1400) {
      this.starComboCount++;
    } else {
      this.starComboCount = 0;
    }
    this.lastStarTime = now;

    if (!this.ensureContext()) return;

    const combo = comboCount !== undefined ? comboCount : this.starComboCount;

    // Sparkling diatonic/pentatonic bell steps: C6, D6, E6, G6, A6, C7, D7, E7
    const starScale = [1046.5, 1174.7, 1318.5, 1568.0, 1760.0, 2093.0, 2349.3, 2637.0];
    const baseFreq = starScale[combo % starScale.length];
    const chimeFreq = baseFreq * 2.76; // Metallic non-harmonic bell partial

    const ctxNow = this.ctx.currentTime;

    // Fundamental bell chime
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(baseFreq, ctxNow);

    gain1.gain.setValueAtTime(0.38, ctxNow);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctxNow + 0.32);

    osc1.connect(gain1);
    gain1.connect(this.sfxGain);
    osc1.start(ctxNow);
    osc1.stop(ctxNow + 0.35);

    // High sparkle overtone
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(chimeFreq, ctxNow);

    gain2.gain.setValueAtTime(0.18, ctxNow);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctxNow + 0.18);

    osc2.connect(gain2);
    gain2.connect(this.sfxGain);
    osc2.start(ctxNow);
    osc2.stop(ctxNow + 0.20);
  }

  /**
   * (b) Bolts/Cogs/Springs: crisp glass-bubble pop + metallic gear/wrench clink
   */
  playToolCollect(toolType = 'bolt') {
    if (this.isMuted) return;
    if (!this.ensureContext()) return;

    const now = this.ctx.currentTime;

    // 1. Crisp Glass-Bubble Pop (swept sine drop 880Hz -> 360Hz in 25ms)
    const popOsc = this.ctx.createOscillator();
    const popGain = this.ctx.createGain();

    popOsc.type = 'sine';
    popOsc.frequency.setValueAtTime(880, now);
    popOsc.frequency.exponentialRampToValueAtTime(360, now + 0.026);

    popGain.gain.setValueAtTime(0.42, now);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

    popOsc.connect(popGain);
    popGain.connect(this.sfxGain);
    popOsc.start(now);
    popOsc.stop(now + 0.045);

    // 2. Metallic Gear / Wrench Clink (dual dissonant ring pings 1540Hz & 2420Hz)
    [1540, 2420].forEach((freq) => {
      const clinkOsc = this.ctx.createOscillator();
      const clinkGain = this.ctx.createGain();

      clinkOsc.type = 'triangle';
      clinkOsc.frequency.setValueAtTime(freq, now + 0.008);

      clinkGain.gain.setValueAtTime(0.001, now + 0.008);
      clinkGain.gain.linearRampToValueAtTime(0.24, now + 0.014);
      clinkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      clinkOsc.connect(clinkGain);
      clinkGain.connect(this.sfxGain);

      clinkOsc.start(now + 0.008);
      clinkOsc.stop(now + 0.18);
    });
  }

  /**
   * (c) Battery Canister: ascending electric charge arpeggio sweep as booster energy refills
   */
  playBatteryCollect() {
    if (this.isMuted) return;
    if (!this.ensureContext()) return;

    const now = this.ctx.currentTime;
    // 4 rapid ascending notes: C5 (523.3), E5 (659.3), G5 (784.0), C6 (1046.5)
    const notes = [523.3, 659.3, 784.0, 1046.5];

    notes.forEach((freq, idx) => {
      const noteTime = now + idx * 0.042;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, noteTime);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(freq * 1.5, noteTime);
      filter.Q.setValueAtTime(4.0, noteTime);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.linearRampToValueAtTime(0.32, noteTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.12);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.14);
    });
  }

  /**
   * (d) Horseshoe Magnet: magnetic activation pulse zing + subtle low pulsing hum
   */
  playMagnetActivate() {
    if (this.isMuted) return;
    if (!this.ensureContext()) return;

    const now = this.ctx.currentTime;

    // Fast sci-fi cartoon activation pulse zing (sweeps 320Hz -> 2500Hz with vibrato)
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(2500, now + 0.22);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.setValueAtTime(2.5, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.40, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.28);

    // Start subtle continuous pulsing cyan magnetic hum
    this.startMagnetHum();
  }

  startMagnetHum() {
    if (this.isMagnetHumming || this.isMuted || !this.ensureContext()) return;
    this.isMagnetHumming = true;

    const now = this.ctx.currentTime;

    // 90Hz triangle oscillator with 4Hz LFO tremolo
    this.magnetHumOsc = this.ctx.createOscillator();
    this.magnetHumOsc.type = 'triangle';
    this.magnetHumOsc.frequency.setValueAtTime(92, now);

    this.magnetHumGain = this.ctx.createGain();
    this.magnetHumGain.gain.setValueAtTime(0.001, now);
    this.magnetHumGain.gain.linearRampToValueAtTime(0.16, now + 0.15);

    this.magnetLfo = this.ctx.createOscillator();
    this.magnetLfo.type = 'sine';
    this.magnetLfo.frequency.setValueAtTime(4.5, now); // 4.5Hz pulse

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0.08, now);

    this.magnetLfo.connect(lfoGain);
    lfoGain.connect(this.magnetHumGain.gain);

    this.magnetHumOsc.connect(this.magnetHumGain);
    this.magnetHumGain.connect(this.engineGain);

    this.magnetHumOsc.start(now);
    this.magnetLfo.start(now);
  }

  stopMagnetHum() {
    if (!this.isMagnetHumming) return;
    this.isMagnetHumming = false;

    if (this.ctx && this.magnetHumGain) {
      const now = this.ctx.currentTime;
      this.magnetHumGain.gain.cancelScheduledValues(now);
      this.magnetHumGain.gain.setTargetAtTime(0.0001, now, 0.06);

      setTimeout(() => {
        try {
          if (this.magnetHumOsc) { this.magnetHumOsc.stop(); this.magnetHumOsc.disconnect(); }
          if (this.magnetLfo) { this.magnetLfo.stop(); this.magnetLfo.disconnect(); }
        } catch {}
        this.magnetHumOsc = null;
        this.magnetLfo = null;
        this.magnetHumGain = null;
      }, 100);
    }
  }

  /* ========================================================================
     (5) UI CLICKS, WRENCH UPGRADE CEREMONY & FLIGHT RESULTS JINGLE
     ======================================================================== */

  /**
   * Crisp cartoon pop click for all UI buttons
   */
  playUIClick() {
    if (this.isMuted) return;
    if (!this.ensureContext()) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(210, now + 0.024);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.035);
  }

  /**
   * Metallic double wrench-ratchet clink + ascending golden sparkle chord fanfare
   */
  playUpgradeCeremony() {
    if (this.isMuted) return;
    if (!this.ensureContext()) return;

    const now = this.ctx.currentTime;

    // 1. Two rapid metallic wrench-ratchet clicks (45ms apart)
    [0.0, 0.048].forEach((offset) => {
      const t = now + offset;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1420, t);
      osc.frequency.exponentialRampToValueAtTime(620, t + 0.022);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, t);
      filter.Q.setValueAtTime(4.0, t);

      gain.gain.setValueAtTime(0.36, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.032);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.04);
    });

    // 2. Ascending Golden Sparkle Triad Chord: C5, E5, G5, C6
    const chord = [523.3, 659.3, 784.0, 1046.5];
    chord.forEach((freq, idx) => {
      const t = now + 0.10 + idx * 0.06;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.35, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  /**
   * Cheerful completion jingle (and extra triumphant brass fanfare on isNewRecord)
   */
  playFlightOverJingle(isNewRecord = false) {
    if (this.isMuted) return;
    if (!this.ensureContext()) return;

    const now = this.ctx.currentTime;

    if (!isNewRecord) {
      // Cheerful 4-note completion cadence: G4 - C5 - E5 - G5
      const notes = [392.0, 523.3, 659.3, 784.0];
      notes.forEach((freq, idx) => {
        const t = now + idx * 0.12;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.32, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + (idx === 3 ? 0.45 : 0.22));

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(t);
        osc.stop(t + (idx === 3 ? 0.48 : 0.25));
      });
    } else {
      // Triumphant Brass Fanfare for NEW RECORD: C5, C5, C5, G5, A5, B5, C6
      const fanfare = [
        { f: 523.3, dur: 0.12, off: 0.0 },
        { f: 523.3, dur: 0.12, off: 0.14 },
        { f: 523.3, dur: 0.16, off: 0.28 },
        { f: 784.0, dur: 0.22, off: 0.46 },
        { f: 880.0, dur: 0.16, off: 0.70 },
        { f: 987.8, dur: 0.16, off: 0.88 },
        { f: 1046.5, dur: 0.55, off: 1.06 }
      ];

      fanfare.forEach((note) => {
        const t = now + note.off;
        // Dual saw + square for rich cartoon brass timbre
        ['sawtooth', 'triangle'].forEach((type, vIdx) => {
          const osc = this.ctx.createOscillator();
          const filter = this.ctx.createBiquadFilter();
          const gain = this.ctx.createGain();

          osc.type = type;
          osc.frequency.setValueAtTime(note.f * (vIdx === 1 ? 0.998 : 1.0), t);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1800, t);

          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(0.24, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + note.dur);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.sfxGain);

          osc.start(t);
          osc.stop(t + note.dur + 0.05);
        });
      });
    }
  }
}

// Export singleton instance for seamless zero-config access
export const soundManager = new SoundManager();
