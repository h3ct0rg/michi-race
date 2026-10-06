namespace MichiRacer.Game.Sim;

/// <summary>Pilotos automáticos. Port de frontend/src/sim/bot.ts (mismo orden de llamadas al RNG).</summary>
public static class Bots
{
    private static readonly double[] Lanes = [-0.55, 0, 0.55];

    public static Input Decide(Racer r, Race race)
    {
        var rng = race.Rng;
        var bot = r.Bot ??= new BotState { Skill = 0.9, Lane = 0, LaneTimer = 0 };
        bot.LaneTimer -= Vehicles.Tick;
        if (bot.LaneTimer <= 0)
        {
            bot.Lane = Lanes[(int)Math.Floor(rng.Next() * Lanes.Length)];
            bot.LaneTimer = 3 + rng.Next() * 4;
        }
        foreach (var o in race.Racers)
        {
            var ahead = o.Distance - r.Distance;
            if (o != r && ahead > 0 && ahead < Track.SegmentLength * 8 && Math.Abs(o.X - r.X) < Physics.KartHalf * 2 && r.Speed > o.Speed)
            {
                bot.Lane = o.X > 0 ? o.X - 0.6 : o.X + 0.6;
                bot.LaneTimer = 2;
            }
        }
        var seg = race.Track.FindSegment(Physics.ZOf(r, race.Track));
        var target = Math.Max(-0.8, Math.Min(0.8, bot.Lane + seg.Curve * 0.06));
        return new Input(
            Steer: Math.Max(-1, Math.Min(1, (target - r.X) * 4)),
            Throttle: r.Speed < r.Vehicle.MaxSpeed * bot.Skill,
            Brake: false,
            Drift: false,
            Turbo: rng.Next() < 0.004);
    }
}
