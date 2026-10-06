using MichiRacer.Game.Rooms;
using MichiRacer.Game.Sim.Tracks;
using MichiRacer.Server;
using MichiRacer.Server.Hubs;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<RoomManager>();
builder.Services.AddSingleton<ServerMetrics>();
builder.Services.AddHostedService<GameLoop>();
builder.Services
    .AddSignalR(o =>
    {
        o.EnableDetailedErrors = builder.Environment.IsDevelopment();
        o.MaximumReceiveMessageSize = 16 * 1024;
        o.MaximumParallelInvocationsPerClient = 1;
    })
    .AddMessagePackProtocol(); // binario y compacto; JSON sigue disponible para depurar (?proto=json)
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? ["http://localhost:5173"])
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));

var app = builder.Build();
app.UseCors();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

// Crear sala → código para compartir (https://.../room/PX-8820)
app.MapPost("/api/rooms", (RoomManager rooms, string? track) =>
{
    var room = rooms.Create(track ?? Tracks.Default);
    return Results.Ok(new { code = room.Code });
});

app.MapGet("/api/rooms/{code}", (string code, RoomManager rooms) =>
    rooms.Get(code) is { } room ? Results.Ok(room.State()) : Results.NotFound(new { error = "La sala no existe o ya expiró." }));

app.MapGet("/api/tracks", () => Tracks.All.Values.Select(t => new { t.Id, t.Name, t.Laps }));

app.MapGet("/api/metrics", (RoomManager rooms, ServerMetrics metrics) =>
{
    var all = rooms.All.ToList();
    return Results.Ok(new
    {
        rooms = all.Count,
        racing = all.Count(r => r.Phase == RoomPhase.Racing),
        players = all.Sum(r => r.PlayerCount),
        connected = all.Sum(r => r.ConnectedCount),
        server = metrics.Current,
    });
});

app.MapHub<RaceHub>("/hubs/race");

app.Run();
