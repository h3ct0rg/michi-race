using System.Security.Cryptography;
using MichiRacer.Game.Sim;

namespace MichiRacer.Game.Rooms;

public sealed class Player(string name, int color)
{
    private const int MaxQueuedInputs = 15; // ~0,5 s de colchón
    private const int MaxInputsPerSecond = 90; // el cliente envía 30/s; margen para ráfagas tras un corte de red
    private const double CallsPerSecond = 8, CallBurst = 16;

    /// <summary>Id estable (sobrevive a reconexiones). El token prueba que quien reconecta es el mismo jugador.</summary>
    public string Id { get; } = Guid.NewGuid().ToString("N")[..12];
    public string Token { get; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
    public string Name { get; } = name;
    public int Color { get; set; } = color;
    public bool Ready { get; set; }
    public int Ping { get; set; }
    public string? ConnectionId { get; set; }
    public DateTime? DisconnectedAt { get; set; }
    /// <summary>Tiene un kart en la carrera actual (false = espectador).</summary>
    public bool InRace { get; set; }

    public bool Connected => ConnectionId is not null;

    private readonly Queue<(int Seq, Input Input)> _inputs = new();
    private Input _last = Input.None;
    public int LastSeq { get; private set; } = -1;

    private long _inputWindow;
    private int _inputsInWindow;
    private double _callTokens = CallBurst;
    private long _lastCallRefill = Environment.TickCount64;

    /// <summary>Encola un input; descarta duplicados, valores inválidos y exceso de mensajes.</summary>
    public bool PushInput(int seq, Input input)
    {
        var second = Environment.TickCount64 / 1000;
        if (second != _inputWindow)
        {
            _inputWindow = second;
            _inputsInWindow = 0;
        }
        if (++_inputsInWindow > MaxInputsPerSecond) return false;
        if (!double.IsFinite(input.Steer)) return false;
        if (seq <= LastSeq || (_inputs.Count > 0 && seq <= _inputs.Last().Seq)) return false;
        _inputs.Enqueue((seq, input with { Steer = Math.Clamp(input.Steer, -1, 1) }));
        while (_inputs.Count > MaxQueuedInputs) _inputs.Dequeue();
        return true;
    }

    /// <summary>Consume un input por tick; si no llegó ninguno repite el último.</summary>
    public Input NextInput()
    {
        if (_inputs.TryDequeue(out var next))
        {
            LastSeq = next.Seq;
            _last = next.Input;
        }
        return _last;
    }

    public void ResetInputs()
    {
        _inputs.Clear();
        _last = Input.None;
        LastSeq = -1;
    }

    /// <summary>Token bucket para las llamadas del hub que no son input (evita spam de SetReady, etc.).</summary>
    public bool AllowCall()
    {
        var now = Environment.TickCount64;
        _callTokens = Math.Min(CallBurst, _callTokens + (now - _lastCallRefill) / 1000.0 * CallsPerSecond);
        _lastCallRefill = now;
        if (_callTokens < 1) return false;
        _callTokens--;
        return true;
    }
}
