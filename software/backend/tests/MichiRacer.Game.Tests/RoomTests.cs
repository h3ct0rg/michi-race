using MichiRacer.Game.Rooms;
using MichiRacer.Game.Sim;
using MichiRacer.Game.Sim.Tracks;

namespace MichiRacer.Game.Tests;

public class RoomTests
{
    private static Room NewRoom() => new("PX-1234", GreenValley.Def);
    private static readonly DateTime T0 = DateTime.UtcNow;

    /// <summary>Corre la sala hasta que termina la carrera (o se agota el límite).</summary>
    private static ResultsDto? RunToResults(Room room, string? driverId = null, int maxTicks = 30 * 60 * 5)
    {
        for (var i = 0; i < maxTicks; i++)
        {
            if (driverId is not null) room.PushInput(driverId, i + 1, 0, 1);
            if (room.Tick(1, T0).Results is { } results) return results;
        }
        return null;
    }

    [Fact]
    public void First_player_is_owner_and_ownership_transfers_on_leave()
    {
        var room = NewRoom();
        var a = room.Join("ca", "Gaston");
        var b = room.Join("cb", "Player2");
        Assert.Equal(a.PlayerId, b.Room.OwnerId);

        var state = room.Leave(a.PlayerId)!;
        Assert.Equal(b.PlayerId, state.OwnerId);
        Assert.Null(room.Leave(b.PlayerId)); // sala vacía
    }

    [Fact]
    public void Names_are_sanitized_and_unique_and_colors_distinct()
    {
        var room = NewRoom();
        room.Join("ca", "  TurboCat<script>  ");
        var state = room.Join("cb", "turbocatscript").Room;
        Assert.Equal("TurboCatscri", state.Players[0].Name);
        Assert.NotEqual(state.Players[0].Name, state.Players[1].Name, StringComparer.OrdinalIgnoreCase);
        Assert.NotEqual(state.Players[0].Color, state.Players[1].Color);
    }

    [Fact]
    public void Only_owner_can_start_and_everyone_else_must_be_ready()
    {
        var room = NewRoom();
        var a = room.Join("ca", "A");
        var b = room.Join("cb", "B");
        Assert.Throws<RoomException>(() => room.StartRace(b.PlayerId));
        Assert.Throws<RoomException>(() => room.StartRace(a.PlayerId));
        room.SetReady(b.PlayerId, true);
        var start = room.StartRace(a.PlayerId);
        Assert.Equal(8, start.Racers.Count); // parrilla por defecto rellenada con bots
        Assert.Equal(RoomPhase.Racing, room.Phase);
    }

    [Fact]
    public void Supports_20_players_and_grid_size()
    {
        var room = NewRoom();
        var owner = room.Join("c0", "P0");
        for (var i = 1; i < Room.MaxPlayers; i++) room.Join($"c{i}", $"P{i}");
        Assert.Throws<RoomException>(() => room.Join("extra", "Extra"));

        room.SetGridSize(owner.PlayerId, 99);
        Assert.Equal(Room.MaxPlayers, room.State().GridSize);
        foreach (var p in room.State().Players.Where(p => !p.IsOwner)) room.SetReady(p.Id, true);
        var start = room.StartRace(owner.PlayerId);
        Assert.Equal(20, start.Racers.Count);
        Assert.All(start.Racers, r => Assert.False(r.Bot));
    }

    [Fact]
    public void Race_runs_to_results_and_room_returns_to_lobby()
    {
        var room = NewRoom();
        var a = room.Join("ca", "A");
        room.StartRace(a.PlayerId);
        var results = RunToResults(room, a.PlayerId);
        Assert.NotNull(results);
        Assert.Equal(8, results!.Rows.Count);
        Assert.Equal(Enumerable.Range(1, 8), results.Rows.Select(r => r.Place));
        Assert.False(results.Rows.Single(r => r.Id == a.PlayerId).Bot);
        Assert.Equal(RoomPhase.Lobby, room.Phase);
        Assert.All(room.State().Players, p => Assert.False(p.Ready));
    }

    [Fact]
    public void Snapshots_are_sent_at_20hz_with_personal_state()
    {
        var room = NewRoom();
        var a = room.Join("ca", "A");
        var start = room.StartRace(a.PlayerId);
        var sent = 0;
        SnapshotBundle? last = null;
        for (var i = 0; i < 30; i++)
        {
            if (room.Tick(1, T0).Snapshot is { } s)
            {
                sent++;
                last = s;
            }
        }
        Assert.InRange(sent, 19, 22); // 20 por segundo (+ eventos)
        Assert.Equal(start.Racers.Count * SnapshotLayout.RacerFields, last!.R.Length);
        var target = Assert.Single(last.Targets);
        Assert.Equal("ca", target.ConnectionId);
        Assert.NotNull(target.Me);
    }

    [Fact]
    public void Go_tick_matches_race_countdown()
    {
        var room = NewRoom();
        var a = room.Join("ca", "A");
        var start = room.StartRace(a.PlayerId);
        for (var i = 0; i < start.GoTick - 1; i++) Assert.Equal(0, room.Tick(1, T0).Snapshot?.Ph ?? 0);
        // en el tick GoTick termina la cuenta regresiva
        var tick = room.Tick(1, T0);
        Assert.Equal(1, tick.Snapshot!.Ph);
        Assert.Contains(tick.Snapshot.Ev, e => e.Type == "go");
    }

    [Fact]
    public void Disconnected_player_keeps_kart_on_autopilot_and_can_rejoin_with_token()
    {
        var room = NewRoom();
        var a = room.Join("ca", "A");
        var b = room.Join("cb", "B");
        room.SetReady(b.PlayerId, true);
        room.StartRace(a.PlayerId);

        var state = room.Disconnect("cb")!;
        Assert.False(state.Players.Single(p => p.Id == b.PlayerId).Connected);
        Assert.Throws<RoomException>(() => room.Rejoin("cb2", b.PlayerId, "token-falso"));

        var back = room.Rejoin("cb2", b.PlayerId, b.Token);
        Assert.Equal(b.PlayerId, back.PlayerId);
        Assert.NotNull(back.Race); // vuelve a la carrera en curso
        Assert.True(back.Room.Players.Single(p => p.Id == b.PlayerId).Connected);
    }

    [Fact]
    public void Disconnected_players_expire_after_grace_and_owner_moves_to_connected()
    {
        var room = NewRoom();
        var a = room.Join("ca", "A");
        var b = room.Join("cb", "B");
        room.Disconnect("ca");

        var output = room.Tick(1, DateTime.UtcNow);
        Assert.Equal(b.PlayerId, output.RoomState!.OwnerId); // el mando pasa a quien sigue conectado
        Assert.Equal(2, room.PlayerCount);

        room.Tick(1, DateTime.UtcNow + Room.LobbyGrace + TimeSpan.FromSeconds(1));
        Assert.Equal(1, room.PlayerCount);
        Assert.Throws<RoomException>(() => room.Rejoin("ca2", a.PlayerId, a.Token));
    }

    [Fact]
    public void New_room_without_players_is_not_reported_empty_until_someone_leaves()
    {
        var room = NewRoom();
        Assert.False(room.Tick(1, T0).Empty); // recién creada: hay que darle tiempo a que entre el creador
        var a = room.Join("ca", "A");
        room.Disconnect("ca");
        Assert.True(room.Tick(1, DateTime.UtcNow + Room.LobbyGrace + TimeSpan.FromSeconds(1)).Empty);
        Assert.Throws<RoomException>(() => room.Rejoin("ca2", a.PlayerId, a.Token));
    }

    [Fact]
    public void Late_joiner_spectates_current_race()
    {
        var room = NewRoom();
        var a = room.Join("ca", "A");
        room.StartRace(a.PlayerId);
        var late = room.Join("cl", "Late");
        Assert.NotNull(late.Race);
        Assert.DoesNotContain(late.Race!.Racers, r => r.Id == late.PlayerId);

        SnapshotBundle? s = null;
        for (var i = 0; i < 3 && s is null; i++) s = room.Tick(1, T0).Snapshot;
        Assert.Null(s!.Targets.Single(t => t.ConnectionId == "cl").Me); // espectador: sin estado propio
    }

    [Fact]
    public void Inputs_are_acked_in_order_and_invalid_ones_ignored()
    {
        var p = new Player("A", 0);
        Assert.True(p.PushInput(1, new Input(0.5, true, false, false, false)));
        Assert.True(p.PushInput(2, Input.None));
        Assert.False(p.PushInput(1, Input.None)); // duplicado
        Assert.False(p.PushInput(3, new Input(double.NaN, true, false, false, false))); // inválido
        Assert.True(p.PushInput(4, new Input(50, true, false, false, false)));
        p.NextInput();
        Assert.Equal(1, p.LastSeq);
        p.NextInput();
        Assert.Equal(2, p.LastSeq);
        Assert.Equal(1, p.NextInput().Steer); // steer recortado a [-1, 1]
        Assert.Equal(1, p.NextInput().Steer); // sin input nuevo: repite el último
        Assert.Equal(4, p.LastSeq);
    }

    [Fact]
    public void Input_flood_is_rate_limited()
    {
        var p = new Player("A", 0);
        var accepted = Enumerable.Range(1, 200).Count(i => p.PushInput(i, Input.None));
        Assert.True(accepted <= 90, $"aceptó {accepted} inputs en un segundo");
    }
}
