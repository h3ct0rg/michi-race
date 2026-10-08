namespace MichiRacer.Game.Sim;

public enum RacePhase { Countdown, Racing, Finished }

/// <summary>
/// Eventos de carrera. Type: go | checkpoint | lap | finish | item (Value = ítem) | use (Value = ítem)
/// | hit (Value = tipo de golpe) | blocked | end.
/// </summary>
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

    /// <summary>Momento (Time) en que cada caja vuelve a estar disponible; índice = fila * 3 + carril.</summary>
    public double[] BoxRespawn { get; }
    public List<Projectile> Projectiles { get; } = [];
    private int _nextProjectileId = 1;

    private readonly List<RaceEvent> _events = [];
    private double? _firstFinish;

    public Race(Track track, List<Racer> racers, uint seed)
    {
        Track = track;
        Racers = racers;
        Rng = new Rng(seed);
        BoxRespawn = new double[track.ItemRows.Count * Items.BoxLanes.Length];
    }

    public bool BoxActive(int index) => Time >= BoxRespawn[index];

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
            var after = Physics.ZOf(r, Track);
            CheckProgress(r, before, after);
            PickBoxes(r, before, after);
            if (r.PendingUse != Items.None) ResolveUse(r);
        }
        UpdateProjectiles(Vehicles.Tick);
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

    private static bool CrossedS(double before, double after, double s) =>
        after >= before ? before < s && s <= after : before < s || s <= after;

    // ------------------------------------------------------------------ ítems (port de race.ts)

    private void PickBoxes(Racer r, double before, double after)
    {
        var rows = Track.ItemRows;
        for (var row = 0; row < rows.Count; row++)
        {
            if (!CrossedS(before, after, rows[row])) continue;
            var reach = Physics.KartHalf + (r.MagnetLeft > 0 ? Items.MagnetBoxHalf : Items.BoxHalf);
            for (var lane = 0; lane < Items.BoxLanes.Length; lane++)
            {
                var idx = row * Items.BoxLanes.Length + lane;
                if (Time < BoxRespawn[idx] || Math.Abs(r.X - Items.BoxLanes[lane]) >= reach) continue;
                BoxRespawn[idx] = Time + Items.BoxRespawn;
                if (r.Item == Items.None && r.ItemRoll <= 0)
                {
                    var ahead = 0;
                    foreach (var o in Racers)
                        if (o != r && o.Distance > r.Distance) ahead++;
                    var frac = Racers.Count > 1 ? (double)ahead / (Racers.Count - 1) : 0;
                    r.Item = Items.Roll(Rng.Next(), frac);
                    r.ItemRoll = Items.RollTime;
                    _events.Add(new RaceEvent("item", r.Id, r.Item));
                }
            }
        }
    }

    private Racer? RacerAhead(Racer r)
    {
        Racer? best = null;
        foreach (var o in Racers)
        {
            if (o == r || o.FinishTime is not null || o.Distance <= r.Distance) continue;
            if (best is null || o.Distance < best.Distance) best = o;
        }
        return best;
    }

    private void ResolveUse(Racer r)
    {
        var item = r.PendingUse;
        r.PendingUse = Items.None;
        _events.Add(new RaceEvent("use", r.Id, item));
        if (item == Items.Bomb)
        {
            Projectiles.Add(new Projectile
            {
                Id = _nextProjectileId++,
                Kind = Items.Bomb,
                Owner = r.Id,
                Distance = r.Distance + Items.BombThrow,
                X = r.X,
                Speed = r.Speed + 3000,
                State = Items.StateFlying,
                Timer = Items.BombFlight,
            });
        }
        else if (item == Items.Rocket)
        {
            var target = RacerAhead(r);
            Projectiles.Add(new Projectile
            {
                Id = _nextProjectileId++,
                Kind = Items.Rocket,
                Owner = r.Id,
                Target = target?.Id,
                Distance = r.Distance + Items.RocketLaunch,
                X = r.X,
                Speed = r.Vehicle.MaxSpeed * Items.RocketSpeedMult,
                State = Items.StateFlying,
                Timer = Items.RocketLife,
            });
        }
        else if (item == Items.Lightning)
        {
            foreach (var o in Racers)
                if (o != r && o.FinishTime is null && o.Distance > r.Distance) Hit(o, Items.HitShock);
        }
        else if (item == Items.Freeze)
        {
            if (RacerAhead(r) is { } target) Hit(target, Items.HitFreeze);
        }
    }

    private void Hit(Racer t, int kind)
    {
        if (t.Respawn > 0) return;
        if (t.ShieldLeft > 0)
        {
            t.ShieldLeft = 0;
            _events.Add(new RaceEvent("blocked", t.Id));
            return;
        }
        if (kind == Items.HitSpin)
        {
            t.SpinLeft = Items.SpinTime;
            t.Speed *= 0.5;
            t.Drift.Active = false;
            t.Bump = 0;
        }
        else if (kind == Items.HitShock)
        {
            t.ShockLeft = Items.ShockTime;
            t.Speed *= 0.6;
        }
        else if (kind == Items.HitFreeze)
        {
            t.FrozenLeft = Items.FreezeTime;
            t.Speed *= 0.5;
            t.Drift.Active = false;
        }
        _events.Add(new RaceEvent("hit", t.Id, kind));
    }

    private void Explode(Projectile p, bool blast)
    {
        p.State = Items.StateExploding;
        p.Timer = Items.ExplosionTime;
        if (!blast) return;
        foreach (var o in Racers)
            if (Math.Abs(o.Distance - p.Distance) < Items.BombBlastZ && Math.Abs(o.X - p.X) < Items.BombBlastX) Hit(o, Items.HitSpin);
    }

    private void UpdateProjectiles(double dt)
    {
        foreach (var p in Projectiles)
        {
            if (p.State == Items.StateExploding)
            {
                p.Timer -= dt;
            }
            else if (p.Kind == Items.Bomb)
            {
                if (p.State == Items.StateFlying)
                {
                    p.Distance += p.Speed * dt;
                    p.Timer -= dt;
                    if (p.Timer <= 0)
                    {
                        p.State = Items.StateArmed;
                        p.Timer = Items.BombFuse;
                    }
                }
                else
                {
                    p.Timer -= dt;
                    var touched = false;
                    foreach (var o in Racers)
                        if (o.Respawn <= 0 && Math.Abs(o.Distance - p.Distance) < Items.BombTriggerZ && Math.Abs(o.X - p.X) < Items.BombTriggerX) touched = true;
                    if (touched || p.Timer <= 0) Explode(p, true);
                }
            }
            else
            {
                p.Distance += p.Speed * dt;
                p.Timer -= dt;
                var target = p.Target is null ? null : Racers.Find(o => o.Id == p.Target);
                if (target is not null)
                {
                    p.X += Math.Max(-Items.RocketTurn * dt, Math.Min(Items.RocketTurn * dt, target.X - p.X));
                    if (Math.Abs(target.Distance - p.Distance) < Items.RocketHitZ && Math.Abs(target.X - p.X) < Items.RocketHitX)
                    {
                        Hit(target, Items.HitSpin);
                        Explode(p, false);
                        continue;
                    }
                }
                if (p.Timer <= 0) Explode(p, false);
            }
        }
        Projectiles.RemoveAll(p => p.State == Items.StateExploding && p.Timer <= 0);
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
