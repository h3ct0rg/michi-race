using System.Security.Cryptography;
using System.Text;
using MichiRacer.Game.Sim;
using MichiRacer.Game.Sim.Tracks;

namespace MichiRacer.Game.Rooms;

public enum RoomPhase { Lobby, Racing }

public sealed class RoomException(string message) : Exception(message);

/// <summary>Snapshot de un tick: la parte común (R, eventos) + el estado propio de cada destinatario.</summary>
public sealed record SnapshotBundle(int T, int Ph, float[] R, IReadOnlyList<RaceEvent> Ev, IReadOnlyList<SnapshotTarget> Targets);

public sealed record SnapshotTarget(string ConnectionId, double[]? Me);

/// <summary>Lo que el gateway debe enviar tras un tick. Empty: la sala quedó vacía y debe eliminarse.</summary>
public sealed record RoomTickOutput(SnapshotBundle? Snapshot, ResultsDto? Results, RoomStateDto? RoomState, bool Empty);

/// <summary>
/// Una sala: jugadores, ownership, lobby y la carrera autoritativa.
/// Thread-safe: todos los métodos públicos toman el lock de la sala.
/// </summary>
public sealed class Room
{
    public const int MaxPlayers = 20;
    public const int MinGrid = 2;
    public const int ColorCount = 8;
    public const int MaxNameLength = 12;
    /// <summary>Snapshots a 20 Hz con la simulación a 30 Hz: se envían 2 de cada 3 ticks.</summary>
    public const int SnapshotSkipEvery = 3;
    public static readonly TimeSpan LobbyGrace = TimeSpan.FromSeconds(10);
    public static readonly TimeSpan RaceGrace = TimeSpan.FromSeconds(60);

    private static readonly string[] BotNames =
    [
        "TurboCat", "ApexMiau", "Bigotes", "Pelusa", "Garfi", "Nieve", "Ronroneo", "Misifú", "Zarpas", "Michifuz",
        "Tigrito", "Canela", "Bolita", "Copito", "Manchas", "Sombra", "Galleta", "Pimienta", "Rayo", "Luna",
    ];

    private readonly object _gate = new();
    private readonly List<Player> _players = [];
    private Track _track;
    // las pistas son inmutables en el servidor: se construyen una vez y se comparten entre salas
    private static readonly Dictionary<string, Track> BuiltTracks = Tracks.All.ToDictionary(t => t.Key, t => Track.Build(t.Value));
    private Race? _race;
    private RaceStartDto? _raceStart;
    private float[] _snapshotBuffer = [];

    public string Code { get; }
    public string OwnerId { get; private set; } = "";
    public RoomPhase Phase { get; private set; } = RoomPhase.Lobby;
    public bool FillBots { get; private set; } = true;
    public int GridSize { get; private set; } = 8;
    public DateTime LastActivity { get; private set; } = DateTime.UtcNow;

    public Room(string code, TrackDef track)
    {
        Code = code;
        _track = BuiltTracks.GetValueOrDefault(track.Id) ?? Track.Build(track);
    }

    public int PlayerCount
    {
        get { lock (_gate) return _players.Count; }
    }

    public int ConnectedCount
    {
        get { lock (_gate) return _players.Count(p => p.Connected); }
    }

    // ------------------------------------------------------------------ entrada / salida

    public JoinResponse Join(string connectionId, string rawName)
    {
        lock (_gate)
        {
            if (_players.Count >= MaxPlayers) throw new RoomException("La sala está llena (20 pilotos).");
            var name = UniqueName(SanitizeName(rawName));
            var used = _players.Select(p => p.Color).ToHashSet();
            var color = Enumerable.Range(0, ColorCount).FirstOrDefault(c => !used.Contains(c), _players.Count % ColorCount);
            var player = new Player(name, color) { ConnectionId = connectionId };
            _players.Add(player);
            if (_players.Count == 1) OwnerId = player.Id;
            Touch();
            return new JoinResponse(player.Id, player.Token, State(), Phase == RoomPhase.Racing ? _raceStart : null);
        }
    }

    /// <summary>Vuelve a enlazar un jugador (recarga de página o caída de red) a su lugar y a su kart.</summary>
    public JoinResponse Rejoin(string connectionId, string playerId, string token)
    {
        lock (_gate)
        {
            var p = _players.Find(x => x.Id == playerId);
            if (p is null || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(p.Token), Encoding.UTF8.GetBytes(token ?? "")))
                throw new RoomException("Tu lugar en la sala expiró.");
            p.ConnectionId = connectionId;
            p.DisconnectedAt = null;
            p.ResetInputs();
            if (Phase == RoomPhase.Racing && p.InRace && RacerOf(p) is { } racer && racer.FinishTime is null) racer.Bot = null;
            Touch();
            return new JoinResponse(p.Id, p.Token, State(), Phase == RoomPhase.Racing ? _raceStart : null);
        }
    }

    /// <summary>Conexión caída: el jugador conserva su lugar un tiempo; en carrera su kart pasa a piloto automático.</summary>
    public RoomStateDto? Disconnect(string connectionId)
    {
        lock (_gate)
        {
            var p = _players.Find(x => x.ConnectionId == connectionId);
            if (p is null) return null;
            p.ConnectionId = null;
            p.DisconnectedAt = DateTime.UtcNow;
            if (Phase == RoomPhase.Racing && RacerOf(p) is { } racer) racer.Bot ??= Autopilot();
            return State();
        }
    }

    /// <summary>Salida voluntaria. Devuelve null si la sala quedó vacía.</summary>
    public RoomStateDto? Leave(string playerId)
    {
        lock (_gate)
        {
            RemovePlayer(playerId);
            Touch();
            return _players.Count == 0 ? null : State();
        }
    }

    private void RemovePlayer(string playerId)
    {
        var p = _players.Find(x => x.Id == playerId);
        if (p is null) return;
        _players.Remove(p);
        if (Phase == RoomPhase.Racing && RacerOf(p) is { } racer) racer.Bot ??= Autopilot(); // el kart sigue en pista
        if (OwnerId == playerId && _players.Count > 0)
            OwnerId = (_players.Find(x => x.Connected) ?? _players[0]).Id;
        if (Phase == RoomPhase.Racing && !_players.Any(x => x.Connected)) EndRace();
    }

    private bool ExpireDisconnected(DateTime now)
    {
        var expired = _players
            .Where(p => p.DisconnectedAt is { } at && now - at > (Phase == RoomPhase.Racing && p.InRace ? RaceGrace : LobbyGrace))
            .Select(p => p.Id)
            .ToList();
        foreach (var id in expired) RemovePlayer(id);
        // si el owner está desconectado, el mando pasa a alguien conectado
        if (_players.Find(p => p.Id == OwnerId) is { Connected: false } && _players.Find(p => p.Connected) is { } next)
        {
            OwnerId = next.Id;
            return true;
        }
        return expired.Count > 0;
    }

    // ------------------------------------------------------------------ lobby

    public RoomStateDto SetReady(string playerId, bool ready) => Mutate(playerId, p => p.Ready = ready);

    public RoomStateDto SelectColor(string playerId, int color)
    {
        if (color < 0 || color >= ColorCount) throw new RoomException("Color inválido.");
        return Mutate(playerId, p => p.Color = color);
    }

    public RoomStateDto SetPing(string playerId, int ping) => Mutate(playerId, p => p.Ping = Math.Clamp(ping, 0, 9999));

    public RoomStateDto SetFillBots(string playerId, bool fill) => OwnerMutate(playerId, () => FillBots = fill);

    /// <summary>El owner elige la pista (solo en el lobby).</summary>
    public RoomStateDto SetTrack(string playerId, string trackId) =>
        OwnerMutate(playerId, () =>
        {
            if (Phase != RoomPhase.Lobby) throw new RoomException("No se puede cambiar la pista durante la carrera.");
            _track = BuiltTracks.GetValueOrDefault(trackId ?? "") ?? throw new RoomException("Pista desconocida.");
        });

    public RoomStateDto SetGridSize(string playerId, int size) =>
        OwnerMutate(playerId, () => GridSize = Math.Clamp(size, MinGrid, MaxPlayers));

    public bool AllowCall(string playerId)
    {
        lock (_gate) return _players.Find(p => p.Id == playerId)?.AllowCall() ?? false;
    }

    /// <summary>El owner inicia la carrera cuando todos los demás pilotos conectados están listos.</summary>
    public RaceStartDto StartRace(string playerId)
    {
        lock (_gate)
        {
            RequireOwner(playerId);
            if (Phase != RoomPhase.Lobby) throw new RoomException("La carrera ya comenzó.");
            var humans = _players.Where(p => p.Connected).ToList();
            if (humans.Any(p => p.Id != OwnerId && !p.Ready)) throw new RoomException("Todavía hay pilotos que no están listos.");

            var vehicle = Vehicles.Derive(Vehicles.All["michi"].Stats);
            var checkpoints = _track.Def.Checkpoints;
            var racers = new List<Racer>();
            foreach (var p in _players)
            {
                p.InRace = p.Connected;
                p.ResetInputs();
                if (!p.InRace) continue;
                var (d, x) = Race.GridSlot(racers.Count);
                racers.Add(new Racer(p.Id, p.Name, vehicle, d, x, checkpoints) { Color = p.Color });
            }
            if (FillBots)
            {
                var free = Enumerable.Range(0, ColorCount).Where(c => humans.All(p => p.Color != c)).ToList();
                if (free.Count == 0) free = Enumerable.Range(0, ColorCount).ToList();
                for (var i = 0; racers.Count < Math.Max(GridSize, humans.Count); i++)
                {
                    var (d, x) = Race.GridSlot(racers.Count);
                    racers.Add(new Racer($"bot{i}", BotNames[i % BotNames.Length], vehicle, d, x, checkpoints)
                    {
                        Color = free[i % free.Count],
                        Bot = new BotState { Skill = 0.8 + (i % 10) * 0.012, Lane = x, LaneTimer = 2 },
                    });
                }
            }
            _race = new Race(_track, racers, (uint)Random.Shared.Next());
            _raceStart = new RaceStartDto(
                _track.Def.Id,
                racers.Select(r => new RaceRacerDto(r.Id, r.Name, r.Color, r.Bot is not null)).ToList(),
                GoTick());
            _snapshotBuffer = new float[racers.Count * SnapshotLayout.RacerFields];
            Phase = RoomPhase.Racing;
            Touch();
            return _raceStart;
        }
    }

    /// <summary>Tick en el que termina la cuenta regresiva (mismo cálculo de punto flotante que Race.Step).</summary>
    public static int GoTick()
    {
        var c = Race.CountdownSeconds;
        var k = 0;
        while (c > 0)
        {
            c -= Vehicles.Tick;
            k++;
        }
        return k;
    }

    // ------------------------------------------------------------------ carrera

    public void PushInput(string playerId, int seq, double steer, int buttons)
    {
        lock (_gate)
        {
            var input = new Input(steer, (buttons & 1) != 0, (buttons & 2) != 0, (buttons & 4) != 0, (buttons & 8) != 0);
            _players.Find(p => p.Id == playerId)?.PushInput(seq, input);
        }
    }

    /// <summary>Avanza la sala `ticks` veces. Devuelve snapshot (20 Hz), resultados y cambios de estado.</summary>
    public RoomTickOutput Tick(int ticks, DateTime now)
    {
        lock (_gate)
        {
            var before = _players.Count;
            var stateChanged = ExpireDisconnected(now);
            // vacía porque se fue el último (una sala recién creada sin jugadores la limpia CleanupIdle)
            if (before > 0 && _players.Count == 0) return new RoomTickOutput(null, null, null, Empty: true);
            if (Phase != RoomPhase.Racing || _race is null)
                return new RoomTickOutput(null, null, stateChanged ? State() : null, false);

            var race = _race;
            var events = new List<RaceEvent>();
            var send = false;
            for (var t = 0; t < ticks && race.Phase != RacePhase.Finished; t++)
            {
                var inputs = new Dictionary<string, Input>();
                // durante la cuenta regresiva los inputs quedan en cola: se consumen desde el primer tick de carrera
                if (race.Phase == RacePhase.Racing)
                    foreach (var p in _players)
                        if (p.InRace && p.Connected) inputs[p.Id] = p.NextInput();
                race.Step(inputs);
                events.AddRange(race.DrainEvents());
                send |= race.Tick % SnapshotSkipEvery != 0;
            }
            var finished = race.Phase == RacePhase.Finished;
            SnapshotBundle? snapshot = null;
            if (send || events.Count > 0 || finished) snapshot = BuildSnapshot(race, events);
            if (!finished) return new RoomTickOutput(snapshot, null, stateChanged ? State() : null, false);

            var results = BuildResults(race);
            EndRace();
            return new RoomTickOutput(snapshot, results, State(), false);
        }
    }

    private void EndRace()
    {
        Phase = RoomPhase.Lobby;
        _race = null;
        _raceStart = null;
        foreach (var p in _players)
        {
            p.Ready = false;
            p.InRace = false;
        }
    }

    private SnapshotBundle BuildSnapshot(Race race, List<RaceEvent> events)
    {
        var away = _players.Where(p => !p.Connected).Select(p => p.Id).ToHashSet();
        for (var i = 0; i < race.Racers.Count; i++)
            SnapshotLayout.WriteRacer(_snapshotBuffer, i, race.Racers[i], away.Contains(race.Racers[i].Id));
        var r = (float[])_snapshotBuffer.Clone();
        var phase = race.Phase switch { RacePhase.Countdown => 0, RacePhase.Racing => 1, _ => 2 };
        var targets = _players
            .Where(p => p.Connected)
            .Select(p => new SnapshotTarget(p.ConnectionId!, p.InRace && RacerOf(p) is { } me ? SnapshotLayout.Self(me, p.LastSeq) : null))
            .ToList();
        return new SnapshotBundle(race.Tick, phase, r, events, targets);
    }

    private ResultsDto BuildResults(Race race)
    {
        var rows = race.Ranking()
            .Select((r, i) => new ResultRowDto(r.Id, r.Name, r.Color, _raceStart?.Racers.FirstOrDefault(x => x.Id == r.Id)?.Bot ?? r.Bot is not null, i + 1, r.FinishTime, r.BestLap))
            .ToList();
        return new ResultsDto(_track.Def.Name, rows);
    }

    private Racer? RacerOf(Player p) => _race?.Racers.Find(r => r.Id == p.Id);

    private static BotState Autopilot() => new() { Skill = 0.85, Lane = 0, LaneTimer = 0 };

    // ------------------------------------------------------------------ estado

    public RoomStateDto State()
    {
        lock (_gate)
        {
            return new RoomStateDto(
                Code, OwnerId, Phase == RoomPhase.Lobby ? "lobby" : "racing",
                _track.Def.Id, _track.Def.Name, _track.Laps, FillBots, GridSize, MaxPlayers,
                _players.Select(p => new PlayerDto(p.Id, p.Name, p.Color, p.Ready, p.Ping, p.Id == OwnerId, p.Connected)).ToList());
        }
    }

    private RoomStateDto Mutate(string playerId, Action<Player> change)
    {
        lock (_gate)
        {
            var p = _players.Find(x => x.Id == playerId) ?? throw new RoomException("No estás en esta sala.");
            change(p);
            Touch();
            return State();
        }
    }

    private RoomStateDto OwnerMutate(string playerId, Action change)
    {
        lock (_gate)
        {
            RequireOwner(playerId);
            change();
            Touch();
            return State();
        }
    }

    private void RequireOwner(string playerId)
    {
        if (playerId != OwnerId) throw new RoomException("Solo el dueño de la sala puede hacer esto.");
    }

    private void Touch() => LastActivity = DateTime.UtcNow;

    private static string SanitizeName(string raw)
    {
        var clean = new string((raw ?? "").Trim().Where(c => char.IsLetterOrDigit(c) || c is '_' or '-' or ' ').ToArray());
        if (clean.Length > MaxNameLength) clean = clean[..MaxNameLength];
        return clean.Length == 0 ? $"Michi{Random.Shared.Next(100, 999)}" : clean;
    }

    private string UniqueName(string name)
    {
        var candidate = name;
        for (var i = 2; _players.Any(p => p.Name.Equals(candidate, StringComparison.OrdinalIgnoreCase)); i++)
            candidate = $"{name[..Math.Min(name.Length, MaxNameLength - 2)]}{i}";
        return candidate;
    }
}
