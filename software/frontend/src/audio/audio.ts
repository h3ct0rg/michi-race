// Motor de audio: todo se sintetiza con Web Audio (estilo chiptune), sin archivos de sonido.
// El AudioContext se crea y se reanuda con el primer gesto del usuario (política de autoplay).

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(`michi.${k}`);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(`michi.${k}`, v);
    } catch {
      /* modo privado */
    }
  },
};

export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  dur: number;
  vol?: number;
  delay?: number;
  attack?: number;
  dest?: AudioNode;
}

interface NoiseOptions {
  dur: number;
  vol?: number;
  filter?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
  delay?: number;
  dest?: AudioNode;
}

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  private noiseBuffer!: AudioBuffer;
  muted = store.get('muted') === '1';
  /** Volúmenes de la configuración (0..1): general, música y efectos. */
  private volumes = { master: 1, music: 1, sfx: 1 };
  private listeners = new Set<(muted: boolean) => void>();

  constructor() {
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    // sin sonido con la pestaña oculta
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
  }

  /** Crea/reanuda el contexto. Debe ocurrir dentro de un gesto del usuario la primera vez. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterLevel();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.6 * this.volumes.sfx;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.22 * this.volumes.music;
      this.musicBus.connect(this.master);
      // ruido blanco reutilizable (derrape, choques, percusión)
      const len = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
  }

  get ready() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    store.set('muted', muted ? '1' : '0');
    if (this.ctx) this.master.gain.setTargetAtTime(this.masterLevel(), this.ctx.currentTime, 0.02);
    this.listeners.forEach((l) => l(muted));
  }

  private masterLevel() {
    return this.muted ? 0 : 0.8 * this.volumes.master;
  }

  setVolumes(v: { master: number; music: number; sfx: number }) {
    this.volumes = { ...v };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.masterLevel(), now, 0.02);
    this.sfxBus.gain.setTargetAtTime(0.6 * v.sfx, now, 0.02);
    this.musicBus.gain.setTargetAtTime(0.22 * v.music, now, 0.02);
  }

  toggleMuted() {
    this.unlock();
    this.setMuted(!this.muted);
  }

  onMutedChange(fn: (muted: boolean) => void) {
    this.listeners.add(fn);
    fn(this.muted);
  }

  /** Nota con envolvente (ataque corto + caída exponencial) y barrido de frecuencia opcional. */
  tone({ type = 'square', freq, freqEnd, dur, vol = 0.3, delay = 0, attack = 0.005, dest }: ToneOptions) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Ráfaga de ruido filtrado (choques, whoosh, percusión). */
  noise({ dur, vol = 0.3, filter = 'lowpass', freq = 1000, freqEnd, q = 1, delay = 0, dest }: NoiseOptions) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest ?? this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  /** Fuente de ruido continua (para loops como derrape o tierra). */
  noiseLoop(): AudioBufferSourceNode | null {
    if (!this.ctx) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    return src;
  }
}

export const audio = new AudioEngine();

// ---------------------------------------------------------------- efectos

export const sfx = {
  click: () => audio.tone({ type: 'square', freq: 880, freqEnd: 1320, dur: 0.05, vol: 0.12 }),
  countdown: () => audio.tone({ type: 'square', freq: 523, dur: 0.18, vol: 0.25 }),
  go: () => {
    audio.tone({ type: 'square', freq: 1047, dur: 0.45, vol: 0.28 });
    audio.tone({ type: 'square', freq: 1568, dur: 0.45, vol: 0.12, delay: 0.02 });
  },
  turbo: () => {
    audio.noise({ dur: 0.7, vol: 0.35, filter: 'bandpass', freq: 400, freqEnd: 3500, q: 2 });
    audio.tone({ type: 'sawtooth', freq: 180, freqEnd: 720, dur: 0.6, vol: 0.12 });
  },
  miniTurbo: (big: boolean) => {
    audio.tone({ type: 'square', freq: big ? 660 : 520, freqEnd: big ? 1760 : 1320, dur: 0.22, vol: 0.18 });
    audio.noise({ dur: 0.35, vol: 0.2, filter: 'bandpass', freq: 800, freqEnd: 3000, q: 3 });
  },
  pad: () => {
    [0, 0.05, 0.1].forEach((d, i) => audio.tone({ type: 'square', freq: midiToFreq(76 + i * 4), dur: 0.09, vol: 0.14, delay: d }));
    audio.noise({ dur: 0.4, vol: 0.18, filter: 'bandpass', freq: 1200, freqEnd: 4000, q: 2 });
  },
  driftLevel: (level: 1 | 2) => audio.tone({ type: 'square', freq: level === 1 ? 1319 : 1760, dur: 0.08, vol: 0.12 }),
  bump: () => {
    audio.noise({ dur: 0.18, vol: 0.45, filter: 'lowpass', freq: 900, freqEnd: 120 });
    audio.tone({ type: 'sine', freq: 140, freqEnd: 45, dur: 0.22, vol: 0.4 });
  },
  respawn: () => [0, 0.08, 0.16].forEach((d, i) => audio.tone({ type: 'square', freq: midiToFreq(72 - i * 5), dur: 0.1, vol: 0.15, delay: d })),
  lap: (last: boolean) => {
    const notes = last ? [76, 79, 84, 88] : [79, 84];
    notes.forEach((n, i) => audio.tone({ type: 'square', freq: midiToFreq(n), dur: 0.16, vol: 0.18, delay: i * (last ? 0.08 : 0.1) }));
  },
  // ---- ítems
  itemRoulette: () => {
    for (let i = 0; i < 10; i++) audio.tone({ type: 'square', freq: midiToFreq(76 + (i % 4) * 3), dur: 0.05, vol: 0.09, delay: i * 0.11 });
  },
  itemReady: () => {
    audio.tone({ type: 'square', freq: 1319, dur: 0.08, vol: 0.16 });
    audio.tone({ type: 'square', freq: 1760, dur: 0.14, vol: 0.16, delay: 0.07 });
  },
  boxBreak: () => audio.noise({ dur: 0.12, vol: 0.18, filter: 'highpass', freq: 3000 }),
  throwBomb: () => audio.tone({ type: 'triangle', freq: 300, freqEnd: 900, dur: 0.25, vol: 0.25 }),
  rocketLaunch: () => {
    audio.noise({ dur: 0.9, vol: 0.3, filter: 'bandpass', freq: 600, freqEnd: 2400, q: 1.5 });
    audio.tone({ type: 'sawtooth', freq: 110, freqEnd: 440, dur: 0.8, vol: 0.12 });
  },
  lightning: () => {
    audio.noise({ dur: 0.08, vol: 0.5, filter: 'highpass', freq: 2000 });
    audio.noise({ dur: 1.1, vol: 0.4, filter: 'lowpass', freq: 900, freqEnd: 80, delay: 0.05 });
    audio.tone({ type: 'sawtooth', freq: 1800, freqEnd: 120, dur: 0.25, vol: 0.15 });
  },
  freeze: () => {
    [0, 0.05, 0.1, 0.15].forEach((d, i) => audio.tone({ type: 'triangle', freq: midiToFreq(96 - i * 3), dur: 0.2, vol: 0.12, delay: d }));
    audio.noise({ dur: 0.4, vol: 0.2, filter: 'highpass', freq: 5000 });
  },
  shieldUp: () => audio.tone({ type: 'sine', freq: 330, freqEnd: 990, dur: 0.35, vol: 0.25 }),
  shieldBlock: () => {
    audio.tone({ type: 'square', freq: 1568, dur: 0.12, vol: 0.18 });
    audio.tone({ type: 'sine', freq: 784, freqEnd: 392, dur: 0.3, vol: 0.2 });
  },
  splash: () => {
    // golpe contra el agua + rocío que cae
    audio.noise({ dur: 0.25, vol: 0.5, filter: 'lowpass', freq: 2200, freqEnd: 300 });
    audio.tone({ type: 'sine', freq: 220, freqEnd: 60, dur: 0.3, vol: 0.35 });
    audio.noise({ dur: 0.9, vol: 0.22, filter: 'highpass', freq: 3500, freqEnd: 1500, delay: 0.12 });
    [0, 0.07, 0.15].forEach((d, i) => audio.tone({ type: 'sine', freq: midiToFreq(84 + i * 5), freqEnd: midiToFreq(91 + i * 5), dur: 0.06, vol: 0.08, delay: 0.2 + d }));
  },
  magnet: () => audio.tone({ type: 'sine', freq: 220, freqEnd: 660, dur: 0.6, vol: 0.2 }),
  explosion: (near: number) => {
    audio.noise({ dur: 0.7, vol: 0.55 * near, filter: 'lowpass', freq: 1400, freqEnd: 60 });
    audio.tone({ type: 'sine', freq: 90, freqEnd: 30, dur: 0.5, vol: 0.5 * near });
  },
  spinHit: () => {
    audio.tone({ type: 'square', freq: 880, freqEnd: 220, dur: 0.5, vol: 0.15 });
    audio.noise({ dur: 0.3, vol: 0.25, filter: 'bandpass', freq: 2000, q: 4 });
  },
  shocked: () => {
    for (let i = 0; i < 6; i++) audio.tone({ type: 'sawtooth', freq: 300 + Math.random() * 900, dur: 0.05, vol: 0.12, delay: i * 0.05 });
  },
  finish: (win: boolean) => {
    const notes = win ? [72, 76, 79, 84, 79, 84] : [72, 76, 79, 77];
    notes.forEach((n, i) => {
      const long = i === notes.length - 1;
      audio.tone({ type: 'square', freq: midiToFreq(n), dur: long ? 0.6 : 0.14, vol: 0.2, delay: i * 0.13 });
      audio.tone({ type: 'triangle', freq: midiToFreq(n - 12), dur: long ? 0.6 : 0.14, vol: 0.2, delay: i * 0.13 });
    });
  },
};
