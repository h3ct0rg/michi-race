namespace MichiRacer.Game.Sim.Tracks;

/// <summary>Misma definición que frontend/src/sim/tracks/greenValley.ts.</summary>
public static class GreenValley
{
    private const int Short = 25, Medium = 50, Long = 100;
    private const double Easy = 2, Mid = 4, Hard = 6;

    public static readonly TrackDef Def = new(
        Id: "green-valley",
        Name: "Green Valley",
        Laps: 3,
        Checkpoints: 8,
        Seed: 7,
        Roads:
        [
            new(Short, Short, Short, 0),
            new(Medium, Medium, Medium, Easy),
            new(Medium, Medium, Medium, 0),
            new(Medium, Medium, Medium, -Mid),
            // curvas en S
            new(Medium, Medium, Medium, -Easy),
            new(Medium, Medium, Medium, Mid),
            new(Medium, Medium, Medium, -Easy),
            // colinas
            new(Short, Short, Short, 0),
            new(Short, Short, Short, 0),
            new(Short, Short, Short, 0),
            new(Short, Short, Short, 0),
            new(Long, Long, Long, Mid),
            new(Medium, Medium, Medium, -Hard),
            new(Long, Long, Long, Easy),
            new(Medium, Medium, Medium, -Mid),
            // bajada final a la meta
            new(Long, Medium, Long, 0),
        ],
        BoostPads:
        [
            new(120, 0),
            new(420, -0.5),
            new(560, 0.5),
            new(1150, 0),
            new(1700, -0.4),
        ],
        Decor: new DecorDef("tree", "bush", 0.75, [(600, 780)], "tree", "rock"));

}
