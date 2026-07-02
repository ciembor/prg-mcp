# PRG MCP

Serwer MCP dla Panstwowego Rejestru Granic (PRG), oficjalnego rejestru
Glownego Urzedu Geodezji i Kartografii. Udostepnia lokalne dane o granicach,
wlasciwosci terytorialnej, punktach adresowych i ulicach jako narzedzia dla
asystentow oraz automatyzacji.

Obslugiwane zbiory:

- 54 warstwy PRG lacznie: 52 warstwy WFS granic i wlasciwosci
  terytorialnej oraz `A07` punkty adresowe i `A08` ulice;
- lokalne pokrycie danych, status zrodel i planowanie zakresow.

Pakiet npm: `prg-mcp`.

## Typowe Pytania

To sa najwazniejsze zastosowania serwera.

### Znalezienie jednostki administracyjnej

Prompt:

```text
Znajdz gmine Wieliszew.
```

Narzedzie: `search_areas`

Input:

```json
{
  "category": "administrative",
  "query": "Wieliszew",
  "limit": 5
}
```

Odpowiedz ma postac:

```json
{
  "areas": [
    {
      "areaId": "opaque-id",
      "category": "administrative",
      "code": "1408032",
      "layerId": "A03",
      "layerTitle": "Granice gmin",
      "name": "Gmina Wieliszew",
      "objectId": "gmina-wieliszew",
      "snapshotId": 1
    }
  ],
  "source": {
    "system": "PRG",
    "layerIds": ["A00", "A01", "A02", "A03", "A04", "A05", "A06"],
    "channels": ["wfs"]
  },
  "datasetState": "installed",
  "syncedAt": "2026-06-22T00:00:00.000Z",
  "coverage": {
    "complete": true,
    "installedScopes": ["country:PL"],
    "missingScopes": []
  }
}
```

### Sprawdzenie obszarow obejmujacych punkt

Prompt:

```text
W jakiej gminie i powiecie lezy punkt EPSG:2180 637807, 486708?
```

Narzedzie: `locate_point`

Input:

```json
{
  "category": "administrative",
  "x": 637807,
  "y": 486708,
  "limit": 10
}
```

Odpowiedz zawiera `matches` posortowane deterministycznie oraz metadane
`source`, `datasetState`, `syncedAt` i `coverage`.

### Ustalenie wlasciwosci terytorialnej

Prompt:

```text
Jaki sad rejonowy jest wlasciwy dla tego punktu?
```

Narzedzie: `locate_point`

Input:

```json
{
  "layerIds": ["S03"],
  "x": 637807,
  "y": 486708,
  "limit": 5
}
```

Dla prokuratur uzyj warstw `P01-P03`, dla policji `K01-K13`, a dla urzedow
`U01-U11`.

### Znalezienie punktu adresowego

Prompt:

```text
Znajdz adres Warszawa Zurawia 12A.
```

Narzedzie: `search_addresses`

Input:

```json
{
  "query": "Warszawa Zurawia 12A",
  "voivodeshipCodes": ["14"],
  "limit": 5
}
```

Odpowiedz ma postac:

```json
{
  "addresses": [
    {
      "addressId": "opaque-id",
      "buildingNumber": "12A",
      "localityName": "Warszawa",
      "point": [637807, 486708],
      "postalCode": "00503",
      "postalCodeNote": "postal_code_is_prg_attribute_not_postal_service_validation",
      "sourceScope": "woj:14",
      "streetName": "Zurawia",
      "voivodeshipCode": "14"
    }
  ],
  "datasetState": "installed",
  "coverage": {
    "complete": true,
    "installedScopes": ["voivodeship:14"],
    "missingScopes": []
  }
}
```

Kod pocztowy jest atrybutem punktu adresowego PRG. To nie jest walidacja
operatorska Poczty Polskiej.

### Odwrotne wyszukiwanie adresu

Prompt:

```text
Co jest najblizszym adresem dla punktu 637807, 486708?
```

Narzedzie: `reverse_address`

Input:

```json
{
  "x": 637807,
  "y": 486708,
  "radiusMeters": 1000,
  "voivodeshipCodes": ["14"],
  "limit": 5
}
```

Narzedzie ma twardy limit promienia i kandydatow. Nie udaje trafienia poza
limitem.

### Znalezienie ulicy

Prompt:

```text
Znajdz ulice Zurawia w danych PRG.
```

Narzedzie: `search_streets`

Input:

```json
{
  "query": "Zurawia",
  "voivodeshipCodes": ["14"],
  "limit": 5
}
```

Do pobrania szczegolow i geometrii ulicy sluzy `get_street`.

### Pobranie geometrii obszaru

Prompt:

```text
Pokaz geometrie gminy Wieliszew.
```

Narzedzie: `get_area_geometry`

Input:

```json
{
  "areaId": "opaque-id",
  "maxVertices": 10000,
  "toleranceMeters": 0
}
```

Odpowiedz jest w `EPSG:2180`. Dla duzych eksportow uzyj CLI `prg-mcp export`,
zamiast zalewac kontekst modelu pelna geometria.

### Brak lokalnych danych

Gdy wymagany zakres nie jest zainstalowany, narzedzia danych nie zwracaja
pustej listy. Zwracaja blad `DATA_NOT_INSTALLED` z informacja, ze ten build
nie zawiera spakowanego runnera synchronizacji, np.:

```text
PRG address data is not installed for the requested scope. Data synchronization is not packaged in this build; prepare PRG address data for voivodeship 14 with a configured import pipeline.
```

## Co Jest W PRG, A Czego Nie Ma

Ten serwer celowo trzyma sie PRG. Dlatego obsluguje oficjalne granice,
wlasciwosc terytorialna, punkty adresowe, ulice i relacje przestrzenne, ale nie
udaje uniwersalnego rejestru publicznego.

W zakresie PRG:

- granice panstwa, wojewodztw, powiatow, gmin, miast, jednostek
  ewidencyjnych i obrebow;
- obszary statystyczne, sadowe, prokuratorskie, policyjne, strazy pozarnej,
  strazy granicznej, skarbowe, lesne, wodne i morskie;
- punkty adresowe `A07` z lokalizacja w `EPSG:2180`;
- ulice `A08` i ich geometrie;
- daty stanu, wersje i atrybuty z lokalnej migawki;
- lokalne pokrycie danych i status oficjalnych zrodel.

Poza zakresem PRG:

- pelne slowniki TERYT, historia zmian TERYT i klasyfikacje statystyczne poza
  atrybutami obecnymi w PRG;
- nazwy geograficzne PRNG;
- dzialki, budynki, lokale i ksiegi wieczyste EGiB;
- walidacja kodow pocztowych Poczty Polskiej;
- trasowanie, routing i adresy spoza lokalnie zsynchronizowanego zakresu.

Do tych danych potrzebne sa inne zrodla, np. `teryt-mcp` dla TERYT, PRNG dla
nazw geograficznych, EGiB dla katastru albo osobny slownik PNA dla kodow
pocztowych.

## Narzedzia MCP

Wszystkie narzedzia zwracaja `structuredContent`. Publiczne narzedzia MCP sa
obecnie read-only. Runner synchronizacji nie jest wystawiony jako `sync_data`,
dopoki zrodla i publisher nie sa spiete produkcyjnie.

Narzedzia zwracajace dane PRG dolaczaja:

```text
source
datasetState
syncedAt
coverage
```

### Operacyjne

#### `about`

Zwraca informacje o pakiecie, autorze, repozytorium i wersji schematu.

Input:

```json
{}
```

#### `health_status`

Sprawdza, czy serwer odpowiada.

Input:

```json
{}
```

Odpowiedz:

```json
{
  "ok": true
}
```

#### `server_status`

Zwraca status runtime, katalog danych, pliki SQLite oraz dostepnosc FTS5 i
R-tree.

Input:

```json
{}
```

#### `list_layers`

Zwraca katalog 54 warstw PRG z lokalna dostepnoscia, zakresami i liczba
rekordow.

Input:

```json
{
  "limit": 100
}
```

#### `source_status`

Pokazuje zainstalowane pokrycie i opcjonalny status zrodel.

Input:

```json
{
  "checkRemote": false
}
```

Planowane tryby synchronizacji:

```text
missing  pobierz tylko brakujace zakresy
stale    pobierz nieaktualne zakresy
force    przebuduj wskazane zakresy
```

Profile planowania:

```text
administrative  podstawowe granice administracyjne
addresses       punkty adresowe i ulice dla wskazanych zakresow
boundaries-full wszystkie warstwy graniczne PRG
poland-full     pelna instalacja Polski, wymaga jawnego potwierdzenia w CLI
```

### Obszary

#### `search_areas`

Szuka jednostki, sadu, urzedu albo obszaru po nazwie, kodzie, kategorii,
warstwie, dacie waznosci i migawce.

Input:

```json
{
  "query": "Krakow",
  "category": "administrative",
  "limit": 20
}
```

#### `get_area`

Pobiera jeden obiekt PRG po `areaId`, bez pelnej geometrii.

Input:

```json
{
  "areaId": "opaque-id"
}
```

#### `get_area_geometry`

Pobiera kontrolowana geometrie GeoJSON w `EPSG:2180`.

Input:

```json
{
  "areaId": "opaque-id",
  "maxVertices": 10000,
  "toleranceMeters": 0
}
```

#### `locate_point`

Znajduje obszary pokrywajace punkt w `EPSG:2180`.

Input:

```json
{
  "x": 566000,
  "y": 244000,
  "category": "administrative",
  "limit": 20
}
```

#### `relate_areas`

Znajduje ograniczone relacje przestrzenne miedzy jednym obiektem a wskazanymi
warstwami lub kategoria.

Input:

```json
{
  "areaId": "opaque-id",
  "layerIds": ["W01"],
  "limit": 20
}
```

### Adresy i Ulice

#### `search_addresses`

Szuka punktow adresowych po tekscie naturalnym albo polach strukturalnych.
`query` i `structured` sa wzajemnie wykluczajace sie.

Input:

```json
{
  "query": "Warszawa Zurawia 12A",
  "voivodeshipCodes": ["14"],
  "limit": 20
}
```

#### `get_address`

Pobiera punkt adresowy po `addressId`.

Input:

```json
{
  "addressId": "opaque-id"
}
```

#### `reverse_address`

Szuka najblizszych punktow adresowych wokol punktu `EPSG:2180`.

Input:

```json
{
  "x": 637807,
  "y": 486708,
  "radiusMeters": 500,
  "voivodeshipCodes": ["14"],
  "limit": 10
}
```

#### `search_streets`

Szuka ulic `A08`.

Input:

```json
{
  "query": "Zurawia",
  "voivodeshipCodes": ["14"],
  "limit": 20
}
```

#### `get_street`

Pobiera szczegoly i geometrie ulicy po `streetId`.

Input:

```json
{
  "streetId": "opaque-id"
}
```

## Instalacja

Uruchomienie bez instalacji globalnej:

```bash
npx -y prg-mcp serve
```

Instalacja globalna:

```bash
npm install -g prg-mcp
prg-mcp serve
```

Wymagania:

- Node.js `>=22.0.0`;
- SQLite z FTS5 i R-tree, sprawdzane przez `server_status` albo `prg-mcp doctor`.

Dane PRG nie sa dolaczane do pakietu npm. Serwer moze odpowiedziec na status i
katalog narzedzi bez lokalnych danych, ale wyszukiwanie wymaga jawnej
synchronizacji.

## Podlaczenie Do Klienta MCP

Konfiguracja dla transportu stdio:

```json
{
  "mcpServers": {
    "prg": {
      "command": "npx",
      "args": ["-y", "prg-mcp", "serve"],
      "env": {
        "MCP_DATA_DIR": "/absolute/path/to/prg-data"
      }
    }
  }
}
```

Przy instalacji globalnej:

```json
{
  "mcpServers": {
    "prg": {
      "command": "prg-mcp",
      "args": ["serve"],
      "env": {
        "MCP_DATA_DIR": "/absolute/path/to/prg-data"
      }
    }
  }
}
```

### Codex

Codex CLI i rozszerzenie Codex dla IDE wspoldziela konfiguracje
`~/.codex/config.toml`. Plik VS Code `User/mcp.json` nie rejestruje serwera w
Codex.

Najprosciej dodac globalnie zainstalowany serwer poleceniem:

```bash
codex mcp add prg-mcp -- prg-mcp serve
```

Odpowiednik w `~/.codex/config.toml`:

```toml
[mcp_servers.prg-mcp]
command = "prg-mcp"
args = ["serve"]

[mcp_servers.prg-mcp.env]
MCP_DATA_DIR = "/absolute/path/to/prg-data"
```

Po zmianie konfiguracji uruchom nowy proces lub nowa sesje Codex i sprawdz
serwer przez `codex mcp list` albo `/mcp` w interfejsie terminalowym.

### Claude Desktop i VS Code

Claude Desktop oraz VS Code uzywaja konfiguracji `mcpServers` pokazanej wyzej.
W srodowisku, ktore czysci cache miedzy uruchomieniami, ustaw staly
`MCP_DATA_DIR`, inaczej serwer moze startowac bez lokalnych danych.

## Plan Danych

Serwer moze zwracac status bez lokalnych baz, ale wyszukiwanie i lookupy
wymagaja lokalnych plikow SQLite. Publiczny runner synchronizacji nie jest
jeszcze spakowany; `setup` zwraca estymacje i `syncAvailable: false`.

Podstawowe komendy CLI:

```bash
prg-mcp tools
prg-mcp status
prg-mcp coverage
prg-mcp source-status
prg-mcp doctor
```

Rekomendowany plan startowy:

```bash
prg-mcp setup
```

Plan adresow dla jawnego zakresu:

```bash
prg-mcp setup --profile addresses --teryt 14
```

Pelna instalacja Polski jest duza i wymaga jawnego potwierdzenia:

```bash
prg-mcp setup --profile poland-full --confirm-poland-full
```

## CLI

CLI jest pomocnicze. Pelny zestaw funkcji jest dostepny przez MCP.

```bash
prg-mcp serve
prg-mcp tools
prg-mcp setup
prg-mcp status
prg-mcp coverage
prg-mcp source-status
prg-mcp doctor
prg-mcp call list_layers '{}'
prg-mcp call search_areas '{"query":"Warszawa","category":"administrative","limit":5}'
prg-mcp call source_status '{"checkRemote":false}'
```

Eksport geometrii przez CLI:

```bash
prg-mcp export --layer A03 --id '<object-id>' --format geojson --crs EPSG:4326
```

## HTTP

HTTP jest przydatne do lokalnego testowania albo wlasnych wrapperow:

```bash
MCP_TRANSPORT=http MCP_PORT=3000 prg-mcp serve
```

Endpointy:

```text
GET  /health
POST /tools/:toolName
```

Przyklad:

```bash
curl -s http://127.0.0.1:3000/tools/search_areas \
  -H 'content-type: application/json' \
  -d '{"query":"Krakow","category":"administrative","limit":3}'
```

Odpowiedz HTTP zawiera wynik narzedzia MCP:

```json
{
  "structuredContent": {
    "areas": [],
    "datasetState": "installed",
    "coverage": {
      "complete": true,
      "installedScopes": ["country:PL"],
      "missingScopes": []
    }
  }
}
```

## Konfiguracja Runtime

```text
MCP_TRANSPORT=stdio|http   # domyslnie stdio
MCP_PORT / PORT            # domyslnie 3000 dla HTTP
MCP_DATA_DIR               # katalog baz SQLite i metadanych synchronizacji
MCP_CONFIG_DIR             # katalog konfiguracji runtime
MCP_LOG_LEVEL              # debug|info|warn|error|silent
PRG_SOURCE_TIMEOUT_MS      # timeout pojedynczego zadania zrodlowego
PRG_MAX_DOWNLOAD_BYTES     # twardy limit rozmiaru pobrania
PRG_SYNC_CONCURRENCY       # liczba rownoleglych pobran
PRG_FRESHNESS_CHECK_MS     # minimalny odstep miedzy sprawdzeniami swiezosci zrodel
```

Pliki lokalne:

```text
<data-dir>/catalog.sqlite
<data-dir>/boundaries.sqlite
<data-dir>/addresses-<woj>.sqlite
<data-dir>/*.lock
```

Nowe wydania moga zmieniac schemat SQLite. Serwer i narzedzia synchronizacji
wykrywaja stan schematu przez metadane lokalnych baz.

## Development

Dla osob rozwijajacych repozytorium:

```bash
pnpm install
pnpm build
pnpm quality
pnpm test:pack-smoke
```

Benchmark lokalny dla pelnej instalacji Polski:

```bash
PRG_DATA_DIR=/absolute/path/to/prg-data pnpm benchmark:full-poland
```

Szczegoly architektury i kontraktow:

- [docs/tools.md](docs/tools.md)
- [docs/data-sync.md](docs/data-sync.md)
- [docs/intent-selection.md](docs/intent-selection.md)
- [docs/tutorial.md](docs/tutorial.md)
- [docs/troubleshooting.md](docs/troubleshooting.md)
- [docs/provenance.md](docs/provenance.md)
- [docs/layer-coverage.md](docs/layer-coverage.md)
- [docs/release.md](docs/release.md)

## Licencja i Zrodlo Danych

Kod projektu: Copyright 2026 Maciej Ciemborowicz. Udostepniany wylacznie na
warunkach [European Union Public Licence 1.2](LICENSE) (`EUPL-1.2 only`).

Dane PRG pochodza z Glownego Urzedu Geodezji i Kartografii oraz serwisu
[Geoportal.gov.pl](https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/).
Informacje o ich pozyskiwaniu i przetwarzaniu znajduja sie w pliku
[NOTICE.md](NOTICE.md).
