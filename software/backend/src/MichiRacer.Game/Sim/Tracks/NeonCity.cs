namespace MichiRacer.Game.Sim.Tracks;

/// <summary>Misma definición que frontend/src/sim/tracks/neonCity.ts.</summary>
public static class NeonCity
{
    private const int Short = 25, Medium = 50, Long = 100;
    private const double Easy = 2, Mid = 4, Hard = 6;

    public static readonly TrackDef Def = new(
        Id: "neon-city",
        Name: "Neon City",
        Laps: 3,
        Checkpoints: 8,
        Seed: 41,
        Roads:
        [
            new(Short, Short, Short, 0),
            // avenida del centro
            new(Medium, Long, Medium, 0),
            // esquina a la derecha
            new(Short, Short, Short, Hard),
            // paso elevado: subida, curva arriba y bajada
            new(Medium, Medium, Medium, 0),
            new(Medium, Medium, Medium, -Mid),
            new(Medium, Medium, Medium, 0),
            // esquina a la izquierda y chicana
            new(Short, Short, Short, -Hard),
            new(Short, Short, Short, Hard),
            new(Short, Short, Short, -Hard),
            // bulevar de neón
            new(Long, Long, Long, 0),
            new(Medium, Medium, Medium, Mid),
            // horquilla a la derecha
            new(Short, Medium, Short, Hard),
            new(Medium, Medium, Medium, -Easy),
            // recta de regreso a la meta
            new(Long, Medium, Long, 0),
        ],
        BoostPads:
        [
            new(150, 0),
            new(600, -0.4),
            new(1100, 0),
            new(1250, 0.5),
            new(1800, -0.4),
        ],
        ItemBoxes: [300, 880, 1400, 1850],
        Hazards: [new(350, -0.3, 3), new(700, 0.35, 1), new(1150, 0.3, 3), new(1600, 0, 3)],
        Decor: new DecorDef("lamp", "billboard", 0.65, [(80, 270), (1030, 1320)], "building", "barrier"));
}
