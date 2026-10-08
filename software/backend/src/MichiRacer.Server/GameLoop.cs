using System.Diagnostics;
using MichiRacer.Game.Rooms;
using MichiRacer.Game.Sim;
using MichiRacer.Server.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace MichiRacer.Server;

/// <summary>
/// Bucle autoritativo: avanza todas las salas a 30 ticks/s y envía snapshots personalizados a 20/s.
/// Usa un acumulador con Stopwatch porque los timers de Windows tienen ~15 ms de resolución.
/// </summary>
public sealed class GameLoop(RoomManager rooms, IHubContext<RaceHub, IRaceClient> hub, ServerMetrics metrics, ILogger<GameLoop> logger)
    : BackgroundService
{
    private const int MaxCatchUpTicks = 5;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var clock = Stopwatch.StartNew();
        var tickTicks = Stopwatch.Frequency / Vehicles.TickRate;
        var next = clock.ElapsedTicks;
        var lastCleanup = DateTime.UtcNow;

        while (!stoppingToken.IsCancellationRequested)
        {
            var now = clock.ElapsedTicks;
            if (now >= next)
            {
                var due = (int)((now - next) / tickTicks) + 1;
                if (due > MaxCatchUpTicks)
                {
                    logger.LogWarning("Game loop atrasado {Ticks} ticks; se descartan", due - MaxCatchUpTicks);
                    next = now;
                    due = 1;
                }
                next += due * tickTicks;
                var started = clock.ElapsedTicks;
                await TickRooms(due);
                metrics.TickCompleted((clock.ElapsedTicks - started) * 1000.0 / Stopwatch.Frequency / due);
            }

            if (DateTime.UtcNow - lastCleanup > TimeSpan.FromMinutes(1))
            {
                rooms.CleanupIdle();
                lastCleanup = DateTime.UtcNow;
            }

            var waitMs = (next - clock.ElapsedTicks) * 1000 / Stopwatch.Frequency;
            await Task.Delay(TimeSpan.FromMilliseconds(Math.Max(1, waitMs)), stoppingToken).ConfigureAwait(false);
        }
    }

    private async Task TickRooms(int ticks)
    {
        var utcNow = DateTime.UtcNow;
        var sends = new List<Task>();
        foreach (var room in rooms.All)
        {
            try
            {
                var output = room.Tick(ticks, utcNow);
                if (output.Empty)
                {
                    rooms.Remove(room.Code);
                    continue;
                }
                if (output.Snapshot is { } s)
                {
                    foreach (var target in s.Targets)
                    {
                        var dto = new SnapshotDto(s.T, s.Ph, s.R, target.Me, s.P, s.B, s.Ev);
                        sends.Add(hub.Clients.Client(target.ConnectionId).Snapshot(dto));
                    }
                    metrics.SnapshotSent(s.Targets.Count);
                    if (s.Targets.Count > 0 && metrics.ShouldSampleSize())
                        metrics.SampleSnapshot(new SnapshotDto(s.T, s.Ph, s.R, s.Targets[0].Me, s.P, s.B, s.Ev));
                }
                var group = hub.Clients.Group(room.Code);
                if (output.Results is not null) sends.Add(group.Results(output.Results));
                if (output.RoomState is not null) sends.Add(group.RoomState(output.RoomState));
            }
            catch (Exception e)
            {
                logger.LogError(e, "Error en el tick de la sala {Room}", room.Code);
            }
        }
        // los envíos se hacen en paralelo: una conexión lenta no frena a las demás salas
        try
        {
            await Task.WhenAll(sends);
        }
        catch (Exception e)
        {
            logger.LogDebug(e, "Fallo al enviar a un cliente");
        }
    }
}
