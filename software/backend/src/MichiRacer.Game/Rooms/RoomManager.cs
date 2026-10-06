using System.Collections.Concurrent;
using MichiRacer.Game.Sim.Tracks;

namespace MichiRacer.Game.Rooms;

/// <summary>Salas en memoria (en el futuro: Redis para coordinar varias instancias).</summary>
public sealed class RoomManager
{
    private static readonly TimeSpan IdleTimeout = TimeSpan.FromMinutes(10);
    private readonly ConcurrentDictionary<string, Room> _rooms = new(StringComparer.OrdinalIgnoreCase);

    public IEnumerable<Room> All => _rooms.Values;

    public Room Create(string trackId = Tracks.Default)
    {
        var def = Tracks.All.GetValueOrDefault(trackId) ?? Tracks.All[Tracks.Default];
        while (true)
        {
            var code = $"PX-{Random.Shared.Next(1000, 10000)}";
            var room = new Room(code, def);
            if (_rooms.TryAdd(code, room)) return room;
        }
    }

    public Room? Get(string code) => _rooms.GetValueOrDefault(Normalize(code));

    public void Remove(string code) => _rooms.TryRemove(Normalize(code), out _);

    /// <summary>Elimina salas vacías que nadie usó en un rato (p. ej. creadas y abandonadas).</summary>
    public void CleanupIdle()
    {
        var now = DateTime.UtcNow;
        foreach (var room in _rooms.Values)
            if (room.PlayerCount == 0 && now - room.LastActivity > IdleTimeout) Remove(room.Code);
    }

    public static string Normalize(string code)
    {
        var c = (code ?? "").Trim().ToUpperInvariant();
        return c.StartsWith("PX-") || c.Length == 0 ? c : $"PX-{c.TrimStart('#')}";
    }
}
