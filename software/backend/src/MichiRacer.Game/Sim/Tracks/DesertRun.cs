namespace MichiRacer.Game.Sim.Tracks;

/// <summary>Misma definición que frontend/src/sim/tracks/desertRun.ts.</summary>
public static class DesertRun
{
    private const int Short = 25, Medium = 50, Long = 100;
    private const double Easy = 2, Mid = 4, Hard = 6;

    public static readonly TrackDef Def = new(
        Id: "desert-run",
        Name: "Desert Run",
        Laps: 3,
        Checkpoints: 8,
        Seed: 23,
        Roads:
        [
            new(Short, Short, Short, 0),
            // gran curva rápida a la derecha
            new(Long, Long, Long, Easy),
            // dunas grandes
            new(Medium, Medium, Medium, 0),
            new(Medium, Medium, Medium, 0),
            new(Medium, Medium, Medium, 0),
            new(Medium, Medium, Medium, 0),
            // cañón: curvas en S cerradas
            new(Medium, Short, Medium, -Hard),
            new(Medium, Short, Medium, Hard),
            new(Medium, Short, Medium, -Mid),
            // recta larga en bajada
            new(Long, Long, Long, 0),
            // horquilla a la derecha
            new(Medium, Medium, Medium, Hard),
            // barrida larga a la izquierda
            new(Long, Medium, Long, -Easy),
            // saltitos finales
            new(Short, Short, Short, 0),
            new(Short, Short, Short, 0),
            // regreso a la altura de la meta
            new(Medium, Medium, Medium, 0),
        ],
        BoostPads:
        [
            new(200, 0),
            new(450, -0.5),
            new(1400, 0),
            new(1500, 0.5),
            new(1900, -0.4),
        ],
        Decor: new DecorDef("cactus", "drybush", 0.6, [(990, 1340)], "canyonrock", "ruin"));
}

/// <summary>Registro de pistas (espejo de TRACKS en frontend/src/sim/tracks/index.ts).</summary>
public static class Tracks
{
    public const string Default = "green-valley";

    public static readonly IReadOnlyDictionary<string, TrackDef> All = new Dictionary<string, TrackDef>
    {
        [GreenValley.Def.Id] = GreenValley.Def,
        [DesertRun.Def.Id] = DesertRun.Def,
    };
}
