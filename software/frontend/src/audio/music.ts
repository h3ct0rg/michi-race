// Música chiptune generada en vivo: bajo, arpegio, melodía y percusión, con un tema por pista.
// Secuenciador con "lookahead": cada 25 ms agenda las notas de los próximos 120 ms en el reloj de audio.
import { audio, midiToFreq } from './audio';

interface Song {
  bpm: number;
  /** Acordes por compás: [raíz del bajo, notas del arpegio...] en MIDI. */
  chords: number[][];
  /** Melodía por compás: 8 corcheas (0 = silencio). */
  melody: number[][];
}

const SONGS: Record<string, Song> = {
  // Green Valley: mayor y alegre (C – G – Am – F)
  'green-valley': {
    bpm: 148,
    chords: [
      [36, 60, 64, 67, 72],
      [43, 59, 62, 67, 71],
      [45, 60, 64, 69, 72],
      [41, 60, 65, 69, 72],
    ],
    melody: [
      [76, 0, 79, 0, 81, 79, 76, 0],
      [74, 0, 71, 74, 79, 0, 74, 0],
      [72, 0, 76, 0, 81, 0, 79, 76],
      [77, 0, 76, 74, 72, 0, 0, 0],
    ],
  },
  // Desert Run: menor armónica, aire árabe/flamenco (Dm – C – Bb – A)
  'desert-run': {
    bpm: 132,
    chords: [
      [38, 62, 65, 69, 74],
      [36, 60, 64, 67, 72],
      [34, 58, 62, 65, 70],
      [33, 61, 64, 69, 73],
    ],
    melody: [
      [74, 0, 73, 74, 76, 0, 77, 76],
      [74, 0, 72, 0, 70, 72, 74, 0],
      [70, 0, 69, 70, 74, 0, 70, 0],
      [69, 70, 73, 0, 76, 0, 73, 0],
    ],
  },
  // Coastal Road: calipso tropical sincopado (F – Bb – C – F)
  'coastal-road': {
    bpm: 140,
    chords: [
      [41, 65, 69, 72, 77],
      [46, 65, 70, 74, 77],
      [48, 64, 67, 72, 76],
      [41, 65, 69, 72, 77],
    ],
    melody: [
      [77, 0, 77, 76, 0, 74, 72, 0],
      [74, 0, 77, 0, 74, 72, 70, 0],
      [72, 0, 76, 79, 0, 76, 72, 0],
      [77, 76, 77, 0, 81, 0, 77, 0],
    ],
  },
};

const LOOKAHEAD = 0.12;
const INTERVAL_MS = 25;

export class Music {
  private timer = 0;
  private song: Song | null = null;
  private step = 0; // semicorchea actual
  private nextTime = 0;

  start(trackId: string) {
    this.stop();
    const ctx = audio.ctx;
    if (!ctx) return;
    this.song = SONGS[trackId] ?? SONGS['green-valley'];
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), INTERVAL_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
    this.song = null;
  }

  private schedule() {
    const ctx = audio.ctx;
    const song = this.song;
    if (!ctx || !song) return;
    const sixteenth = 60 / song.bpm / 4;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(song, this.step, this.nextTime - ctx.currentTime, sixteenth);
      this.step = (this.step + 1) % (16 * song.chords.length);
      this.nextTime += sixteenth;
    }
  }

  private playStep(song: Song, step: number, delay: number, len: number) {
    if (delay < 0) return; // pestaña reanudada: se saltan las notas atrasadas
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const [root, ...arp] = song.chords[bar];
    const dest = audio.musicBus;

    // bajo: corcheas alternando raíz y octava
    if (s % 2 === 0) audio.tone({ type: 'triangle', freq: midiToFreq(root + (s % 4 === 2 ? 12 : 0)), dur: len * 1.8, vol: 0.5, delay, dest });
    // arpegio en semicorcheas, suave
    audio.tone({ type: 'square', freq: midiToFreq(arp[s % arp.length]), dur: len * 0.9, vol: 0.07, delay, dest });
    // melodía en corcheas
    if (s % 2 === 0) {
      const note = song.melody[bar][s / 2];
      if (note) audio.tone({ type: 'square', freq: midiToFreq(note), dur: len * 1.9, vol: 0.13, delay, dest });
    }
    // percusión: bombo en 1 y 3, caja en 2 y 4, hi-hat en corcheas
    if (s % 8 === 0) audio.tone({ type: 'sine', freq: 150, freqEnd: 40, dur: 0.16, vol: 0.55, delay, dest });
    if (s % 8 === 4) audio.noise({ dur: 0.12, vol: 0.22, filter: 'highpass', freq: 1500, delay, dest });
    if (s % 2 === 0) audio.noise({ dur: 0.03, vol: 0.08, filter: 'highpass', freq: 7000, delay, dest });
  }
}

export const music = new Music();
