namespace MichiRacer.Game.Sim.Tracks;

/// <summary>Misma definición que frontend/src/sim/tracks/cosmicRainbow.ts (con alturas para la física de pendientes).</summary>
public static class CosmicRainbow
{
    public static readonly TrackDef Def = new(
        Id: "cosmic-rainbow",
        Name: "Cosmic Rainbow",
        Laps: 3,
        Checkpoints: 8,
        Seed: 77,
        Roads:
        [
            new(25, 25, 25, 0, 0),
            // primera subida empinada y su bajada
            new(25, 50, 25, 0, 60),
            new(25, 50, 25, 0, -60),
            new(50, 50, 50, 4, 0),
            // subida a una horquilla en la cima y bajada
            new(25, 25, 25, 0, 50),
            new(25, 25, 25, -6, 0),
            new(25, 50, 25, 0, -50),
            // recta larga bajo los arcos de neón
            new(50, 100, 50, 0, 0),
            // la gran subida, meseta y caída en picada
            new(25, 50, 25, 0, 80),
            new(25, 25, 25, 0, 0),
            new(50, 25, 50, 0, -80),
            new(50, 50, 50, -4, 0),
            // eses que suben y bajan
            new(50, 25, 50, 4, 30),
            new(50, 25, 50, -4, -30),
            new(25, 50, 25, 0, 60),
            new(25, 50, 25, 0, -60),
            new(50, 50, 50, 6, 0),
            new(100, 50, 100, 0, 0),
        ],
        BoostPads: [new(180, 0), new(600, 0), new(720, -0.35), new(780, 0.35), new(1070, 0), new(1690, 0), new(2000, 0)],
        ItemBoxes: [300, 820, 1250, 1850],
        Hazards: [],
        Decor: new DecorDef("star", "star", 1, [], "star", "star", Sea: ["star", "star", "comet"]),
        Sea: new SeaDef(-1, 1.25, [(0, 9999)], 1.25),
        Landmarks:
        [
            new(700, "arch", 0), new(760, "arch", 0), new(820, "arch", 0),
            new(1000, "arch", 0), new(1990, "arch", 0), new(2080, "arch", 0),
        ],
        SlopePhysics: true);
}
