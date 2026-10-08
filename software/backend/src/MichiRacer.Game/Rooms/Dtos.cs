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
    IReadOnlyList<PlayerDto> Players,
    TournamentDto? Tournament = null);

public sealed record StandingDto(string Id, string Name, int Color, bool Bot, int Points, IReadOnlyList<int> Places);

/// <summary>
/// Estado del torneo (null en el lobby). Race: índice de la carrera actual o recién terminada.
/// NextRaceIn: segundos hasta la próxima carrera (intermedio). Votes: ids que votaron reiniciar (podio).
/// </summary>
public sealed record TournamentDto(
    int Race,
    int TotalRaces,
    IReadOnlyList<string> Tracks,
    IReadOnlyList<StandingDto> Standings,
    double NextRaceIn,
    IReadOnlyList<string> Votes,
    int VotesNeeded);

/// <summary>Respuesta a Join/Rejoin. Token permite reconectarse al mismo kart; Race != null si hay carrera en curso.</summary>
public sealed record JoinResponse(string PlayerId, string Token, RoomStateDto Room, RaceStartDto? Race);

public sealed record RaceRacerDto(string Id, string Name, int Color, bool Bot);

/// <summary>GoTick: último tick de la cuenta regresiva; los karts se mueven desde GoTick + 1.</summary>
public sealed record RaceStartDto(string TrackId, IReadOnlyList<RaceRacerDto> Racers, int GoTick);

/// <summary>
/// Snapshot compacto (20/s). R: <see cref="SnapshotLayout.RacerFields"/> floats por kart, en el orden de RaceStartDto.Racers.
/// Me: estado físico completo del kart propio (para reconciliar la predicción); null para espectadores.
/// P: proyectiles, <see cref="SnapshotLayout.ProjectileFields"/> floats cada uno. B: cajas de ítems rotas (índices).
/// </summary>
public sealed record SnapshotDto(int T, int Ph, float[] R, double[]? Me, float[] P, int[] B, IReadOnlyList<RaceEvent> Ev);

public static class SnapshotLayout
{
    /// <summary>[distance, x, speed, lean, lap, nextCheckpoint, finishTime(-1), place(0), flags]</summary>
    public const int RacerFields = 9;
    public const int FlagDrift = 1, FlagBoost = 2, FlagRespawn = 4, FlagAway = 8;
    public const int FlagShield = 16, FlagSpin = 32, FlagShock = 64, FlagFrozen = 128, FlagMagnet = 256, FlagSplash = 512;
    /// <summary>[kind, distance, x, state]</summary>
    public const int ProjectileFields = 4;

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
                        | (away ? FlagAway : 0)
                        | (r.ShieldLeft > 0 ? FlagShield : 0)
                        | (r.SpinLeft > 0 ? FlagSpin : 0)
                        | (r.ShockLeft > 0 ? FlagShock : 0)
                        | (r.FrozenLeft > 0 ? FlagFrozen : 0)
                        | (r.MagnetLeft > 0 ? FlagMagnet : 0)
                        | (r.Splash > 0 ? FlagSplash : 0);
    }

    public static float[] Projectiles(List<Projectile> list)
    {
        var buf = new float[list.Count * ProjectileFields];
        for (var i = 0; i < list.Count; i++)
        {
            var p = list[i];
            var o = i * ProjectileFields;
            buf[o] = p.Kind;
            buf[o + 1] = (float)p.Distance;
            buf[o + 2] = (float)p.X;
            buf[o + 3] = p.State;
        }
        return buf;
    }

    /// <summary>Estado completo (orden fijo, espejo de applySelf en frontend/src/game/online.ts).</summary>
    public static double[] Self(Racer r, int seq) =>
    [
        r.Distance, r.X, r.Vx, r.Speed, r.Steer, r.Lean,
        r.TurboLeft, r.BoostLeft,
        r.Drift.Active ? 1 : 0, r.Drift.Dir, r.Drift.Charge,
        r.LostTime, r.Respawn, r.Bump,
        r.Lap, r.NextCheckpoint, r.LapStart, r.BestLap ?? -1, r.FinishTime ?? -1, r.Place ?? 0,
        r.Item, r.ItemRoll, r.UseHeld ? 1 : 0,
        r.ShieldLeft, r.SpinLeft, r.ShockLeft, r.FrozenLeft, r.MagnetLeft, r.Splash,
        seq,
    ];
}

/// <summary>Points: puntos ganados en esta carrera; Total: acumulado del torneo.</summary>
public sealed record ResultRowDto(string Id, string Name, int Color, bool Bot, int Place, double? FinishTime, double? BestLap, int Points, int Total);

/// <summary>Resultado de una carrera del torneo; Final = era la última (sigue el podio).</summary>
public sealed record ResultsDto(
    string TrackName,
    IReadOnlyList<ResultRowDto> Rows,
    int RaceIndex,
    int TotalRaces,
    bool Final,
    double NextRaceIn,
    IReadOnlyList<StandingDto> Standings);
