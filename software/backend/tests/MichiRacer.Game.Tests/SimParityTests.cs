using System.Text.Json;
using MichiRacer.Game.Sim;
using MichiRacer.Game.Sim.Tracks;

namespace MichiRacer.Game.Tests;

/// <summary>
/// Verifica que la simulación C# reproduce exactamente la de TypeScript usando el fixture
/// generado por frontend/src/sim/golden.test.ts (GOLDEN=1 npx vitest run src/sim/golden.test.ts).
/// </summary>
public class SimParityTests
{
    private static JsonElement Golden(string trackId) =>
        JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", $"golden-{trackId}.json"))).RootElement;

    private const double Tolerance = 1e-6;

    private static Input ScriptedInput(int t) => new(
        Steer: (t / 20 % 4 < 2 ? 1 : -1) * 0.6,
        Throttle: t % 200 < 180,
        Brake: false,
        Drift: t % 150 >= 60 && t % 150 < 110,
        UseItem: t % 90 == 0);

    [Fact]
    public void Rng_matches_typescript()
    {
        var rng = new Rng(12345);
        foreach (var expected in Golden(Tracks.Default).GetProperty("rng").EnumerateArray())
            Assert.Equal(expected.GetDouble(), rng.Next(), 15);
    }

    [Theory]
    [MemberData(nameof(TrackIds))]
    public void Track_build_matches_typescript(string trackId)
    {
        var track = Track.Build(Tracks.All[trackId]);
        var g = Golden(trackId).GetProperty("track");
        Assert.Equal(g.GetProperty("segments").GetInt32(), track.Segments.Count);
        Assert.Equal(g.GetProperty("checkpoints").EnumerateArray().Select(e => e.GetDouble()), track.CheckpointPositions);
        Assert.Equal(g.GetProperty("sprites").GetInt32(), track.Segments.Sum(s => s.Sprites.Count));
        var checksum = track.Segments.Sum(s => s.Sprites.Sum(sp => sp.Offset * (s.Index + 1)));
        Assert.Equal(g.GetProperty("spriteChecksum").GetDouble(), checksum, 6);
    }

    public static TheoryData<string> TrackIds => new(Tracks.All.Keys);

    [Theory]
    [MemberData(nameof(TrackIds))]
    public void Full_race_matches_typescript_tick_by_tick(string trackId)
    {
        var def = Tracks.All[trackId];
        var golden = Golden(trackId);
        var track = Track.Build(def);
        var vehicle = Vehicles.Derive(Vehicles.All["michi"].Stats);
        var racers = Enumerable.Range(0, 20).Select(i =>
        {
            var (distance, x) = Race.GridSlot(i);
            var r = new Racer($"r{i}", $"R{i}", vehicle, distance, x, def.Checkpoints);
            if (i > 0) r.Bot = new BotState { Skill = 0.8 + i * 0.006, Lane = x, LaneTimer = 1 };
            return r;
        }).ToList();
        var race = new Race(track, racers, 42);

        var samples = golden.GetProperty("samples").EnumerateArray().ToList();
        var every = golden.GetProperty("sampleEvery").GetInt32();
        var sample = 0;
        for (var t = 0; t < 4500 && race.Phase != RacePhase.Finished; t++)
        {
            race.Step(new Dictionary<string, Input> { ["r0"] = ScriptedInput(t) });
            if (t % every != 0) continue;

            var expected = samples[sample++].EnumerateArray().ToList();
            for (var i = 0; i < racers.Count; i++)
            {
                var e = expected[i].EnumerateArray().Select(v => v.GetDouble()).ToArray();
                var r = racers[i];
                AssertClose(e[0], r.Distance, $"tick {t} racer {i} distance");
                AssertClose(e[1], r.X, $"tick {t} racer {i} x");
                AssertClose(e[2], r.Speed, $"tick {t} racer {i} speed");
                Assert.Equal((int)e[3], r.Lap);
                Assert.Equal((int)e[4], r.NextCheckpoint);
            }
        }
        Assert.Equal(samples.Count, sample);

        var finish = golden.GetProperty("finish").EnumerateArray().ToList();
        for (var i = 0; i < racers.Count; i++)
        {
            if (finish[i].ValueKind == JsonValueKind.Null) Assert.Null(racers[i].FinishTime);
            else AssertClose(finish[i].GetDouble(), racers[i].FinishTime!.Value, $"finish {i}");
        }
    }

    private static void AssertClose(double expected, double actual, string what)
    {
        var scale = Math.Max(1, Math.Abs(expected));
        Assert.True(Math.Abs(expected - actual) <= Tolerance * scale, $"{what}: esperado {expected}, obtenido {actual}");
    }
}
