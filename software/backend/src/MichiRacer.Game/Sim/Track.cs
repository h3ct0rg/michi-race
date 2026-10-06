namespace MichiRacer.Game.Sim;

/// <summary>Tramo de pista: [enter, hold, leave, curve, hill]. Hill no afecta la simulación.</summary>
public sealed record RoadPiece(int Enter, int Hold, int Leave, double Curve);

public sealed record BoostPadDef(int Segment, double X);

/// <summary>Reglas de decoración; ver DecorDef en frontend/src/sim/track.ts.</summary>
public sealed record DecorDef(
    string Primary,
    string Secondary,
    double PrimaryRatio,
    IReadOnlyList<(int From, int To)> Clusters,
    string Cluster,
    string Scatter);

public sealed record TrackDef(
    string Id,
    string Name,
    int Laps,
    int Checkpoints,
    uint Seed,
    IReadOnlyList<RoadPiece> Roads,
    IReadOnlyList<BoostPadDef> BoostPads,
    DecorDef Decor);

public sealed record RoadsideSprite(string Kind, double Offset, bool Collides);

public sealed class Segment(int index, double curve)
{
    public int Index { get; } = index;
    public double Curve { get; } = curve;
    public List<RoadsideSprite> Sprites { get; } = [];
    public double? Pad { get; set; }
    public int? Checkpoint { get; set; }
}

/// <summary>Port de frontend/src/sim/track.ts (solo la parte que usa la simulación).</summary>
public sealed class Track
{
    public const double SegmentLength = 200;
    public const double RoadWidth = 1500;
    public const int PadLength = 4;
    public const double PadHalf = 0.3;

    public TrackDef Def { get; }
    public List<Segment> Segments { get; } = [];
    /// <summary>Posición s de cada checkpoint intermedio; la meta es s = 0.</summary>
    public List<double> CheckpointPositions { get; } = [];

    public double Length => Segments.Count * SegmentLength;
    public int Laps => Def.Laps;

    private Track(TrackDef def) => Def = def;

    public Segment FindSegment(double z)
    {
        var n = Segments.Count;
        var i = (int)Math.Floor(z / SegmentLength) % n;
        return Segments[(i + n) % n];
    }

    private static double EaseIn(double a, double b, double p) => a + (b - a) * p * p;
    private static double EaseInOut(double a, double b, double p) => a + (b - a) * (-Math.Cos(p * Math.PI) / 2 + 0.5);

    private void AddSegment(double curve) => Segments.Add(new Segment(Segments.Count, curve));

    private void AddRoad(int enter, int hold, int leave, double curve)
    {
        for (var n = 0; n < enter; n++) AddSegment(EaseIn(0, curve, (double)n / enter));
        for (var n = 0; n < hold; n++) AddSegment(curve);
        for (var n = 0; n < leave; n++) AddSegment(EaseInOut(curve, 0, (double)n / leave));
    }

    private void AddSprite(int index, string kind, double offset, bool collides = true)
    {
        if (index >= 0 && index < Segments.Count) Segments[index].Sprites.Add(new RoadsideSprite(kind, offset, collides));
    }

    public static Track Build(TrackDef def)
    {
        var t = new Track(def);
        foreach (var r in def.Roads) t.AddRoad(r.Enter, r.Hold, r.Leave, r.Curve);
        var n = t.Segments.Count;

        t.AddSprite(8, "banner", 0, collides: false);

        for (var k = 1; k < def.Checkpoints; k++)
        {
            var seg = (int)Math.Floor((double)k * n / def.Checkpoints + 0.5); // = Math.round de JS
            t.Segments[seg].Checkpoint = k;
            t.CheckpointPositions.Add(seg * SegmentLength);
        }

        foreach (var pad in def.BoostPads)
            for (var i = 0; i < PadLength; i++) t.Segments[(pad.Segment + i) % n].Pad = pad.X;

        // Decoración con semilla: mismo orden de llamadas al RNG que en TypeScript.
        var rng = new Rng(def.Seed);
        var d = def.Decor;
        for (var i = 20; i < n - 10; i += 3 + (int)Math.Floor(rng.Next() * 4))
        {
            var side = rng.Next() < 0.5 ? -1 : 1;
            var kind = rng.Next() < d.PrimaryRatio ? d.Primary : d.Secondary;
            t.AddSprite(i, kind, side * (1.5 + rng.Next() * 3));
        }
        foreach (var (from, to) in d.Clusters)
        {
            for (var i = from; i < to; i += 2)
            {
                t.AddSprite(i, d.Cluster, -(1.4 + rng.Next() * 1.5));
                t.AddSprite(i, d.Cluster, 1.4 + rng.Next() * 1.5);
            }
        }
        for (var i = 0; i < n - 90; i++)
        {
            var ahead = t.Segments[i + 80].Curve;
            var entering = t.Segments[i + 29].Curve == 0 && t.Segments[i + 30].Curve != 0;
            if (entering && Math.Abs(ahead) > 1.5)
            {
                var dir = ahead > 0 ? "right" : "left";
                for (var k = 0; k < 3; k++) t.AddSprite(i + 10 + k * 8, $"sign-{dir}", ahead > 0 ? -1.25 : 1.25);
            }
        }
        for (var i = 30; i < n; i += 11)
        {
            if (rng.Next() < 0.5)
            {
                var sign = rng.Next() < 0.5 ? -1 : 1;
                t.AddSprite(i, d.Scatter, sign * (1.3 + rng.Next() * 2));
            }
        }
        return t;
    }
}
