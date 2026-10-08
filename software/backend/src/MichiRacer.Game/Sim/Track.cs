namespace MichiRacer.Game.Sim;

/// <summary>Tramo de pista: [enter, hold, leave, curve, hill]. Hill no afecta la simulación.</summary>
public sealed record RoadPiece(int Enter, int Hold, int Leave, double Curve);

public sealed record BoostPadDef(int Segment, double X);

public sealed record HazardDef(int Segment, double X, int Kind);

/// <summary>Reglas de decoración; ver DecorDef en frontend/src/sim/track.ts.</summary>
public sealed record DecorDef(
    string Primary,
    string Secondary,
    double PrimaryRatio,
    IReadOnlyList<(int From, int To)> Clusters,
    string Cluster,
    string Scatter,
    IReadOnlyList<string>? Sea = null);

/// <summary>Mar a un costado (Side -1 izquierda, 1 derecha) desde Shore; en los puentes hay agua a ambos lados.</summary>
public sealed record SeaDef(int Side, double Shore, IReadOnlyList<(int From, int To)> Bridges, double BridgeShore);

public sealed record LandmarkDef(int Segment, string Kind, double Offset);

public sealed record TrackDef(
    string Id,
    string Name,
    int Laps,
    int Checkpoints,
    uint Seed,
    IReadOnlyList<RoadPiece> Roads,
    IReadOnlyList<BoostPadDef> BoostPads,
    IReadOnlyList<int> ItemBoxes,
    IReadOnlyList<HazardDef> Hazards,
    DecorDef Decor,
    SeaDef? Sea = null,
    IReadOnlyList<LandmarkDef>? Landmarks = null);

public sealed record RoadsideSprite(string Kind, double Offset, bool Collides);

public sealed class Segment(int index, double curve)
{
    public int Index { get; } = index;
    public double Curve { get; } = curve;
    public List<RoadsideSprite> Sprites { get; } = [];
    public double? Pad { get; set; }
    public (int Kind, double X)? Hazard { get; set; }
    public int? ItemRow { get; set; }
    public int? Checkpoint { get; set; }
    /// <summary>1 = agua a la izquierda, 2 = a la derecha, 3 = ambos (puente).</summary>
    public int Water { get; set; }
    public double Shore { get; set; }
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
    /// <summary>Posición s de cada fila de cajas de ítems.</summary>
    public List<double> ItemRows { get; } = [];

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
        for (var row = 0; row < def.ItemBoxes.Count; row++)
        {
            t.Segments[def.ItemBoxes[row] % n].ItemRow = row;
            t.ItemRows.Add(def.ItemBoxes[row] % n * SegmentLength);
        }
        foreach (var h in def.Hazards)
            for (var i = 0; i < Items.HazardLength; i++) t.Segments[(h.Segment + i) % n].Hazard = (h.Kind, h.X);

        // mar y puentes
        if (def.Sea is { } sea)
        {
            foreach (var seg in t.Segments)
            {
                seg.Water = sea.Side < 0 ? 1 : 2;
                seg.Shore = sea.Shore;
            }
            foreach (var (from, to) in sea.Bridges)
            {
                for (var i = from; i <= to && i < n; i++)
                {
                    t.Segments[i].Water = 3;
                    t.Segments[i].Shore = sea.BridgeShore;
                }
            }
        }

        // Decoración con semilla: mismo orden de llamadas al RNG que en TypeScript.
        var rng = new Rng(def.Seed);
        var d = def.Decor;
        // Coloca un objeto; si caería en el agua lo cambia por uno marino (o lo omite).
        void Place(int i, string kind, double offset, bool allowSea)
        {
            if (i < 0 || i >= n) return;
            var seg = t.Segments[i];
            var sideBit = offset < 0 ? 1 : 2;
            if ((seg.Water & sideBit) != 0 && Math.Abs(offset) > seg.Shore - 0.2)
            {
                if (!allowSea || d.Sea is null || d.Sea.Count == 0) return;
                t.AddSprite(i, d.Sea[i % d.Sea.Count], Math.Sign(offset) * (seg.Shore + 0.6 + Math.Abs(offset) * 0.5), collides: false);
                return;
            }
            t.AddSprite(i, kind, offset);
        }
        for (var i = 20; i < n - 10; i += 3 + (int)Math.Floor(rng.Next() * 4))
        {
            var side = rng.Next() < 0.5 ? -1 : 1;
            var kind = rng.Next() < d.PrimaryRatio ? d.Primary : d.Secondary;
            Place(i, kind, side * (1.5 + rng.Next() * 3), true);
        }
        foreach (var (from, to) in d.Clusters)
        {
            for (var i = from; i < to; i += 2)
            {
                Place(i, d.Cluster, -(1.4 + rng.Next() * 1.5), true);
                Place(i, d.Cluster, 1.4 + rng.Next() * 1.5, true);
            }
        }
        for (var i = 0; i < n - 90; i++)
        {
            var ahead = t.Segments[i + 80].Curve;
            var entering = t.Segments[i + 29].Curve == 0 && t.Segments[i + 30].Curve != 0;
            if (entering && Math.Abs(ahead) > 1.5)
            {
                var dir = ahead > 0 ? "right" : "left";
                for (var k = 0; k < 3; k++) Place(i + 10 + k * 8, $"sign-{dir}", ahead > 0 ? -1.25 : 1.25, false);
            }
        }
        for (var i = 30; i < n; i += 11)
        {
            if (rng.Next() < 0.5)
            {
                var sign = rng.Next() < 0.5 ? -1 : 1;
                Place(i, d.Scatter, sign * (1.3 + rng.Next() * 2), true);
            }
        }
        foreach (var lm in def.Landmarks ?? []) t.AddSprite(lm.Segment % n, lm.Kind, lm.Offset, collides: false);
        return t;
    }
}
