# Continuous integration

Workflow `.github/workflows/quality.yml` egzekwuje trzy poziomy kompatybilności:

1. PRG MCP na Node 22 dla Ubuntu, macOS i Windows oraz na Node 24 dla Ubuntu;
2. PRG MCP po wymuszeniu najstarszej wspieranej wersji `@mcp-craftsman/*@0.2.1`;
3. bieżący MCP Craftsman, projekt referencyjny wygenerowany jego CLI oraz PRG MCP w jednym jobie regresyjnym.

Każdy poziom wykonuje quality gate i build. Job projektu uruchamia również zbudowany bin `prg-mcp tools`, co sprawdza shebang, bundling i publiczny kontrakt CLI.

Job regresyjny pobiera framework z `ciembor/mcp-craftsman`. Zmiana frameworka wymagana przez PRG musi być najpierw zacommitowana i dostępna w tym repozytorium. Nie można wyłączyć joba przez lokalny link ani import prywatnej ścieżki.

Macierz systemów jest szczególnie istotna dla natywnego `better-sqlite3`. Node 22 jest minimalnym runtime z prebuildami na wszystkich trzech systemach; Node 24 reprezentuje nowszy LTS.
