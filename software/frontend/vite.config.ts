import { defineConfig } from 'vite';

// En desarrollo el backend C# corre en :5080; Vite reenvía la API y el hub de SignalR.
const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:5080';

export default defineConfig({
  server: {
    host: true, // accesible desde otras PCs de la red para probar con 2 equipos
    proxy: {
      '/api': BACKEND,
      '/hubs': { target: BACKEND, ws: true },
    },
  },
});
