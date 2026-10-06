using MichiRacer.Game.Rooms;
using Microsoft.AspNetCore.SignalR;

namespace MichiRacer.Server.Hubs;

/// <summary>Mensajes servidor → cliente.</summary>
public interface IRaceClient
{
    Task RoomState(RoomStateDto state);
    Task RaceStarted(RaceStartDto start);
    Task Snapshot(SnapshotDto snapshot);
    Task Results(ResultsDto results);
}

/// <summary>
/// Gateway de tiempo real. El cliente solo envía intenciones (unirse, listo, input);
/// el estado de la carrera lo decide el servidor.
/// </summary>
public sealed class RaceHub(RoomManager rooms, ServerMetrics metrics, ILogger<RaceHub> logger) : Hub<IRaceClient>
{
    private const string RoomKey = "room";
    private const string PlayerKey = "player";

    private string? PlayerId => Context.Items.TryGetValue(PlayerKey, out var id) ? id as string : null;

    public Task<JoinResponse> JoinRoom(string code, string name) =>
        Enter(code, room => room.Join(Context.ConnectionId, name));

    /// <summary>Reconexión (recarga de página o caída de red): vuelve al mismo lugar y al mismo kart.</summary>
    public Task<JoinResponse> RejoinRoom(string code, string playerId, string token) =>
        Enter(code, room => room.Rejoin(Context.ConnectionId, playerId, token));

    private async Task<JoinResponse> Enter(string code, Func<Room, JoinResponse> action)
    {
        var room = rooms.Get(code) ?? throw new HubException("La sala no existe o ya expiró.");
        if (Context.Items.TryGetValue(RoomKey, out var current) && current is string prev && prev != room.Code)
            await LeaveCurrent();

        var res = Guard(() => action(room));
        Context.Items[RoomKey] = room.Code;
        Context.Items[PlayerKey] = res.PlayerId;
        await Groups.AddToGroupAsync(Context.ConnectionId, room.Code);
        await Clients.OthersInGroup(room.Code).RoomState(res.Room);
        logger.LogInformation("{Player} entró a {Room}", res.PlayerId, room.Code);
        return res;
    }

    public Task LeaveRoom() => LeaveCurrent();

    public Task SetReady(bool ready) => Broadcast((room, id) => room.SetReady(id, ready));

    public Task SelectColor(int color) => Broadcast((room, id) => room.SelectColor(id, color));

    public Task SetFillBots(bool fill) => Broadcast((room, id) => room.SetFillBots(id, fill));

    public Task SetGridSize(int size) => Broadcast((room, id) => room.SetGridSize(id, size));

    public Task SetTrack(string trackId) => Broadcast((room, id) => room.SetTrack(id, trackId));

    public Task ReportPing(int ms) => Broadcast((room, id) => room.SetPing(id, ms));

    public async Task StartRace()
    {
        var (room, id) = Current();
        var start = Guard(() => room.StartRace(id));
        await Clients.Group(room.Code).RoomState(room.State());
        await Clients.Group(room.Code).RaceStarted(start);
    }

    /// <summary>Input del tick (fire-and-forget). buttons: 1 gas, 2 freno, 4 derrape, 8 turbo.</summary>
    public void SendInput(int seq, double steer, int buttons)
    {
        metrics.InputReceived();
        if (Context.Items.TryGetValue(RoomKey, out var code) && code is string c && PlayerId is { } id)
            rooms.Get(c)?.PushInput(id, seq, steer, buttons);
    }

    public long Ping() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // no se saca al jugador: queda en gracia para poder reconectarse con su token
        if (Context.Items.TryGetValue(RoomKey, out var code) && code is string c && rooms.Get(c) is { } room)
        {
            var state = room.Disconnect(Context.ConnectionId);
            if (state is not null) await Clients.Group(c).RoomState(state);
            logger.LogInformation("{Player} se desconectó de {Room} (en gracia)", PlayerId, c);
        }
        await base.OnDisconnectedAsync(exception);
    }

    private async Task LeaveCurrent()
    {
        if (!Context.Items.TryGetValue(RoomKey, out var code) || code is not string c) return;
        var id = PlayerId;
        Context.Items.Remove(RoomKey);
        Context.Items.Remove(PlayerKey);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, c);
        var room = rooms.Get(c);
        if (room is null || id is null) return;
        var state = room.Leave(id);
        if (state is null) rooms.Remove(c);
        else await Clients.Group(c).RoomState(state);
        logger.LogInformation("{Player} salió de {Room}", id, c);
    }

    private async Task Broadcast(Func<Room, string, RoomStateDto> action)
    {
        var (room, id) = Current();
        if (!room.AllowCall(id)) throw new HubException("Demasiadas acciones seguidas, espera un momento.");
        var state = Guard(() => action(room, id));
        await Clients.Group(room.Code).RoomState(state);
    }

    private (Room Room, string PlayerId) Current()
    {
        if (Context.Items.TryGetValue(RoomKey, out var code) && code is string c && rooms.Get(c) is { } room && PlayerId is { } id)
            return (room, id);
        throw new HubException("No estás en ninguna sala.");
    }

    // Los errores de reglas de sala se devuelven al cliente como HubException (mensaje ERROR).
    private static T Guard<T>(Func<T> action)
    {
        try
        {
            return action();
        }
        catch (RoomException e)
        {
            throw new HubException(e.Message);
        }
    }
}
