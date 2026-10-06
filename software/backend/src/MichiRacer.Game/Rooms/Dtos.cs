using MichiRacer.Game.Sim;

namespace MichiRacer.Game.Rooms;

// Mensajes SignalR (MessagePack o JSON). El cliente normaliza las claves a camelCase.

public sealed record PlayerDto(string Id, string Name, int Color, bool Ready, int Ping, bool IsOwner, bool Connected);

public sealed record RoomStateDto(
    string Code,
    string OwnerId,
    string Phase,
    string TrackId,
    string TrackName,
    int Laps,
    bool FillBots,
    int GridSize,
    int MaxPlayers,
    IReadOnlyList<PlayerDto> Players);

/// <summary>Respuesta a Join/Rejoin. Token permite reconectarse al mismo kart; Race != null si hay carrera en curso.</summary>
public sealed record JoinResponse(string PlayerId, string Token, RoomStateDto Room, RaceStartDto? Race);

public sealed record RaceRacerDto(string Id, string Name, int Color, bool Bot);

/// <summary>GoTick: último tick de la cuenta regresiva; los karts se mueven desde GoTick + 1.</summary>
public sealed record RaceStartDto(string TrackId, IReadOnlyList<RaceRacerDto> Racers, int GoTick);

/// <summary>
/// Snapshot compacto (20/s). R: <see cref="RacerFields"/> floats por kart, en el orden de RaceStartDto.Racers.
/// Me: estado físico completo del kart propio (para reconciliar la predicción); null para espectadores.
/// </summary>
public sealed record SnapshotDto(int T, int Ph, float[] R, double[]? Me, IReadOnlyList<RaceEvent> Ev);

public static class SnapshotLayout
{
    /// <summary>[distance, x, speed, lean, lap, nextCheckpoint, finishTime(-1), place(0), flags]</summary>
    public const int RacerFields = 9;
    public const int FlagDrift = 1, FlagBoost = 2, FlagRespawn = 4, FlagAway = 8;

    public static void WriteRacer(float[] buffer, int index, Racer r, bool away)
    {
        var o = index * RacerFields;
        buffer[o] = (float)r.Distance;
        buffer[o + 1] = (float)r.X;
        buffer[o + 2] = (float)r.Speed;
        buffer[o + 3] = (float)r.Lean;
        buffer[o + 4] = r.Lap;
        buffer[o + 5] = r.NextCheckpoint;
        buffer[o + 6] = (float)(r.FinishTime ?? -1);
        buffer[o + 7] = r.Place ?? 0;
        buffer[o + 8] = (r.Drift.Active ? FlagDrift : 0)
                        | (r.TurboLeft > 0 || r.BoostLeft > 0 ? FlagBoost : 0)
                        | (r.Respawn > 0 ? FlagRespawn : 0)
                        | (away ? FlagAway : 0);
    }

    /// <summary>Estado completo (orden fijo, espejo de applySelf en frontend/src/game/online.ts).</summary>
    public static double[] Self(Racer r, int seq) =>
    [
        r.Distance, r.X, r.Vx, r.Speed, r.Steer, r.Lean,
        r.Turbo, r.TurboLeft, r.BoostLeft,
        r.Drift.Active ? 1 : 0, r.Drift.Dir, r.Drift.Charge,
        r.LostTime, r.Respawn, r.Bump,
        r.Lap, r.NextCheckpoint, r.LapStart, r.BestLap ?? -1, r.FinishTime ?? -1, r.Place ?? 0,
        seq,
    ];
}

public sealed record ResultRowDto(string Id, string Name, int Color, bool Bot, int Place, double? FinishTime, double? BestLap);

public sealed record ResultsDto(string TrackName, IReadOnlyList<ResultRowDto> Rows);
