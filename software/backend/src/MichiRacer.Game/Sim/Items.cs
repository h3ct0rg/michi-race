namespace MichiRacer.Game.Sim;

/// <summary>Power-ups, cajas, proyectiles y obstáculos. Espejo de frontend/src/sim/items.ts.</summary>
public static class Items
{
    public const int None = 0, Turbo = 1, Shield = 2, Bomb = 3, Lightning = 4, Magnet = 5, Freeze = 6, Rocket = 7;

    public const double RollTime = 1.2;
    public const double ShieldTime = 8;
    public const double MagnetTime = 3;
    public const double TurboItemMult = 1.25;

    public static readonly double[] BoxLanes = [-0.55, 0, 0.55];
    public const double BoxRespawn = 2.5;
    public const double BoxHalf = 0.15;
    public const double MagnetBoxHalf = 0.55;

    public const int HitSpin = 1, HitShock = 2, HitFreeze = 3;
    public const double SpinTime = 1.2;
    public const double ShockTime = 2.5;
    public const double FreezeTime = 1.8;

    public const int HazardOil = 1, HazardSand = 2, HazardPuddle = 3;
    public const double HazardHalf = 0.25;
    public const int HazardLength = 6;
    public const double OilSpinTime = 0.9;

    public const int StateFlying = 0, StateArmed = 1, StateExploding = 2;
    public const double BombThrow = 300;
    public const double BombFlight = 0.5;
    public const double BombFuse = 4;
    public const double BombTriggerZ = 220;
    public const double BombTriggerX = 0.35;
    public const double BombBlastZ = 500;
    public const double BombBlastX = 0.7;
    public const double RocketLaunch = 250;
    public const double RocketSpeedMult = 1.6;
    public const double RocketLife = 6;
    public const double RocketTurn = 2.5;
    public const double RocketHitZ = 250;
    public const double RocketHitX = 0.35;
    public const double ExplosionTime = 0.5;

    private static readonly double[][] Odds =
    [
        // none turbo shield bomb lightning magnet freeze rocket
        [0, 2, 3, 3, 0, 1, 1, 0],
        [0, 3, 2, 2, 0.5, 2, 2, 2],
        [0, 4, 0, 0, 2, 2, 1, 3],
    ];

    /// <summary>Elige un ítem (roll ∈ [0,1) del RNG; rankFrac 0 = líder, 1 = último). Igual que rollItem en TS.</summary>
    public static int Roll(double roll, double rankFrac)
    {
        var odds = Odds[rankFrac < 0.25 ? 0 : rankFrac < 0.7 ? 1 : 2];
        double total = 0;
        foreach (var w in odds) total += w;
        var pick = roll * total;
        for (var i = 1; i < odds.Length; i++)
        {
            pick -= odds[i];
            if (pick < 0) return i;
        }
        return Turbo;
    }
}

public sealed class Projectile
{
    public int Id { get; init; }
    public int Kind { get; init; }
    public string Owner { get; init; } = "";
    public string? Target { get; init; }
    public double Distance { get; set; }
    public double X { get; set; }
    public double Speed { get; init; }
    public int State { get; set; }
    public double Timer { get; set; }
}
