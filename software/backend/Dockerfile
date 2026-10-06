# Servidor de juego Michi Racer (ASP.NET Core + SignalR).
# Build: se restaura y publica solo el proyecto del servidor (tests y prueba de carga quedan fuera).

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/MichiRacer.Game/MichiRacer.Game.csproj src/MichiRacer.Game/
COPY src/MichiRacer.Server/MichiRacer.Server.csproj src/MichiRacer.Server/
RUN dotnet restore src/MichiRacer.Server/MichiRacer.Server.csproj
COPY src/ src/
RUN dotnet publish src/MichiRacer.Server/MichiRacer.Server.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_gcServer=0
EXPOSE 8080
# la imagen base ya trae el usuario sin privilegios "app"
USER app
ENTRYPOINT ["dotnet", "MichiRacer.Server.dll"]
