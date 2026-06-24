# Release checklist

## Platformy

Przed wydaniem zweryfikować:

| Platforma | Node | Status wymagany |
| --- | --- | --- |
| macOS arm64 | 22 LTS, 24 current | `pnpm install`, `pnpm quality`, `pnpm build`, `pnpm test:pack-smoke` |
| macOS x64 | 22 LTS | `pnpm install`, `pnpm quality`, `pnpm build` |
| Linux x64 | 22 LTS, 24 current | `pnpm install`, `pnpm quality`, `pnpm build`, `pnpm security:audit` |
| Linux arm64 | 22 LTS | `pnpm install`, `pnpm quality`, `pnpm build` |
| Windows x64 | 22 LTS | `pnpm install`, `pnpm quality`, `pnpm build`, `node dist/cli.js tools` |

`better-sqlite3` jest natywną zależnością. Czysta instalacja musi potwierdzić dostępność FTS5 i R-tree przez `prg-mcp status` albo `server_status`.

## Pre-release

- `git status --short` jest pusty.
- `pnpm install --frozen-lockfile` przechodzi na Node 22.
- `pnpm quality` przechodzi.
- `pnpm build` przechodzi.
- `pnpm test:pack-smoke` przechodzi.
- `PRG_DATA_DIR=/absolute/path/to/prg-data pnpm benchmark:full-poland` przechodzi na pełnej lokalnej instalacji Polski przed wydaniem `1.0`.
- `pnpm security:audit` nie zwraca high/critical bez jawnego wyjątku.
- `node dist/cli.js tools`, `setup`, `status`, `coverage` i `doctor` przechodzą na pustym katalogu danych.
- `NOTICE.md`, `LICENSE`, `README.md`, `docs/provenance.md` i `docs/layer-coverage.md` są w tarballu npm.
- Nightly canary nie pokazuje nieobsłużonej zmiany katalogu źródeł.

## Publikacja

- Wydania `0.x` mogą obejmować profil `administrative` i wybrane zakresy adresowe.
- Wydanie `1.0` jest dozwolone dopiero po spełnieniu pełnej macierzy 54/54, stabilnych kontraktów narzędzi, smoke testu czystej instalacji i opisanej wiarygodności danych.
- Tag git powinien odpowiadać wersji w `package.json`.
- Publikacja npm powinna używać provenance, gdy środowisko CI je obsługuje.

## Rollback

- Jeżeli paczka npm ma błąd krytyczny przed szerokim użyciem, oznaczyć ją jako deprecated z krótkim powodem i opublikować patch.
- Nie usuwać wydań używanych przez użytkowników, jeśli można opublikować poprawkę.
- Lokalna baza użytkownika pozostaje poza paczką npm; rollback kodu nie usuwa danych.
- Dla błędów synchronizacji zalecać przebudowę tylko dotkniętego profilu/zakresu po podłączeniu produkcyjnego runnera.
