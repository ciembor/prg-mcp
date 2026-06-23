# Narzędzia MCP

Wszystkie narzędzia zwracają `structuredContent`. Odczyty są read-only; `sync_data` jest jedynym publicznym narzędziem zapisu.

## Operacyjne

| Narzędzie | Kiedy używać |
| --- | --- |
| `about` | identyfikacja pakietu, repozytorium i wersji schematu |
| `health_status` | lekki health check procesu |
| `server_status` | katalog danych, pliki SQLite, FTS5/R-tree |
| `source_status` | zainstalowane pokrycie i opcjonalny status źródeł |
| `list_layers` | katalog 54 warstw i lokalna dostępność |
| `sync_data` | jawna synchronizacja profilu, warstw i zakresów TERYT |

## Obszary

| Narzędzie | Kiedy używać |
| --- | --- |
| `search_areas` | wyszukanie jednostki, sądu, urzędu lub obszaru po nazwie/kodzie |
| `get_area` | szczegóły jednego obiektu bez pełnej geometrii |
| `get_area_geometry` | kontrolowana geometria bbox/centroid/simplified w MCP |
| `locate_point` | warstwy obejmujące punkt |
| `relate_areas` | relacje przestrzenne między obiektem a wskazanymi warstwami |

## Adresy i ulice

| Narzędzie | Kiedy używać |
| --- | --- |
| `search_addresses` | geokodowanie lokalne po tekście albo polach strukturalnych |
| `get_address` | szczegóły punktu adresowego po identyfikatorze |
| `reverse_address` | najbliższe punkty adresowe wokół współrzędnych |
| `search_streets` | wyszukiwanie ulic `A08` |
| `get_street` | szczegóły i geometria ulicy |

Przykład CLI:

```bash
prg-mcp call list_layers '{}'
prg-mcp call search_areas '{"query":"Krakow","layerIds":["A03"],"limit":5}'
prg-mcp call locate_point '{"point":{"x":566000,"y":244000,"crs":"EPSG:2180"},"groups":["administrative"]}'
```
