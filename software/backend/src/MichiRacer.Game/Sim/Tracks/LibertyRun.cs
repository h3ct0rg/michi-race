namespace MichiRacer.Game.Sim.Tracks;

/// <summary>Misma definición que frontend/src/sim/tracks/libertyRun.ts.</summary>
public static class LibertyRun
{
    private const int Short = 25, Medium = 50, Long = 100;
    private const double Easy = 2, Mid = 4, Hard = 6;

    public static readonly TrackDef Def = new(
        Id: "liberty-run",
        Name: "Liberty Run",
        Laps: 3,
        Checkpoints: 8,
        Seed: 63,
        Roads:
        [
            new(Short, Short, Short, 0),
            // Quinta avenida
            new(Medium, Long, Medium, 0),
            // esquina a la derecha
            new(Short, Short, Short, Hard),
            new(Medium, Medium, Medium, 0),
            // bajada al puerto
            new(Medium, Medium, Medium, -Mid),
            // malecón con el mar a la izquierda
            new(Long, Long, Long, 0),
            new(Medium, Medium, Medium, -Easy),
            // puente junto a la isla de la estatua
            new(Medium, Long, Medium, 0),
            new(Medium, Medium, Medium, Mid),
            // regreso a la ciudad
            new(Long, Medium, Long, 0),
            // curvas en S de Downtown
            new(Medium, Short, Medium, -3),
            new(Medium, Short, Medium, 3),
            new(Medium, Medium, Medium, Mid),
            new(Long, Medium, Long, 0),
        ],
        BoostPads: [new(130, 0), new(700, 0.3), new(1150, 0), new(2150, -0.3)],
        ItemBoxes: [320, 900, 1500, 2000],
        Hazards: [new(400, 0.3, 1), new(1600, -0.3, 3), new(1880, 0.25, 3)],
        Decor: new DecorDef("nylamp", "taxi", 0.55, [(80, 280), (1720, 1940)], "tower", "hotdog", Sea: ["ferry", "boat", "ferry"]),
        Sea: new SeaDef(-1, 1.7, [(1110, 1290)], 1.2, [(650, 1480)]),
        Landmarks: [new(1200, "liberty", -2.4)]);
}
