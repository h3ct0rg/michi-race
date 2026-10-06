namespace MichiRacer.Game.Sim;

public sealed record VehicleStats(int Speed, int Acceleration, int Handling, int Weight, int Braking, int Boost);

public sealed record VehicleParams(
    double MaxSpeed,
    double Accel,
    double Braking,
    double Decel,
    double Steer,
    double Centrifugal,
    double OffroadDecel,
    double OffroadLimit,
    double TurboTime,
    double TurboRecharge,
    double TurboMult,
    double Mass);

public sealed record VehicleDef(string Id, string Name, VehicleStats Stats);

public static class Vehicles
{
    public const int TickRate = 30;
    public const double Tick = 1.0 / TickRate;
    public const double BaseSpeed = Track.SegmentLength * 60;

    public static readonly IReadOnlyDictionary<string, VehicleDef> All = new Dictionary<string, VehicleDef>
    {
        ["michi"] = new("michi", "Michi Racer", new VehicleStats(Speed: 4, Acceleration: 3, Handling: 4, Weight: 2, Braking: 3, Boost: 3)),
    };

    public static VehicleParams Derive(VehicleStats s)
    {
        var maxSpeed = BaseSpeed * (0.8 + 0.05 * s.Speed);
        return new VehicleParams(
            MaxSpeed: maxSpeed,
            Accel: maxSpeed / (7 - s.Acceleration),
            Braking: maxSpeed * (0.6 + 0.15 * s.Braking),
            Decel: maxSpeed / 5,
            Steer: 1.4 + 0.15 * s.Handling,
            Centrifugal: 0.38 - 0.02 * s.Handling,
            OffroadDecel: maxSpeed * (0.6 - 0.05 * s.Weight),
            OffroadLimit: maxSpeed / 4,
            TurboTime: 1.2 + 0.15 * s.Boost,
            TurboRecharge: 6,
            TurboMult: 1.25 + 0.03 * s.Boost,
            Mass: 0.6 + 0.2 * s.Weight);
    }
}
