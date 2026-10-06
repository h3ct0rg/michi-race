namespace MichiRacer.Game.Sim;

public enum RacePhase { Countdown, Racing, Finished }

/// <summary>Eventos de carrera (LAP_UPDATE, FINISH...). Type: go | checkpoint | lap | finish | end.</summary>
public sealed record RaceEvent(string Type, string? Id = null, int? Value = null, double? Time = null);

/// <summary>Estado autoritativo de una carrera. Port de frontend/src/sim/race.ts.</summary>
public sealed class Race
{
    public const double CountdownSeconds = 3;
    private const double EndAfterFirst = 25;

    public Track Track { get; }
    public List<Racer> Racers { get; }
    public Rng Rng { get; }
    public int Tick { get; private set; }
    public double Time { get; private set; }
    public double Countdown { get; set; } = CountdownSeconds;
    public RacePhase Phase { get; private set; } = RacePhase.Countdown;

    private readonly List<RaceEvent> _events = [];
    private double? _firstFinish;

    public Race(Track track, List<Racer> racers, uint seed)
    {
        Track = track;
        Racers = racers;
        Rng = new Rng(seed);
    }

    /// <summary>Avanza un tick. Los humanos usan su input; los bots deciden solos.</summary>
    public void Step(IReadOnlyDictionary<string, Input> inputs)
    {
        Tick++;
        if (Phase == RacePhase.Countdown)
        {
            Countdown -= Vehicles.Tick;
            if (Countdown <= 0)
            {
                Phase = RacePhase.Racing;
                _events.Add(new RaceEvent("go"));
            }
            return;
        }

        Time += Vehicles.Tick;
        foreach (var r in Racers)
        {
            var human = r.Bot is null && r.FinishTime is null;
            var input = human ? inputs.GetValueOrDefault(r.Id, Input.None) : Bots.Decide(r, this);
            var before = Physics.ZOf(r, Track);
            Physics.Step(r, input, Track, Vehicles.Tick);
            CheckProgress(r, before, Physics.ZOf(r, Track));
        }
        Physics.CollideAll(Racers);

        if (Phase == RacePhase.Racing)
        {
            var allDone = Racers.TrueForAll(r => r.FinishTime is not null);
            var timeout = _firstFinish is { } first && Time - first > EndAfterFirst;
            if (allDone || timeout)
            {
                Phase = RacePhase.Finished;
                _events.Add(new RaceEvent("end"));
            }
        }
    }

    private void CheckProgress(Racer r, double before, double after)
    {
        if (r.FinishTime is not null) return;
        var len = Track.Length;
        var total = Track.Def.Checkpoints;
        bool Crossed(double s) => after >= before ? before < s && s <= after : before < s || s <= after;

        if (r.NextCheckpoint < total && Crossed(Track.CheckpointPositions[r.NextCheckpoint - 1]))
        {
            _events.Add(new RaceEvent("checkpoint", r.Id, r.NextCheckpoint));
            r.NextCheckpoint++;
        }

        var wrapped = after < before && before - after > len / 2;
        if (wrapped && r.NextCheckpoint == total)
        {
            if (r.Lap > 0)
            {
                var lapTime = Time - r.LapStart;
                r.LapTimes.Add(lapTime);
                r.BestLap = r.BestLap is { } best ? Math.Min(best, lapTime) : lapTime;
            }
            r.LapStart = Time;
            r.NextCheckpoint = 1;
            if (r.Lap == Track.Laps && r.FinishTime is null)
            {
                r.FinishTime = Time;
                r.Place = Racers.Count(o => o.FinishTime is not null);
                _firstFinish ??= Time;
                _events.Add(new RaceEvent("finish", r.Id, r.Place, Time));
            }
            else if (r.FinishTime is null)
            {
                r.Lap++;
                _events.Add(new RaceEvent("lap", r.Id, r.Lap, Time));
            }
        }
    }

    public double Progress(Racer r) =>
        (r.Lap * Track.Def.Checkpoints + r.NextCheckpoint) * Track.Length * 2 + Physics.ZOf(r, Track);

    public List<Racer> Ranking()
    {
        var list = new List<Racer>(Racers);
        list.Sort((a, b) =>
        {
            if (a.FinishTime is { } fa && b.FinishTime is { } fb) return fa.CompareTo(fb);
            if (a.FinishTime is not null) return -1;
            if (b.FinishTime is not null) return 1;
            return Progress(b).CompareTo(Progress(a));
        });
        return list;
    }

    /// <summary>Saca a un piloto que se desconectó a mitad de carrera.</summary>
    public void Remove(string id) => Racers.RemoveAll(r => r.Id == id);

    public List<RaceEvent> DrainEvents()
    {
        var e = new List<RaceEvent>(_events);
        _events.Clear();
        return e;
    }

    /// <summary>Parrilla de 2 columnas detrás de la línea de salida.</summary>
    public static (double Distance, double X) GridSlot(int slot) =>
        (-(slot / 2 * 6 + 4) * Track.SegmentLength, slot % 2 == 0 ? -0.4 : 0.4);
}
