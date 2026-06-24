# Troubleshooting

## `doctor` zgłasza brak warstw

Uruchom:

```bash
prg-mcp setup
prg-mcp setup --profile administrative
```

## Brak wyniku zamiast danych

Puste `items` oznacza realny brak wyniku tylko przy kompletnym pokryciu zakresu. Sprawdź:

```bash
prg-mcp coverage
prg-mcp source-status
```

## `poland-full` jest odrzucany

To celowe zabezpieczenie. Najpierw użyj `administrative` albo zakresowego `addresses`. Pełny profil wymaga:

```bash
prg-mcp setup --profile poland-full --confirm-poland-full
```

## Logi w stdio psują klienta MCP

W trybie stdio stdout jest zarezerwowany dla protokołu lub JSON CLI. Logi i diagnostyka idą na stderr. Aby je wyciszyć:

```bash
MCP_LOG_LEVEL=silent prg-mcp serve
```

## Eksport geometrii jest za duży

Użyj ograniczeń eksportu:

```bash
prg-mcp export --layer A03 --id '<object-id>' --format geojson --crs EPSG:4326 --max-vertices 5000 --tolerance-meters 5
```
