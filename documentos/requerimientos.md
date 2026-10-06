# 🏎️ Multiplayer Pixel Racing

## Documento de Requerimientos y Descripción del Juego

**Versión:** 1.0
**Estado:** Diseño inicial
**Tipo:** Videojuego de carreras arcade multiplayer
**Plataforma:** Web
**Jugadores:** 1–20 por carrera
**Perspectiva:** 2.5D
**Estilo visual:** Pixel Art moderno, colorido y llamativo

---

# 1. Descripción general

**Multiplayer Pixel Racing** será un videojuego de carreras arcade multiplayer para navegador.

El juego combinará:

* 🏎️ Carreras arcade.
* 🌐 Multiplayer en tiempo real.
* 🎨 Pixel Art moderno.
* 🎮 Perspectiva 2.5D.
* 💥 Power-ups.
* 🗺️ Múltiples pistas.
* 🚗 Diferentes vehículos.
* 🏁 Carreras de hasta 20 jugadores.

El objetivo es crear una experiencia rápida, divertida y visualmente atractiva, donde los jugadores puedan entrar a una partida sin necesidad de crear una cuenta.

La experiencia deberá ser suficientemente sencilla para que cualquier jugador pueda entenderla en pocos segundos, pero tener suficiente profundidad para permitir que los jugadores mejoren sus habilidades.

---

# 2. Concepto principal

El jugador entra al juego desde un navegador.

No necesita crear una cuenta.

El flujo principal será:

```text
Entrar al juego
      ↓
Elegir nombre
      ↓
Crear sala / entrar mediante enlace
      ↓
Lobby
      ↓
Elegir vehículo
      ↓
Seleccionar pista
      ↓
Countdown
      ↓
🏁 CARRERA
      ↓
Vueltas + Power-ups
      ↓
🏆 Resultados
```

El creador de una sala podrá compartir un enlace con otros jugadores.

Por ejemplo:

```text
https://game.example.com/room/ABCD123
```

Los jugadores que accedan mediante ese enlace entrarán directamente a la sala.

---

# 3. Objetivo del proyecto

El objetivo inicial no será crear inmediatamente las 10 pistas ni soportar 20 jugadores.

La primera meta será conseguir una experiencia mínima pero completamente funcional:

> Dos jugadores entran mediante un enlace, ven sus vehículos, corren simultáneamente, se adelantan, utilizan power-ups y uno de ellos gana.

Si esa experiencia resulta divertida, el resto del juego podrá crecer alrededor de ella.

---

# 4. Decisión visual: 2.5D

## 4.1 ¿Qué significa 2.5D?

El juego utilizará una representación visual que combina elementos 2D con técnicas de perspectiva para generar una sensación de profundidad similar a un juego 3D.

No se pretende construir inicialmente un simulador 3D completo.

La pista y los vehículos podrán ser representados mediante sprites Pixel Art mientras que:

* El tamaño de los sprites cambiará según la profundidad.
* La carretera tendrá perspectiva.
* Los objetos podrán utilizar diferentes capas.
* Los escenarios tendrán parallax.
* Los efectos utilizarán profundidad visual.
* La cámara generará sensación de velocidad.

Conceptualmente:

```text
             🌄 🌄 🌄 🌄
          Montañas / Fondo

       🌲              🌲
          🌲        🌲

             ╲      ╱
              ╲    ╱
               ╲  ╱
                ╲╱
                🚗
              🚗 🚗
            🚗     🚗
          ╱           ╲
        ╱               ╲
      🛣️                 🛣️
```

La carretera se verá más ancha en la parte cercana al jugador y más estrecha hacia el horizonte.

---

# 5. ¿Por qué 2.5D?

La elección de 2.5D es intencional.

Permite obtener una apariencia visual atractiva sin asumir toda la complejidad de un juego 3D.

### Ventajas

* Menor complejidad de desarrollo.
* Menor consumo de recursos.
* Excelente rendimiento en navegador.
* Más sencillo producir assets.
* Más sencillo generar Pixel Art.
* Física más sencilla.
* Multiplayer más sencillo.
* Menor cantidad de datos que sincronizar.
* Permite crear muchas pistas rápidamente.
* Mantiene una estética diferenciada.

Además, el servidor puede utilizar una representación matemática relativamente sencilla mientras el cliente se encarga de convertirla en una escena visual atractiva.

---

# 6. Dirección artística

## 6.1 Pixel Art moderno

El juego utilizará **Pixel Art moderno**.

No se busca imitar exclusivamente los juegos de 8 o 16 bits.

La intención es crear un Pixel Art:

* Detallado.
* Colorido.
* Vibrante.
* Moderno.
* Fácil de reconocer.
* Con iluminación estilizada.
* Con animaciones fluidas.
* Con efectos visuales llamativos.

La referencia conceptual será:

> **Retro en estética, moderno en ejecución.**

---

# 7. Estilo visual

El juego deberá utilizar una dirección artística consistente.

Todos los siguientes elementos deberán pertenecer al mismo universo visual:

* Vehículos.
* Pistas.
* Obstáculos.
* Árboles.
* Edificios.
* Montañas.
* Power-ups.
* Explosiones.
* Humo.
* Fuego.
* Hielo.
* Partículas.
* HUD.
* Menús.
* Iconos.

---

# 8. Vehículos

Los jugadores podrán elegir diferentes vehículos.

Cada vehículo tendrá estadísticas diferentes.

### Estadísticas

```text
Speed
Acceleration
Handling
Weight
Braking
Boost
```

Ejemplo:

| Vehículo | Velocidad | Aceleración | Manejo |  Peso |
| -------- | --------: | ----------: | -----: | ----: |
| Racer    |     ⭐⭐⭐⭐⭐ |         ⭐⭐⭐ |   ⭐⭐⭐⭐ |    ⭐⭐ |
| Muscle   |      ⭐⭐⭐⭐ |       ⭐⭐⭐⭐⭐ |    ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Formula  |     ⭐⭐⭐⭐⭐ |        ⭐⭐⭐⭐ |  ⭐⭐⭐⭐⭐ |     ⭐ |
| Heavy    |       ⭐⭐⭐ |          ⭐⭐ |     ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Compact  |       ⭐⭐⭐ |       ⭐⭐⭐⭐⭐ |  ⭐⭐⭐⭐⭐ |     ⭐ |

Los valores definitivos deberán balancearse mediante pruebas.

---

# 9. Pistas

La primera versión completa tendrá como objetivo **10 pistas**.

Cada pista tendrá una identidad visual diferente.

## 9.1 Green Valley 🌲

Tema:

* Bosques.
* Montañas.
* Ríos.
* Praderas.
* Puentes.

Será una de las primeras pistas utilizadas para desarrollar el prototipo.

---

## 9.2 Desert Run 🏜️

Tema:

* Desierto.
* Dunas.
* Cañones.
* Rocas.
* Ruinas.

---

## 9.3 Coastal Road 🌊

Tema:

* Océano.
* Playas.
* Acantilados.
* Palmeras.
* Puertos.

---

## 9.4 Ice Mountain ❄️

Tema:

* Nieve.
* Glaciares.
* Montañas.
* Hielo.
* Tormentas de nieve.

---

## 9.5 Volcano 🌋

Tema:

* Lava.
* Volcanes.
* Ceniza.
* Rocas.
* Puentes peligrosos.

---

## 9.6 Castle Circuit 🏰

Tema:

* Castillos.
* Murallas.
* Torres.
* Puentes.
* Bosques medievales.

---

## 9.7 Jungle Rush 🌴

Tema:

* Jungla.
* Vegetación.
* Cascadas.
* Ruinas.
* Pantanos.

---

## 9.8 Neon City 🌆

Tema:

* Ciudad nocturna.
* Neón.
* Lluvia.
* Edificios.
* Anuncios luminosos.

---

## 9.9 Sky Road ☁️

Tema:

* Islas flotantes.
* Nubes.
* Carreteras suspendidas.
* Puentes aéreos.

---

## 9.10 Dark Realm 👹

Tema:

* Ruinas.
* Castillos.
* Niebla.
* Fuego.
* Ambientes sobrenaturales.

---

# 10. Power-ups

Los power-ups serán una parte importante del gameplay.

## Turbo ⚡

Incrementa temporalmente la velocidad del vehículo.

## Shield 🛡️

Protege al jugador contra determinados ataques.

## Bomb 💣

Permite lanzar una bomba que afecta a otros jugadores.

## Lightning ⚡

Afecta temporalmente a otros vehículos.

## Magnet 🧲

Atrae determinados objetos o power-ups.

## Freeze ❄️

Reduce temporalmente el rendimiento de otro jugador.

## Rocket 🚀

Permite realizar un ataque dirigido.

Los power-ups deberán ser fáciles de reconocer visualmente.

---

# 11. Gameplay

La carrera tendrá:

* Línea de salida.
* Countdown.
* Vueltas.
* Checkpoints.
* Posiciones.
* Power-ups.
* Obstáculos.
* Línea de meta.
* Resultados.

El gameplay deberá ser arcade y accesible.

No se pretende realizar una simulación realista de conducción.

---

# 12. Física

La física será deliberadamente sencilla.

Variables principales:

```text
speed
maxSpeed
acceleration
steering
friction
weight
boost
```

La física deberá priorizar:

1. Diversión.
2. Respuesta inmediata.
3. Facilidad de control.
4. Competitividad.
5. Estabilidad multiplayer.

---

# 13. Modelo de pista

Una pista podrá representarse internamente mediante:

```text
Track
 ├── Center Line / Spline
 ├── Track Width
 ├── Checkpoints
 ├── Start Position
 ├── Finish Line
 ├── Obstacles
 ├── Power-up Zones
 └── Special Zones
```

Esto permitirá separar:

**La lógica de la pista**

de

**La representación visual de la pista.**

---

# 14. Multiplayer

El juego soportará hasta:

> **20 jugadores por carrera.**

La primera implementación podrá comenzar con 2–4 jugadores para validar la arquitectura.

Posteriormente se realizará la optimización necesaria para llegar a 20.

---

# 15. Sistema de salas

No existirán cuentas de usuario en el MVP.

Un jugador podrá:

### Crear sala

```text
CREATE ROOM
      ↓
Room ID
      ↓
Share Link
```

### Entrar a sala

```text
Share Link
      ↓
Enter Name
      ↓
Join Room
```

---

# 16. Lobby

El lobby deberá mostrar:

```text
🏁 GREEN VALLEY

Players: 8/20

🚗 Gastón
🚗 Player2
🚗 SpeedDemon
🚗 TurboCat
🚗 Racer99
...

[ READY ]

[ START RACE ]
```

El owner podrá iniciar la carrera cuando se cumplan las condiciones necesarias.

---

# 17. Ownership

El creador de la sala será inicialmente el owner.

Si el owner abandona la sala antes de la carrera, el sistema podrá transferir el ownership al siguiente jugador elegible.

Esto permitirá evitar que una sala quede inutilizable por la desconexión de su creador.

---

# 18. Arquitectura multiplayer

Se utilizará una arquitectura:

> **Server Authoritative**

Conceptualmente:

```text
┌─────────────────────┐
│     PLAYER 1        │
│   Browser Client    │
└──────────┬──────────┘
           │
           │ WebSocket
           │
┌──────────▼─────────────────────┐
│          GAME SERVER            │
│                                │
│ Lobby                          │
│ Rooms                          │
│ Race State                     │
│ Physics                        │
│ Checkpoints                    │
│ Collisions                     │
│ Power-ups                      │
│ Players                        │
└──────────┬─────────────────────┘
           │
           ├───────────────┐
           │               │
     ┌─────▼─────┐   ┌─────▼─────┐
     │   Redis   │   │ Database  │
     └───────────┘   └───────────┘
```

---

# 19. Server Authoritative

El servidor será la autoridad sobre el estado real del juego.

El cliente enviará principalmente:

```text
INPUT
```

El servidor determinará:

```text
Position
Velocity
Rotation
Lap
Checkpoint
Collision
Item
Race Position
Finish
```

Esto evita que un cliente pueda simplemente decir:

```text
"I'm first!"
```

y que el servidor le crea. 😄

---

# 20. Comunicación

La comunicación utilizará WebSockets.

### Cliente → Servidor

```text
JOIN_ROOM
READY
INPUT
USE_ITEM
PING
LEAVE
```

### Servidor → Cliente

```text
ROOM_STATE
COUNTDOWN
SNAPSHOT
ITEM_EVENT
LAP_UPDATE
FINISH
RESULTS
ERROR
```

---

# 21. Input

Ejemplo conceptual:

```json
{
  "sequence": 1024,
  "accelerate": true,
  "brake": false,
  "steering": -0.35,
  "useItem": false
}
```

El servidor procesará estos inputs dentro de su simulación.

---

# 22. Snapshots

El servidor enviará snapshots periódicamente.

Ejemplo:

```json
{
  "tick": 4521,
  "players": [
    {
      "id": "player1",
      "x": 120,
      "y": 350,
      "rotation": 1.2,
      "velocity": 8.4,
      "lap": 2,
      "checkpoint": 5
    }
  ]
}
```

---

# 23. Client-side prediction

El vehículo del propio jugador deberá sentirse inmediato.

Para ello se podrá implementar:

* Client-side prediction.
* Server reconciliation.
* Interpolación de jugadores remotos.

Esto permitirá que otros vehículos se muevan de manera suave aunque los snapshots lleguen con una frecuencia menor al renderizado.

---

# 24. Renderizado

El cliente deberá renderizar idealmente a:

```text
60 FPS
```

Mientras que el servidor podrá funcionar aproximadamente a:

```text
20–30 ticks/s
```

El cliente interpolará los estados recibidos.

---

# 25. HUD

El HUD deberá ser minimalista pero informativo.

Ejemplo:

```text
┌────────────────────────────────────────────┐
│ GREEN VALLEY       LAP 2/3          4/20 │
│                                            │
│                                            │
│                  🚗                        │
│             🚗                             │
│                         🚗                 │
│                                            │
│                                            │
│                             ⚡ TURBO       │
└────────────────────────────────────────────┘
```

Podrá mostrar:

* Posición.
* Vueltas.
* Tiempo.
* Velocidad.
* Power-up.
* Mini mapa.
* Jugadores.

---

# 26. Efectos visuales

El juego deberá aprovechar al máximo el estilo Pixel Art.

Efectos previstos:

* 💨 Humo.
* ⚡ Turbo.
* 💥 Explosiones.
* 🔥 Fuego.
* ❄️ Hielo.
* ⚡ Rayos.
* 🌪️ Polvo.
* 🌧️ Lluvia.
* ❄️ Nieve.
* ✨ Partículas.
* 🛞 Derrapes.
* 💫 Impactos.

---

# 27. Parallax

El escenario utilizará múltiples capas.

Ejemplo:

```text
Layer 1 ─── Sky
Layer 2 ─── Mountains
Layer 3 ─── Trees
Layer 4 ─── Track Environment
Layer 5 ─── Road
Layer 6 ─── Vehicles
Layer 7 ─── Effects
Layer 8 ─── HUD
```

El movimiento relativo de estas capas ayudará a generar profundidad.

---

# 28. Audio

Se contemplará:

* Música.
* Motores.
* Derrapes.
* Turbo.
* Colisiones.
* Power-ups.
* Explosiones.
* Countdown.
* Victoria.
* Derrota.

Cada pista podrá tener música y ambiente propios.

---

# 29. MVP

El primer MVP deberá ser deliberadamente pequeño.

### MVP

* Navegador.
* Sin cuentas.
* Nombre del jugador.
* Crear sala.
* Join mediante enlace.
* 2–4 jugadores.
* Una pista.
* Un vehículo.
* Movimiento.
* Multiplayer.
* WebSockets.
* Server authoritative.
* Checkpoints.
* Vueltas.
* Finish.
* Ranking final.
* Pixel Art.
* Perspectiva 2.5D.

---

# 30. Roadmap

## Fase 1 — Prototipo visual

```text
2.5D
+
Pixel Art
+
1 vehículo
+
1 pista
```

Objetivo:

Validar que el estilo visual funciona.

---

## Fase 2 — Gameplay

Implementar:

* Movimiento.
* Física.
* Cámara.
* Checkpoints.
* Vueltas.
* Finish.

---

## Fase 3 — Multiplayer

Implementar:

* Rooms.
* WebSockets.
* Player synchronization.
* Server authoritative.
* 2–4 jugadores.

---

## Fase 4 — Escalabilidad

Llevar el sistema a:

> **20 jugadores simultáneos.**

Implementar:

* Interpolación.
* Prediction.
* Reconciliation.
* Optimización de red.
* Optimización de renderizado.

---

## Fase 5 — Gameplay avanzado

Implementar:

* Power-ups.
* Obstáculos.
* Colisiones.
* Turbo.
* Efectos.

---

## Fase 6 — Contenido

Implementar:

* 10 pistas.
* Múltiples vehículos.
* Nuevos power-ups.
* Nuevos ambientes.

---

## Fase 7 — Polish

Implementar:

* Animaciones.
* Sonido.
* Música.
* UI final.
* Efectos.
* Balance.
* Optimización.

---

# 31. Tecnología

La tecnología definitiva deberá decidirse después de un pequeño prototipo.

Opciones a evaluar:

### Phaser

Muy interesante para:

* Juegos web.
* 2D.
* Sprites.
* Animaciones.
* Pixel Art.
* Cámara.
* Input.

### PixiJS

Interesante para:

* Rendering.
* Alto rendimiento.
* Control personalizado.
* Arquitecturas propias.

### Three.js

Interesante si posteriormente decidimos acercarnos a un 3D real.

### Godot

Interesante si el proyecto evoluciona hacia un videojuego más tradicional y eventualmente multiplataforma.

---

# 32. Arquitectura lógica del cliente

```text
Client
│
├── Game
│   ├── GameState
│   ├── Race
│   └── Player
│
├── Rendering
│   ├── TrackRenderer
│   ├── VehicleRenderer
│   ├── EffectsRenderer
│   └── Camera
│
├── Input
│   ├── Keyboard
│   ├── Gamepad
│   └── Touch
│
├── Network
│   ├── WebSocket
│   ├── Prediction
│   └── Interpolation
│
├── UI
│   ├── Lobby
│   ├── HUD
│   └── Results
│
└── Audio
```

---

# 33. Arquitectura lógica del servidor

```text
Game Server
│
├── Lobby
├── Room Manager
├── Player Manager
├── Race Manager
├── Physics Engine
├── Collision System
├── Checkpoint System
├── PowerUp System
├── Ranking System
└── WebSocket Gateway
```

---

# 34. Persistencia

Durante una carrera no se deberá guardar constantemente el estado de cada frame en una base de datos.

El estado temporal podrá mantenerse en memoria.

Redis podrá utilizarse posteriormente para:

* Rooms.
* Presence.
* Coordinación.
* Matchmaking.
* Estado temporal.

La base de datos estará destinada principalmente a información persistente:

* Estadísticas.
* Ranking.
* Jugadores.
* Resultados.
* Configuración.
* Historial.

---

# 35. Seguridad y anti-cheat

El cliente no deberá poder modificar directamente:

* Velocidad.
* Posición.
* Vueltas.
* Checkpoints.
* Resultado.
* Inventario de power-ups.

El servidor deberá validar las acciones.

Se deberán detectar comportamientos como:

```text
Velocidad imposible
Movimiento imposible
Checkpoint saltado
Vuelta inválida
Uso imposible de power-up
```

---

# 36. Requisitos no funcionales

## Rendimiento

Objetivo:

```text
60 FPS
```

en dispositivos compatibles.

## Multiplayer

Objetivo:

```text
20 jugadores
```

por carrera.

## Latencia

La experiencia deberá mantenerse jugable con latencias normales de Internet.

## Compatibilidad

Objetivo inicial:

* Chrome.
* Edge.
* Firefox.
* Safari cuando sea viable.

## Instalación

No será necesaria instalación.

El juego deberá ejecutarse directamente desde el navegador.

---

# 37. Uso de IA en el desarrollo

La IA será considerada una herramienta central durante el desarrollo.

Podrá utilizarse para:

* Arquitectura.
* Código.
* Refactoring.
* Testing.
* Debugging.
* Diseño de gameplay.
* Balance.
* Documentación.
* Concept art.
* Pixel Art.
* Animaciones.
* Efectos.
* Audio.
* Generación de prompts.
* Diseño de niveles.

El objetivo será utilizar IA como un **equipo de desarrollo virtual**.

La validación final de gameplay y calidad deberá realizarse mediante pruebas reales.

---

# 38. Pipeline artístico

El pipeline podrá ser:

```text
Concepto
   ↓
Prompt
   ↓
Generación IA
   ↓
Pixel Art
   ↓
Corrección / edición
   ↓
Spritesheet
   ↓
Animación
   ↓
Integración
   ↓
Prueba en el juego
```

Se deberá mantener una guía visual para asegurar que los assets generados en diferentes momentos mantengan coherencia.

---

# 39. Principios de diseño

### Fácil de aprender

El jugador debe comprender los controles rápidamente.

### Difícil de dominar

Debe existir profundidad suficiente para mejorar.

### Rápido

Las partidas deberán tener una duración razonable.

### Divertido

El juego debe priorizar diversión sobre realismo.

### Caótico, pero justo

Los power-ups deben generar momentos inesperados sin convertir la carrera en puro azar.

### Visualmente memorable

El Pixel Art debe ser parte fundamental de la identidad.

### Multiplayer primero

La interacción entre jugadores será uno de los pilares del juego.

---

# 40. Definición de éxito

El proyecto podrá considerarse exitoso en su primera etapa cuando:

* Dos jugadores puedan entrar a la misma sala.
* Ambos puedan correr simultáneamente.
* Los vehículos estén correctamente sincronizados.
* La conducción se sienta fluida.
* La carrera tenga vueltas y checkpoints.
* El servidor determine correctamente el ganador.
* Los jugadores puedan terminar la carrera.
* La experiencia visual sea atractiva.
* La partida sea divertida.

---

# 41. Visión futura

Una vez consolidado el núcleo del juego, podrán incorporarse:

* Matchmaking.
* Ranking global.
* Leaderboards.
* Perfiles.
* Amigos.
* Equipos.
* Torneos.
* Espectadores.
* Replays.
* Personalización.
* Skins.
* Vehículos desbloqueables.
* Nuevos modos.
* Eventos temporales.
* Temporadas.
* Mobile.
* PWA.
* Aplicación de escritorio.

---

# 42. Visión final del producto

El objetivo es crear algo que pueda resumirse como:

> **"Un juego de carreras arcade multiplayer, rápido, caótico y divertido, con una estética Pixel Art moderna y una perspectiva 2.5D que haga que parezca mucho más complejo de lo que realmente es."**

La combinación:

```text
             🏎️
       MULTIPLAYER
             +
          🎨
       PIXEL ART
             +
          🧊
          2.5D
             +
          💥
       POWER-UPS
             +
          🌐
       WEB BROWSER
             =
       🏁 GAME
```

será la identidad principal del proyecto.

---

# 43. Primera meta técnica

Antes de construir el juego completo, el primer prototipo deberá demostrar:

```text
                 ┌───────────────┐
                 │   BROWSER     │
                 └───────┬───────┘
                         │
                    2.5D TRACK
                         │
                   🚗       🚗
                         │
                    WEBSOCKET
                         │
                 ┌───────▼───────┐
                 │ GAME SERVER   │
                 └───────────────┘
```

Con:

* 1 pista.
* 1 vehículo.
* 2 jugadores.
* Movimiento.
* Sincronización.
* Checkpoints.
* Vueltas.
* Finish.

Si esta versión es divertida, se continuará hacia **20 jugadores, power-ups y las 10 pistas**.

---

# 44. Prioridades del proyecto

El orden de prioridad será:

```text
1. 🎮 Diversión
2. 🌐 Multiplayer
3. 🏎️ Gameplay
4. 🎨 Identidad visual
5. ⚡ Rendimiento
6. 🗺️ Contenido
7. 🔊 Audio
8. 📊 Ranking
9. 📈 Escalabilidad
```

La regla principal será:

> **Primero hacemos que correr sea divertido. Después hacemos que el juego sea grande.**
