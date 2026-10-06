using System.Diagnostics;
using MessagePack;
using MessagePack.Resolvers;
using MichiRacer.Game.Rooms;

namespace MichiRacer.Server;

/// <summary>Métricas del servidor de juego (expuestas en GET /api/metrics).</summary>
public sealed class ServerMetrics
{
    // Mismo resolver que usa el protocolo MessagePack de SignalR (contractless: mapas con nombres de propiedad).
    private static readonly MessagePackSerializerOptions Options = MessagePackSerializerOptions.Standard.WithResolver(ContractlessStandardResolver.Instance);

    private readonly object _gate = new();
    private readonly Stopwatch _window = Stopwatch.StartNew();
    private double _tickMsSum, _tickMsMax;
    private int _tickCount, _snapshotsSent, _inputs;
    private int _lastSnapshotBytes, _lastSnapshotRacers;
    private Snapshot _published = new(0, 0, 0, 0, 0, 0, 0, 0);

    public record Snapshot(double TickMsAvg, double TickMsMax, double TickBudgetMs, int SnapshotBytes, int SnapshotRacers, double SnapshotsPerSecond, double InputsPerSecond, double EstimatedKBpsPerPlayer);

    public void TickCompleted(double ms)
    {
        lock (_gate)
        {
            _tickMsSum += ms;
            _tickMsMax = Math.Max(_tickMsMax, ms);
            _tickCount++;
            Publish();
        }
    }

    public void SnapshotSent(int count)
    {
        lock (_gate) _snapshotsSent += count;
    }

    public void InputReceived() => Interlocked.Increment(ref _inputs);

    /// <summary>Mide el tamaño real en MessagePack de un snapshot (se muestrea, no se hace en cada envío).</summary>
    public bool ShouldSampleSize()
    {
        lock (_gate) return _lastSnapshotBytes == 0 || _window.ElapsedMilliseconds % 1000 < 40;
    }

    public void SampleSnapshot(SnapshotDto snapshot)
    {
        var bytes = MessagePackSerializer.Serialize(snapshot, Options).Length;
        lock (_gate)
        {
            _lastSnapshotBytes = bytes;
            _lastSnapshotRacers = snapshot.R.Length / SnapshotLayout.RacerFields;
        }
    }

    private void Publish()
    {
        var elapsed = _window.Elapsed.TotalSeconds;
        if (elapsed < 2) return;
        var snapsPerSecond = _snapshotsSent / elapsed;
        _published = new Snapshot(
            TickMsAvg: Math.Round(_tickCount == 0 ? 0 : _tickMsSum / _tickCount, 3),
            TickMsMax: Math.Round(_tickMsMax, 3),
            TickBudgetMs: Math.Round(1000.0 / Game.Sim.Vehicles.TickRate, 1),
            SnapshotBytes: _lastSnapshotBytes,
            SnapshotRacers: _lastSnapshotRacers,
            SnapshotsPerSecond: Math.Round(snapsPerSecond, 1),
            InputsPerSecond: Math.Round(Interlocked.Exchange(ref _inputs, 0) / elapsed, 1),
            // ~20 snapshots/s por jugador + overhead del framing de SignalR (~10 bytes)
            EstimatedKBpsPerPlayer: Math.Round((_lastSnapshotBytes + 10) * 20 / 1024.0, 1));
        _tickMsSum = _tickMsMax = 0;
        _tickCount = _snapshotsSent = 0;
        _window.Restart();
    }

    public Snapshot Current
    {
        get { lock (_gate) return _published; }
    }
}
