# Synchronizacja danych

PRG MCP jest local-first. Narzędzia odczytowe nie pobierają danych z sieci i nie modyfikują bazy. Dane instaluje wyłącznie jawne `sync_data` albo CLI `prg-mcp sync`.

## Profile

Zalecany start:

```bash
prg-mcp setup
prg-mcp sync --profile administrative --mode missing
```

Profile:

| Profil | Zakres | Uwagi |
| --- | --- | --- |
| `administrative` | `A00-A04` | mały start dla granic i point-in-polygon |
| `administrative-history` | archiwalne `A00-A04` | wymaga `--archive-year` |
| `cadastre-boundaries` | `A05-A06` | jednostki i obręby ewidencyjne |
| `jurisdictions` | `R`, `S`, `P`, `K`, `U` | właściwość terytorialna |
| `maritime` | `W01-W12` | obszary i linie morskie |
| `addresses` | `A07-A08` | wymaga świadomego zakresu TERYT |
| `boundaries-full` | 52 warstwy WFS | bez adresów |
| `poland-full` | 54 warstwy | bardzo duży profil; `setup` wymaga `--confirm-poland-full` |

## Komendy CLI

```bash
prg-mcp sync --profile addresses --teryt 146501 --mode missing
prg-mcp sync --profile jurisdictions --mode stale
prg-mcp sync --layer A03 --layer S03 --mode force
prg-mcp source-status
prg-mcp source-status --remote
prg-mcp coverage
prg-mcp doctor
```

`missing` instaluje braki, `stale` wykonuje tani check metadanych źródła, a `force` przebudowuje wskazany zakres. Zakres TERYT może być województwem, powiatem albo gminą; dla warstw WFS zakres inny niż kraj jest normalizowany do kraju, bo źródło jest publikowane warstwowo.

## Eksport geometrii

Pełna geometria nie powinna przechodzić przez kontekst MCP. Do eksportu użyj CLI:

```bash
prg-mcp export --layer A03 --id '<object-id>' --format geojson --crs EPSG:4326
```

Opcje:

- `--snapshot-id` wymusza konkretną migawkę; bez niego CLI wybiera najnowszą zainstalowaną migawkę warstwy.
- `--max-vertices` i `--tolerance-meters` ograniczają rozmiar GeoJSON.
- `--crs EPSG:2180` zachowuje kanoniczny układ lokalny, a `EPSG:4326` zwraca GeoJSON w kolejności `[longitude, latitude]`.
