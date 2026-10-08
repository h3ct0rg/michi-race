# Michi Racer

Juego de carreras arcade multijugador 2.5D (pixel art) para navegador. Hasta 20 pilotos por sala.

```
software/
├── backend/   C# .NET 10 · ASP.NET Core + SignalR (servidor autoritativo)
│   ├── src/MichiRacer.Game     simulación (port de frontend/src/sim) + salas
│   ├── src/MichiRacer.Server   hub SignalR (MessagePack), game loop 30 Hz, API REST, métricas
│   ├── tests/                  paridad con TypeScript (20 karts) + reglas de sala
│   └── tools/MichiRacer.LoadTest   prueba de carga con clientes SignalR
└── frontend/  TypeScript + Vite · render pseudo-3D en Canvas
    ├── src/sim/      física, pista, carrera (sin DOM; misma lógica que el servidor)
    ├── src/game/     sesiones: práctica local y online (predicción, reconciliación, interpolación)
    ├── src/net/      cliente SignalR, reloj sincronizado, simulador de latencia
    ├── src/render/   renderer pseudo-3D, sprites, parallax
    └── src/ui/       bienvenida, lobby, garaje, HUD, resultados, panel de diagnóstico
```

## Ejecutar en desarrollo

```bash
dotnet run --project backend/src/MichiRacer.Server --launch-profile http   # http://localhost:5080
npm --prefix frontend install
npm --prefix frontend run dev                                              # http://localhost:5173
```

Vite reenvía `/api` y `/hubs` al backend. Para jugar entre 2 PCs de la misma red, abre
`http://<ip-de-tu-pc>:5173` en la otra máquina (Vite escucha en todas las interfaces).

## Herramientas de red

| Qué | Cómo |
| --- | --- |
| Simular mala conexión | `http://localhost:5173/?lag=150&jitter=30&spike=0.01` (RTT extra, variación, cortes de ~300 ms) |
| Panel de diagnóstico | **F3** en carrera (o `?debug`): ping, snapshots/s, jitter, retraso de interpolación, correcciones, métricas del servidor |
| Protocolo JSON (depurar) | `?proto=json` (por defecto MessagePack) |
| Métricas del servidor | `GET /api/metrics`: salas, jugadores, ms por tick, bytes por snapshot, KB/s por jugador |
| Prueba de carga | `dotnet run --project backend/tools/MichiRacer.LoadTest -- --rooms 3 --players 20 --seconds 30` |

Referencia (localhost, 3 salas × 20 pilotos): tick 0,23 ms de 33 ms, snapshot de 20 karts 1,1 KB,
~22 KB/s por jugador, 20,8 snapshots/s por cliente, 0 desconexiones.

## Cómo funciona el online

- **Servidor autoritativo** a 30 ticks/s. El cliente solo envía inputs (`SendInput(seq, steer, buttons)`).
- **Snapshots a 20/s, personalizados**: 9 floats por kart para todos + estado físico completo solo del propio kart.
- **Reloj sincronizado**: el cliente estima el tick del servidor y simula su kart en `tick + RTT`, así sus inputs
  llegan justo a tiempo. La largada es justa: todos arrancan en el mismo tick del servidor sin importar el ping.
- **Predicción + reconciliación** del kart propio (incluye choques contra rivales extrapolados) con
  **corrección visual suave** (~100 ms). Los rivales se **interpolan** con un retraso que se adapta al jitter.
- **Reconexión**: cada jugador recibe un token. Si se cae la red o recarga la página vuelve a su lugar (y a su kart);
  mientras tanto el servidor maneja su kart en piloto automático (gracia: 10 s en lobby, 60 s en carrera).
- **Espectador**: quien entra a mitad de carrera la ve siguiendo al líder y corre en la siguiente.
- **Anti-abuso**: steer recortado y validado, máximo 90 inputs/s, cola de inputs acotada, límite de acciones del lobby
  y de tamaño de mensaje.
- Los inputs se envían desde un Web Worker: siguen saliendo aunque la pestaña esté en segundo plano.

## Pistas

| Pista | Ambientación |
| --- | --- |
| Green Valley | Bosques, colinas y montañas nevadas |
| Desert Run | Atardecer, mesas, dunas, cañón de curvas en S, ruinas |
| Neon City | Noche, rascacielos, neón, lluvia, paso elevado y chicana |
| Coastal Road | Isla tropical al mediodía, playa, faro y un puente sobre el mar (salirse por la orilla = caer al agua) |

## Power-ups y obstáculos

Filas de cajas **?** en cada pista (reaparecen a los 2,5 s). El ítem se sortea según tu posición:
los de atrás reciben ítems ofensivos y los de adelante defensivos. Se usa con **Espacio** (o el botón ÍTEM en táctil).

| Ítem | Efecto |
| --- | --- |
| Turbo | Acelerón largo |
| Escudo | Bloquea un golpe (8 s) |
| Bomba | Se lanza adelante, queda armada y explota al contacto (trompo) |
| Rayo | Electrocuta y frena a todos los que van adelante |
| Imán | Atrae cajas y da un empujón de velocidad |
| Hielo | Congela al kart de adelante |
| Cohete | Persigue y golpea al kart de adelante |

Obstáculos pintados en la pista: **aceite** (trompo), **arena** (frena), **charco** (resbala).
Toda la lógica de ítems vive en la simulación (TS y C#), así que el servidor la decide y la paridad la verifica.

Agregar una pista:
1. Lógica: `frontend/src/sim/tracks/<pista>.ts` (curvas, colinas, pads, reglas de decoración) y registrarla en `tracks/index.ts`;
   la misma definición en `backend/src/MichiRacer.Game/Sim/Tracks/` y en `Tracks.All`.
   Opcional: `sea` (lado del mar, orilla y puentes) y `landmarks` (objetos puntuales sin colisión).
2. Ambientación: un `TrackTheme` en `frontend/src/render/themes.ts` (paleta, cielo, sol, capas de fondo, objetos)
   y su arte en `frontend/public/assets/<pista>/`. Si falta una imagen se usa un placeholder procedural.
3. Regenerar los fixtures de paridad (`GOLDEN=1 npx vitest run src/sim/golden.test.ts`): el test de C# recorre todas las pistas.

## Tests

```bash
npm --prefix frontend test     # simulación: carrera completa, checkpoints, determinismo, derrape
dotnet test backend            # paridad C# ⇄ TypeScript tick a tick + salas, reconexión, 20 jugadores, rate limits
```

Si cambias la simulación en `frontend/src/sim`, aplica el mismo cambio en `backend/src/MichiRacer.Game/Sim`
y regenera el fixture de paridad:

```bash
cd frontend && GOLDEN=1 npx vitest run src/sim/golden.test.ts
```

## Protocolo (SignalR, `/hubs/race`)

| Cliente → Servidor | Servidor → Cliente |
| --- | --- |
| `JoinRoom(code, name)` → `{ playerId, token, room, race }` | `RoomState` |
| `RejoinRoom(code, playerId, token)` | `RaceStarted` (`racers`, `goTick`) |
| `SetReady`, `SelectColor`, `SetFillBots`, `SetGridSize` | `Snapshot` (20/s: `t`, `ph`, `r`, `me`, `ev`) |
| `StartRace` (solo el owner) | `Results` |
| `SendInput(seq, steer, buttons)` (fire-and-forget, 30/s) | errores como `HubException` |
| `Ping`, `ReportPing`, `LeaveRoom` | |

REST: `POST /api/rooms` (crear sala), `GET /api/rooms/{code}`, `GET /api/metrics`, `GET /api/health`.
