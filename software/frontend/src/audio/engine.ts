// Sonido continuo del kart propio: motor (sube con la velocidad), chirrido de derrape y tierra fuera de pista.
import { audio } from './audio';

export class EngineSound {
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly saw: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly tone: BiquadFilterNode;
  private readonly engineGain: GainNode;
  private readonly driftGain: GainNode;
  private readonly dirtGain: GainNode;

  private constructor(private readonly ctx: AudioContext) {
    const out = audio.sfxBus;
    // motor: sierra + cuadrada una octava abajo, pasadas por un pasabajos
    this.saw = ctx.createOscillator();
    this.saw.type = 'sawtooth';
    this.sub = ctx.createOscillator();
    this.sub.type = 'square';
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.Q.value = 4;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.6;
    this.saw.connect(this.tone);
    this.sub.connect(subGain).connect(this.tone);
    this.tone.connect(this.engineGain).connect(out);

    // derrape: ruido agudo en banda
    const drift = audio.noiseLoop()!;
    const driftFilter = ctx.createBiquadFilter();
    driftFilter.type = 'bandpass';
    driftFilter.frequency.value = 2600;
    driftFilter.Q.value = 6;
    this.driftGain = ctx.createGain();
    this.driftGain.gain.value = 0;
    drift.connect(driftFilter).connect(this.driftGain).connect(out);

    // tierra / pasto: ruido grave
    const dirt = audio.noiseLoop()!;
    const dirtFilter = ctx.createBiquadFilter();
    dirtFilter.type = 'lowpass';
    dirtFilter.frequency.value = 380;
    this.dirtGain = ctx.createGain();
    this.dirtGain.gain.value = 0;
    dirt.connect(dirtFilter).connect(this.dirtGain).connect(out);

    this.sources.push(this.saw, this.sub, drift, dirt);
    this.nodes.push(this.tone, subGain, this.engineGain, driftFilter, this.driftGain, dirtFilter, this.dirtGain);
    for (const s of this.sources) s.start();
  }

  static create(): EngineSound | null {
    return audio.ctx ? new EngineSound(audio.ctx) : null;
  }

  /** speedPct 0..~1.3 (con turbo). */
  update(speedPct: number, boosting: boolean, drifting: boolean, offroad: boolean, active: boolean) {
    const t = this.ctx.currentTime;
    const s = Math.max(0, speedPct);
    const freq = 48 + s * 110 + (boosting ? 25 : 0);
    this.saw.frequency.setTargetAtTime(freq, t, 0.06);
    this.sub.frequency.setTargetAtTime(freq / 2, t, 0.06);
    this.tone.frequency.setTargetAtTime(500 + s * 1500 + (boosting ? 900 : 0), t, 0.08);
    this.engineGain.gain.setTargetAtTime(active ? 0.07 + s * 0.06 : 0, t, 0.08);
    this.driftGain.gain.setTargetAtTime(active && drifting ? 0.09 : 0, t, 0.05);
    this.dirtGain.gain.setTargetAtTime(active && offroad ? 0.2 * Math.min(1, s * 2) : 0, t, 0.06);
  }

  stop() {
    const t = this.ctx.currentTime;
    for (const g of [this.engineGain, this.driftGain, this.dirtGain]) g.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      for (const s of this.sources) s.stop();
      for (const n of [...this.sources, ...this.nodes]) n.disconnect();
    }, 300);
  }
}
