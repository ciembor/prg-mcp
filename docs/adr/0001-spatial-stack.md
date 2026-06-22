# ADR 0001: lokalny stos przestrzenny

- Status: zaakceptowany
- Data: 2026-06-22

## Kontekst

PRG MCP musi przechowywać miliony punktów, indeksować tekst i bbox, transformować EPSG:2180/EPSG:4326 oraz wykonywać predykaty na geometrii OGC. Implementacja własnego SQLite, WKB, transformacji CRS lub algorytmów topologicznych byłaby kosztowna i trudna do zweryfikowania.

## Decyzja

- `better-sqlite3` 12.x: lokalny SQLite, transakcje synchroniczne, FTS5 i R-tree;
- `@loaders.gl/core` oraz `@loaders.gl/wkt` 4.x: odczyt i zapis WKB;
- `proj4` 2.x: transformacje EPSG:2180 ↔ EPSG:4326;
- modułowe pakiety Turf 7.x: point-in-polygon, intersects i upraszczanie geometrii.

Zależności są ukrywane za portami tam, gdzie domena nie powinna zależeć od ich typów. Nie tworzymy własnych zamienników tych algorytmów.

## Uzasadnienie

Wszystkie wybrane projekty są aktywnie utrzymywane i opublikowały aktualizacje w 2026 r. Mają licencje MIT, typy lub oficjalne deklaracje TypeScript i działają w Node ESM. `loaders.gl` działa w Node i udostępnia synchroniczny WKB loader. Turf publikuje małe pakiety per operacja, więc nie wymaga całego bundla.

`better-sqlite3` 12.11.1 publikuje prebuildy Node 22/24/25/26 dla macOS arm64/x64, Linux glibc i musl arm/arm64/x64 oraz Windows arm64/x64. Dlatego minimalna wersja PRG MCP to Node 22. Node 20 jest wspierany przez kod źródłowy biblioteki, ale wymaga lokalnego toolchainu i nie spełnia celu łatwej instalacji.

## Odrzucone warianty

- `sql.js`: cała baza pracuje w pamięci WASM, co nie pasuje do 8,5+ mln adresów;
- własny WKB/point-in-polygon: zbędne ryzyko poprawności i bezpieczeństwa;
- pełny `@turf/turf`: większa powierzchnia zależności niż moduły per operacja;
- `wkx`: źródło jego parsera jest wykorzystywane i utrzymywane w aktualnym `@loaders.gl/wkt`, co daje nowszy ekosystem i ESM;
- SpatiaLite/GEOS jako obowiązkowa zależność natywna: trudniejsze przenośne pakowanie; można wrócić do GEOS, jeżeli testy realnych geometrii wykażą braki Turf.

## Konsekwencje

- Instalacja `better-sqlite3` wymaga zezwolenia na jego skrypt instalacyjny; pnpm ogranicza allowlistę do tego pakietu.
- Zapytania SQLite są synchroniczne. Importy będą wykonywane poza ścieżką lekkich zapytań MCP, a kosztowne operacje mają twarde limity.
- Geometrie źródłowe muszą przejść walidację. Niepoprawne geometrie są odrzucane lub kwarantannowane przed wywołaniem predykatów.
- CI musi obejmować macOS, Linux i Windows na Node 22 oraz Linux na najnowszym LTS.

## Reprodukcja benchmarku

```bash
pnpm benchmark:stack
```

Skrypt mierzy SQLite/FTS5/R-tree, WKB, transformacje i predykaty na deterministycznym zbiorze syntetycznym. Wyniki dla rzeczywistych danych są prowadzone oddzielnie w `docs/performance.md`.

Pierwszy pomiar referencyjny (macOS arm64, Node 20.19.6 z lokalną kompilacją natywną, 100 000 operacji; 1000 zapytań SQLite):

| Operacja | Czas |
| --- | ---: |
| transakcyjny insert SQLite + FTS5 + R-tree | 615,57 ms |
| 1000 zapytań R-tree | 21,13 ms |
| 1000 zapytań FTS5 | 12,08 ms |
| dekodowanie WKB | 1930,72 ms |
| transformacja EPSG:4326 → EPSG:2180 | 237,30 ms |
| point-in-polygon | 8,26 ms |
| intersects | 136,76 ms |
| simplify | 61,51 ms |

Pomiar potwierdził obecność `ENABLE_FTS5` i `ENABLE_RTREE`. Nie jest to benchmark danych PRG ani gwarancja produkcyjnego SLA; służy do porównania stosu i jest odtwarzalny skryptem.

Źródła weryfikacji: [better-sqlite3](https://github.com/WiseLibs/better-sqlite3/releases), [WKBLoader](https://loaders.gl/docs/modules/wkt/api-reference/wkb-loader), [Proj4js](https://proj4js.org/) i [Turf](https://turfjs.org/docs/api/booleanIntersects).
