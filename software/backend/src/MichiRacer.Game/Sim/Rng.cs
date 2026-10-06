namespace MichiRacer.Game.Sim;

/// <summary>PRNG mulberry32, idéntico al de frontend/src/sim/rng.ts.</summary>
public sealed class Rng(uint seed)
{
    private uint _a = seed;

    public double Next()
    {
        unchecked
        {
            _a += 0x6D2B79F5;
            uint t = _a;
            t = (t ^ (t >> 15)) * (t | 1);
            t ^= t + (t ^ (t >> 7)) * (t | 61);
            return (t ^ (t >> 14)) / 4294967296.0;
        }
    }
}
