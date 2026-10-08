namespace MichiRacer.Game.Rooms;

/// <summary>
/// Reglas del torneo: 4 carreras en orden fijo, puntos estilo Mario Kart que se acumulan.
/// Espejo de frontend/src/game/tournament.ts (la práctica local usa las mismas reglas).
/// </summary>
public static class TournamentRules
{
    /// <summary>De fácil a difícil.</summary>
    public static readonly string[] Order = ["green-valley", "coastal-road", "desert-run", "neon-city"];
    public static readonly TimeSpan Intermission = TimeSpan.FromSeconds(8);

    private static readonly int[] Top = [25, 20, 16, 13, 11];

    /// <summary>1º 25, 2º 20, 3º 16, 4º 13, 5º 11, 6º 10... y uno menos por puesto hasta 0.</summary>
    public static int Points(int place) => place <= 0 ? 0 : place <= Top.Length ? Top[place - 1] : Math.Max(0, 16 - place);
}

/// <summary>Puntaje acumulado de un piloto (humano o bot). Places[i] = puesto en la carrera i (0 = no corrió).</summary>
public sealed class Standing(string id, string name, int color, bool bot, int races)
{
    public string Id { get; } = id;
    public string Name { get; set; } = name;
    public int Color { get; set; } = color;
    public bool Bot { get; } = bot;
    public int Points { get; set; }
    public int[] Places { get; } = new int[races];

    /// <summary>Puesto en la última carrera que corrió (para desempatar); los que no corrieron van al final.</summary>
    public int LastPlace(int upTo)
    {
        for (var i = Math.Min(upTo, Places.Length - 1); i >= 0; i--)
            if (Places[i] > 0) return Places[i];
        return int.MaxValue;
    }

    /// <summary>Más puntos primero; empate: mejor puesto en la última carrera; luego orden de llegada al torneo.</summary>
    public static List<Standing> Rank(IEnumerable<Standing> all, int raceIndex) =>
        all.Select((s, i) => (s, i))
            .OrderByDescending(x => x.s.Points)
            .ThenBy(x => x.s.LastPlace(raceIndex))
            .ThenBy(x => x.i)
            .Select(x => x.s)
            .ToList();
}
