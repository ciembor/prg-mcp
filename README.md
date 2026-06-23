# PRG MCP

Serwer MCP dla Państwowego Rejestru Granic (PRG), oficjalnego rejestru Głównego Urzędu Geodezji i Kartografii.

Projekt jest na wczesnym etapie rozwoju, ale ma już publiczne narzędzia MCP dla katalogu warstw, statusu źródeł, synchronizacji, obszarów, adresów i ulic. Dane PRG nie są dołączone do pakietu; trzeba je jawnie zsynchronizować.

## Wymagania

- Node.js 22 lub nowszy;
- pnpm 10.x do pracy ze źródłami.

## Uruchomienie ze źródeł

```bash
pnpm install
pnpm quality
pnpm build
node dist/cli.js tools
```

Domyślnym transportem jest stdio. Transport HTTP można wybrać przez `MCP_TRANSPORT=http`.

Najważniejsze komendy:

```bash
prg-mcp setup
prg-mcp sync --profile administrative --mode missing
prg-mcp status
prg-mcp coverage
prg-mcp source-status
prg-mcp doctor
prg-mcp tools
prg-mcp call list_layers '{}'
prg-mcp export --layer A03 --id '<object-id>' --format geojson --crs EPSG:4326
```

`setup` pokazuje estymację transferu i miejsca na dysku oraz domyślnie zaleca mały profil `administrative`. Profil `poland-full` wymaga jawnego `--confirm-poland-full`.

Konfiguracja runtime:

- `MCP_TRANSPORT=stdio|http`, `MCP_PORT`/`PORT`, `MCP_DATA_DIR`, `MCP_CONFIG_DIR` i `MCP_LOG_LEVEL` — ustawienia wspólne MCP Craftsman;
- `PRG_SOURCE_TIMEOUT_MS` — timeout pojedynczego żądania źródłowego, domyślnie 30 sekund;
- `PRG_MAX_DOWNLOAD_BYTES` — twardy limit rozmiaru pobrania, domyślnie 4 GiB;
- `PRG_SYNC_CONCURRENCY` — liczba równoległych pobrań, domyślnie 2, maksymalnie 8.

Szczegółowe instrukcje:

- `docs/data-sync.md` — profile danych, synchronizacja i eksport;
- `docs/tools.md` — publiczne narzędzia MCP i przykłady `call`;
- `docs/intent-selection.md` — wybór narzędzia dla pytań naturalnych;
- `docs/tutorial.md` — szybka ścieżka od instalacji do pierwszego zapytania;
- `docs/troubleshooting.md` — typowe problemy i diagnostyka;
- `docs/architecture/cli-ux.md` — zasady CLI, stdio i logowania.

## Źródło danych

Dane PRG publikuje Główny Urząd Geodezji i Kartografii w serwisie [Geoportal.gov.pl](https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/). Dane nie są dołączone do pakietu npm.

## Licencja

Kod źródłowy jest dostępny na warunkach EUPL-1.2 only. Szczegóły dotyczące oprogramowania i danych znajdują się w `LICENSE` oraz `NOTICE.md`.
