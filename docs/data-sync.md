# Synchronizacja danych

PRG MCP jest local-first. Narzędzia odczytowe nie pobierają danych z sieci i nie modyfikują bazy.

W tej paczce publiczny runner synchronizacji nie jest jeszcze wystawiony. `setup`, `coverage`, `source-status` i planner synchronizacji opisują zakresy i wymagania, ale nie wykonują pobierania danych bez skonfigurowanego runnera źródłowego.

## Profile

Zalecany start:

```bash
prg-mcp setup
```

Profile:

| Profil | Zakres | Uwagi |
| --- | --- | --- |
| `administrative` | `A00-A06` | mały start dla granic i point-in-polygon |
| `administrative-history` | archiwalne `A00-A04` | wymaga `--archive-year` |
| `cadastre-boundaries` | `A05-A06` | jednostki i obręby ewidencyjne |
| `jurisdictions` | `R`, `S`, `P`, `K`, `U` | właściwość terytorialna |
| `maritime` | `W01-W12` | obszary i linie morskie |
| `addresses` | `A07-A08` | wymaga świadomego zakresu TERYT |
| `boundaries-full` | 52 warstwy WFS | bez adresów |
| `poland-full` | 54 warstwy | bardzo duży profil; `setup` wymaga `--confirm-poland-full` |

## Planowane komendy runnera

Runner produkcyjny musi zostać podłączony przed przywróceniem publicznej komendy `prg-mcp sync`.

Planowane tryby to `missing`, `stale` i `force`. Zakres TERYT może być województwem, powiatem albo gminą; dla warstw WFS zakres inny niż kraj jest normalizowany do kraju, bo źródło jest publikowane warstwowo.

## Eksport geometrii

Pełna geometria nie powinna przechodzić przez kontekst MCP. Do eksportu użyj CLI:

```bash
prg-mcp export --layer A03 --id '<object-id>' --format geojson --crs EPSG:4326
```

Opcje:

- `--snapshot-id` wymusza konkretną migawkę; bez niego CLI wybiera najnowszą zainstalowaną migawkę warstwy.
- `--max-vertices` i `--tolerance-meters` ograniczają rozmiar GeoJSON.
- `--crs EPSG:2180` zachowuje kanoniczny układ lokalny, a `EPSG:4326` zwraca GeoJSON w kolejności `[longitude, latitude]`.
