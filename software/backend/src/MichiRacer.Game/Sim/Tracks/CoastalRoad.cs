namespace MichiRacer.Game.Sim.Tracks;

/// <summary>Misma definición que frontend/src/sim/tracks/coastalRoad.ts.</summary>
public static class CoastalRoad
{
    private const int Short = 25, Medium = 50, Long = 100;
    private const double Easy = 2, Mid = 4, Hard = 6;

    public static readonly TrackDef Def = new(
        Id: "coastal-road",
        Name: "Coastal Road",
        Laps: 3,
        Checkpoints: 8,
        Seed: 57,
        Roads:
        [
            new(Short, Short, Short, 0),
            // recta de la playa
            new(Medium, Long, Medium, 0),
            // curva larga a la derecha bordeando la bahía
            new(Long, Long, Long, Easy),
            // subida al acantilado, curva arriba y bajada
            new(Medium, Medium, Medium, 0),
            new(Medium, Medium, Medium, Mid),
            new(Medium, Medium, Medium, 0),
            // puente sobre el mar
            new(Medium, Long, Medium, 0),
            // quiebre a la izquierda y curva cerrada a la derecha
            new(Short, Short, Short, -Mid),
            new(Medium, Medium, Medium, Hard),
            // recta del puerto (faro)
            new(Long, Medium, Long, 0),
            // curvas en S entre palmeras
            new(Medium, Short, Medium, -Easy),
            new(Medium, Short, Medium, Mid),
            // última curva a la derecha y regreso a la meta
            new(Medium, Medium, Medium, Mid),
            new(Long, Medium, Long, 0),
        ],
        BoostPads: [new(130, 0), new(1100, 0), new(1480, -0.4), new(2150, 0.3)],
        ItemBoxes: [320, 950, 1500, 2000],
        Hazards: [new(180, 0.3, 2), new(1550, 0.35, 1), new(1600, -0.3, 2)],
        Decor: new DecorDef("palm", "hut", 0.6, [(600, 860)], "palm", "rock", Sea: ["searock", "boat", "searock"]),
        Sea: new SeaDef(-1, 1.7, [(1030, 1220)], 1.2),
        Landmarks: [new(1460, "lighthouse", -2.6), new(300, "lighthouse", -6)]);
}
