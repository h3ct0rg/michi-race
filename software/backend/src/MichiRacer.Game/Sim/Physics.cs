namespace MichiRacer.Game.Sim;

public sealed class DriftState
{
    public bool Active { get; set; }
    public int Dir { get; set; }
    public double Charge { get; set; }
}

public sealed class BotState
{
    public double Skill { get; set; }
    public double Lane { get; set; }
    public double LaneTimer { get; set; }
}

/// <summary>Estado de un kart (port de Racer en frontend/src/sim/physics.ts).</summary>
public sealed class Racer(string id, string name, VehicleParams vehicle, double distance, double x, int checkpoints)
{
    public string Id { get; } = id;
    public string Name { get; } = name;
    public VehicleParams Vehicle { get; } = vehicle;
    public int Color { get; init; }

    public double Distance { get; set; } = distance;
    public double X { get; set; } = x;
    public double Vx { get; set; }
    public double Speed { get; set; }
    public double Steer { get; set; }
    public double Lean { get; set; }
    public double Turbo { get; set; } = 1;
    public double TurboLeft { get; set; }
    public double BoostLeft { get; set; }
    public DriftState Drift { get; } = new();
    public double LostTime { get; set; }
    public double Respawn { get; set; }
    public double Bump { get; set; } = 99;

    public int Lap { get; set; }
    public int NextCheckpoint { get; set; } = checkpoints;
    public double LapStart { get; set; }
    public List<double> LapTimes { get; } = [];
    public double? BestLap { get; set; }
    public double? FinishTime { get; set; }
    public int? Place { get; set; }

    public BotState? Bot { get; set; }
}

/// <summary>Física arcade. Port 1:1 de frontend/src/sim/physics.ts: mismo orden de operaciones.</summary>
public static class Physics
{
    public const double KartWorldWidth = 400;
    public const double KartHalf = KartWorldWidth / Track.RoadWidth / 2;
    private const double ObstacleHalf = 0.15;
    private const double DriftMinSpeed = 0.4;
    private const double DriftChargeBlue = 0.6;
    private const double DriftChargeOrange = 1.4;
    private const double RespawnAfter = 2.5;

    public static double WrapZ(double z, double len) => ((z % len) + len) % len;
    public static double ZOf(Racer r, Track track) => WrapZ(r.Distance, track.Length);

    private static double Clamp(double v, double lo, double hi) => Math.Max(lo, Math.Min(hi, v));

    public static void Step(Racer r, Input input, Track track, double dt)
    {
        var p = r.Vehicle;
        var seg = track.FindSegment(ZOf(r, track));
        var speedPct = r.Speed / p.MaxSpeed;
        var offroad = r.X < -1 || r.X > 1;
        var steerIn = Clamp(input.Steer, -1, 1);

        // --- turbo manual
        if (input.Turbo && r.Turbo >= 1 && r.TurboLeft <= 0)
        {
            r.TurboLeft = p.TurboTime;
            r.Turbo = 0;
        }

        // --- derrape
        var d = r.Drift;
        if (!d.Active && input.Drift && steerIn != 0 && speedPct > DriftMinSpeed && !offroad)
        {
            d.Active = true;
            d.Dir = Math.Sign(steerIn);
            d.Charge = 0;
        }
        else if (d.Active && (!input.Drift || speedPct < DriftMinSpeed * 0.75 || offroad))
        {
            if (!offroad)
            {
                if (d.Charge >= DriftChargeOrange) r.BoostLeft = Math.Max(r.BoostLeft, 1.0);
                else if (d.Charge >= DriftChargeBlue) r.BoostLeft = Math.Max(r.BoostLeft, 0.5);
            }
            d.Active = false;
            d.Charge = 0;
        }

        var steer = steerIn;
        var centrifugal = p.Centrifugal;
        if (d.Active)
        {
            var toward = Clamp(steerIn * d.Dir, -1, 1);
            steer = d.Dir * (0.75 + 0.35 * toward);
            centrifugal *= 0.5;
            d.Charge += dt * (1 + 0.5 * Math.Max(0, toward));
        }
        r.Steer = steer;
        r.Lean += ((d.Active ? d.Dir * 1.2 : steer) - r.Lean) * Math.Min(1, dt * 6);

        // --- pads de turbo
        if (seg.Pad is { } pad && !offroad && Math.Abs(r.X - pad) < Track.PadHalf + KartHalf * 0.5)
            r.BoostLeft = Math.Max(r.BoostLeft, 0.8);

        // --- movimiento lateral
        var dx = dt * p.Steer * speedPct;
        r.X += steer * dx;
        r.X -= dx * speedPct * seg.Curve * centrifugal;
        r.X += r.Vx * dt;
        r.Vx *= Math.Max(0, 1 - dt * 6);

        // --- velocidad
        var boosting = r.TurboLeft > 0 || r.BoostLeft > 0;
        var maxSpeed = boosting ? p.MaxSpeed * p.TurboMult : p.MaxSpeed;
        if (boosting) r.Speed += p.Accel * 2 * dt;
        else if (input.Throttle) r.Speed += p.Accel * dt;
        else if (input.Brake) r.Speed -= p.Braking * dt;
        else r.Speed -= p.Decel * dt;
        if (offroad && r.Speed > p.OffroadLimit) r.Speed -= p.OffroadDecel * dt;
        if (r.Speed > maxSpeed) r.Speed = Math.Max(maxSpeed, r.Speed - p.Decel * 2 * dt);
        r.Speed = Math.Max(0, r.Speed);

        // --- timers
        r.TurboLeft = Math.Max(0, r.TurboLeft - dt);
        r.BoostLeft = Math.Max(0, r.BoostLeft - dt);
        if (r.TurboLeft <= 0) r.Turbo = Math.Min(1, r.Turbo + dt / p.TurboRecharge);
        r.Respawn = Math.Max(0, r.Respawn - dt);
        r.Bump += dt;

        // --- avance revisando cada segmento recorrido
        var from = r.Distance;
        r.Distance += r.Speed * dt;
        if (r.X < -1 || r.X > 1)
        {
            for (var s = from; s <= r.Distance; s += Track.SegmentLength)
                if (HitObstacle(r, track.FindSegment(WrapZ(s, track.Length)))) break;
        }

        // --- perdido lejos de la pista
        if (Math.Abs(r.X) > 2.2)
        {
            r.LostTime += dt;
            if (r.LostTime > RespawnAfter)
            {
                r.X = 0;
                r.Vx = 0;
                r.Speed = 0;
                r.LostTime = 0;
                r.Respawn = 1.5;
            }
        }
        else
        {
            r.LostTime = 0;
        }
        r.X = Clamp(r.X, -3, 3);
    }

    private static bool HitObstacle(Racer r, Segment seg)
    {
        foreach (var s in seg.Sprites)
        {
            if (s.Collides && Math.Abs(s.Offset - r.X) < KartHalf + ObstacleHalf)
            {
                r.Speed *= 0.25;
                r.Vx = -Math.Sign(r.X) * 2;
                r.Drift.Active = false;
                r.Bump = 0;
                return true;
            }
        }
        return false;
    }

    /// <summary>Broad-phase por distancia; mismo orden de pares que collideAll en TypeScript.</summary>
    public static void CollideAll(List<Racer> racers)
    {
        var order = Enumerable.Range(0, racers.Count).ToList();
        order.Sort((a, b) =>
        {
            var c = racers[a].Distance.CompareTo(racers[b].Distance);
            return c != 0 ? c : a.CompareTo(b);
        });
        for (var i = 0; i < order.Count; i++)
        {
            var a = racers[order[i]];
            for (var j = i + 1; j < order.Count; j++)
            {
                var b = racers[order[j]];
                if (b.Distance - a.Distance > Track.SegmentLength * 1.2) break;
                CollideKarts(a, b);
            }
        }
    }

    public static void CollideKarts(Racer a, Racer b)
    {
        if (a.Respawn > 0 || b.Respawn > 0) return;
        var dz = a.Distance - b.Distance;
        if (Math.Abs(dz) > Track.SegmentLength * 1.2 || Math.Abs(a.X - b.X) > KartHalf * 1.6) return;
        var (back, front) = dz < 0 ? (a, b) : (b, a);
        if (back.Speed > front.Speed) back.Speed = front.Speed * 0.92;
        var side = a.X < b.X ? -1 : 1;
        var total = a.Vehicle.Mass + b.Vehicle.Mass;
        a.Vx = side * 1.6 * (b.Vehicle.Mass / total);
        b.Vx = -side * 1.6 * (a.Vehicle.Mass / total);
        a.Bump = 0;
        b.Bump = 0;
    }
}
