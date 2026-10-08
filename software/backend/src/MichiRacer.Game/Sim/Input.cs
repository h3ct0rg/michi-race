namespace MichiRacer.Game.Sim;

/// <summary>Input de un tick (mensaje INPUT del cliente).</summary>
public readonly record struct Input(double Steer, bool Throttle, bool Brake, bool Drift, bool UseItem)
{
    public static readonly Input None = new(0, false, false, false, false);
}
