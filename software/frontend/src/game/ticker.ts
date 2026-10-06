// Temporizador que sigue funcionando con la pestaña en segundo plano.
// Los navegadores frenan requestAnimationFrame y setInterval (a ~1/s) en pestañas ocultas,
// pero no los timers de un Web Worker: así los inputs se siguen enviando a 30/s.

const WORKER_SRC = `let id = 0;
onmessage = (e) => {
  clearInterval(id);
  if (e.data > 0) id = setInterval(() => postMessage(0), e.data);
};`;

export class Ticker {
  private worker: Worker | null = null;
  private fallback = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly onTick: () => void,
  ) {}

  start() {
    this.stop();
    try {
      this.worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
      this.worker.onmessage = () => this.onTick();
      this.worker.postMessage(this.intervalMs);
    } catch {
      this.fallback = window.setInterval(this.onTick, this.intervalMs);
    }
  }

  stop() {
    this.worker?.terminate();
    this.worker = null;
    clearInterval(this.fallback);
  }
}
