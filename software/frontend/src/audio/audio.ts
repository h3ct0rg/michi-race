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
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.6;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.22;
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
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.02);
    this.listeners.forEach((l) => l(muted));
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
  finish: (win: boolean) => {
    const notes = win ? [72, 76, 79, 84, 79, 84] : [72, 76, 79, 77];
    notes.forEach((n, i) => {
      const long = i === notes.length - 1;
      audio.tone({ type: 'square', freq: midiToFreq(n), dur: long ? 0.6 : 0.14, vol: 0.2, delay: i * 0.13 });
      audio.tone({ type: 'triangle', freq: midiToFreq(n - 12), dur: long ? 0.6 : 0.14, vol: 0.2, delay: i * 0.13 });
    });
  },
};
