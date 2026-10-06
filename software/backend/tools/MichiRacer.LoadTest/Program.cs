// Prueba de carga: crea salas, las llena de clientes SignalR (MessagePack) que conducen,
// mide la llegada de snapshots y al final muestra las métricas del servidor.
//
//   dotnet run --project tools/MichiRacer.LoadTest -- --rooms 2 --players 20 --seconds 60
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net.Http.Json;
using MichiRacer.Game.Rooms;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;

var opts = Options.Parse(args);
Console.WriteLine($"Prueba de carga → {opts.Url} · {opts.Rooms} salas × {opts.Players} pilotos · {opts.Seconds}s");

using var http = new HttpClient { BaseAddress = new Uri(opts.Url) };
var clients = new List<LoadClient>();

for (var r = 0; r < opts.Rooms; r++)
{
    var created = await http.PostAsync("/api/rooms", null);
    var code = (await created.Content.ReadFromJsonAsync<CreateRoomResponse>())!.Code;
    var roomClients = new List<LoadClient>();
    for (var p = 0; p < opts.Players; p++)
    {
        var c = new LoadClient(opts.Url, $"Carga{r}-{p}");
        await c.JoinAsync(code);
        roomClients.Add(c);
    }
    var owner = roomClients[0];
    foreach (var c in roomClients.Skip(1)) await c.Hub.InvokeAsync("SetReady", true);
    await owner.Hub.InvokeAsync("SetGridSize", opts.Players);
    await owner.Hub.InvokeAsync("StartRace");
    clients.AddRange(roomClients);
    Console.WriteLine($"  sala {code}: {roomClients.Count} pilotos en carrera");
}

// todos los clientes envían su input a 30/s, como el navegador
var clock = Stopwatch.StartNew();
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(opts.Seconds));
var seq = 0;
using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(1000.0 / 30));
var lastReport = 0L;
try
{
    while (await timer.WaitForNextTickAsync(cts.Token))
    {
        seq++;
        foreach (var c in clients) c.SendInput(seq);
        if (clock.ElapsedMilliseconds - lastReport > 5000)
        {
            lastReport = clock.ElapsedMilliseconds;
            Console.WriteLine($"  t={clock.Elapsed.TotalSeconds,5:0}s · snapshots/s por cliente ≈ {clients.Average(c => c.Rate(clock.Elapsed.TotalSeconds)):0.0}");
        }
    }
}
catch (OperationCanceledException)
{
}

var metrics = await http.GetStringAsync("/api/metrics");
var gaps = clients.SelectMany(c => c.Gaps).OrderBy(g => g).ToArray();
double Pct(double p) => gaps.Length == 0 ? 0 : gaps[(int)Math.Min(gaps.Length - 1, p * gaps.Length)];

Console.WriteLine();
Console.WriteLine("=== Resultado (cliente) ===");
Console.WriteLine($"clientes: {clients.Count} · snapshots recibidos: {clients.Sum(c => c.Snapshots)}");
Console.WriteLine($"snapshots/s por cliente: {clients.Average(c => c.Rate(clock.Elapsed.TotalSeconds)):0.0}");
Console.WriteLine($"intervalo entre snapshots: p50 {Pct(0.5):0.0} ms · p95 {Pct(0.95):0.0} ms · p99 {Pct(0.99):0.0} ms · máx {gaps.DefaultIfEmpty().Max():0.0} ms");
Console.WriteLine($"desconexiones: {clients.Count(c => c.Hub.State != HubConnectionState.Connected)}");
Console.WriteLine();
Console.WriteLine("=== /api/metrics (servidor) ===");
Console.WriteLine(metrics);

foreach (var c in clients) await c.Hub.DisposeAsync();

sealed class LoadClient
{
    public HubConnection Hub { get; }
    public int Snapshots;
    public readonly ConcurrentQueue<double> Gaps = new();
    private readonly string _name;
    private readonly Stopwatch _since = Stopwatch.StartNew();
    private double _lastAt = -1;
    private double _x;

    public LoadClient(string url, string name)
    {
        _name = name;
        Hub = new HubConnectionBuilder()
            .WithUrl($"{url}/hubs/race", o =>
            {
                o.SkipNegotiation = true;
                o.Transports = Microsoft.AspNetCore.Http.Connections.HttpTransportType.WebSockets;
            })
            .AddMessagePackProtocol()
            .Build();
        Hub.On<SnapshotDto>("Snapshot", s =>
        {
            var now = _since.Elapsed.TotalMilliseconds;
            if (_lastAt >= 0) Gaps.Enqueue(now - _lastAt);
            _lastAt = now;
            Interlocked.Increment(ref Snapshots);
            if (s.Me is { Length: > 1 } me) _x = me[1];
        });
    }

    public async Task JoinAsync(string code)
    {
        Hub.ServerTimeout = TimeSpan.FromSeconds(30);
        await Hub.StartAsync(); // SkipNegotiation requiere transporte WebSocket (por defecto en .NET)
        await Hub.InvokeAsync<JoinResponse>("JoinRoom", code, _name);
    }

    /// <summary>Conducción simple: acelerar y volver al centro de la pista.</summary>
    public void SendInput(int seq)
    {
        if (Hub.State != HubConnectionState.Connected) return;
        var steer = Math.Clamp(-_x * 2, -1, 1);
        _ = Hub.SendAsync("SendInput", seq, steer, 1);
    }

    public double Rate(double seconds) => seconds <= 0 ? 0 : Snapshots / seconds;
}

sealed record CreateRoomResponse(string Code);

sealed record Options(string Url, int Rooms, int Players, int Seconds)
{
    public static Options Parse(string[] args)
    {
        string Get(string key, string def)
        {
            var i = Array.IndexOf(args, key);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : def;
        }
        return new Options(Get("--url", "http://localhost:5080"), int.Parse(Get("--rooms", "1")), int.Parse(Get("--players", "20")), int.Parse(Get("--seconds", "30")));
    }
}
