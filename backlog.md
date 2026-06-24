# PRG MCP — backlog produktu i implementacji

Stan planu: 2026-06-22. Ten dokument jest roboczą specyfikacją projektu i nie jest publikowany w repozytorium.

## 1. Cel produktu

Zbudować lokalny, read-mostly serwer MCP dla Państwowego Rejestru Granic (PRG), który:

- obejmuje wszystkie 54 warstwy PRG określone w rozporządzeniu, w tym granice administracyjne, statystyczne, specjalne i morskie, punkty adresowe oraz ulice;
- odpowiada na pytania o obszary, właściwość terytorialną, adresy i relacje przestrzenne bez wymagania znajomości WFS, GML, układów współrzędnych ani nazw pól źródłowych;
- korzysta wyłącznie z oficjalnych danych GUGiK/Geoportalu i zawsze ujawnia źródło, datę oraz zakres lokalnej migawki;
- działa deterministycznie i szybko na lokalnej bazie, a sieci używa tylko do jawnej synchronizacji i kontroli aktualności;
- nie zwraca ogromnych geometrii domyślnie i nie zalewa kontekstu modelu surowymi rekordami GIS;
- zachowuje poprzednią poprawną bazę po nieudanej lub przerwanej synchronizacji.

### Kryteria sukcesu wersji 1.0

- [x] Każda z 54 warstw ma wpis w katalogu, adapter źródłowy, kanoniczne mapowanie i co najmniej jeden test kontraktowy.
- [x] Typowe pytania o adres, odwrotne wyszukiwanie adresu, jednostki administracyjne i właściwość terytorialną mają jednoznaczną ścieżkę wyboru narzędzia.
- [x] Każdy wynik danych zawiera `source`, `datasetState`, `syncedAt` i informację, czy odpowiedź jest pełna dla żądanego obszaru.
- [x] Brak lokalnych danych nigdy nie wygląda jak pusty wynik; zwracany jest błąd z dokładnym poleceniem synchronizacji brakującego zakresu.
- [x] Zapytania bez geometrii spełniają budżety wydajności z sekcji 12 na pełnym zbiorze Polski.
- [x] Czysta instalacja npm, konfiguracja Codex/Claude Desktop/VS Code i transport stdio przechodzą smoke test.

## 2. Granice odpowiedzialności

### W zakresie

- wszystkie warstwy wymienione w załączniku do rozporządzenia PRG;
- bieżące dane PRG oraz jawnie oznaczone archiwalne migawki granic administracyjnych, jeżeli użytkownik je zainstaluje;
- geometrie punktowe, liniowe i powierzchniowe;
- identyfikatory IIP, TERYT/PRG i REGON obecne w danych źródłowych;
- wyszukiwanie opisowe, point-in-polygon, najbliższy adres, przecięcia i relacje obszarów;
- kody pocztowe występujące w PRG jako atrybut punktu adresowego.

### Poza zakresem

- PRNG, EGiB, działki, budynki, księgi wieczyste, BDOT10k i dane komercyjne;
- wyznaczanie tras, profile wysokościowe, renderowanie map i kafli;
- potwierdzanie poprawności kodu pocztowego według rejestrów Poczty Polskiej;
- edycja lub zgłaszanie zmian do PRG;
- ukryte łączenie z TERYT MCP. Powiązania są zwracane tylko wtedy, gdy występują w danych PRG.

## 3. Źródła prawdy i ustalenia projektowe

Źródła oficjalne:

- [opis PRG i sposoby pobierania](https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/);
- [rozporządzenie PRG, Dz.U. 2021 poz. 1373](https://api.sejm.gov.pl/eli/acts/DU/2021/1373/text.pdf);
- [WFS 2.0 AdministrativeBoundaries](https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRG/WFS/AdministrativeBoundaries?SERVICE=WFS&REQUEST=GetCapabilities);
- [WMS katalogu paczek PRG](https://mapy.geoportal.gov.pl/wss/service/PanstwowyRejestrGranic?SERVICE=WMS&REQUEST=GetCapabilities);
- [Krajowa Integracja Numeracji Adresowej](https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaNumeracjiAdresowej?SERVICE=WMS&REQUEST=GetCapabilities);
- [opis nowego schematu danych adresowych z 2025 r.](https://www.geoportal.gov.pl/aktualnosci/dane-adresowe-dostepne-do-pobrania-w-nowej-strukturze/).

Decyzje architektoniczne:

- Framework jest rozwijany lokalnie w `../mcp-craftsman`. Jeżeli podczas implementacji powstaje mechanizm uniwersalny dla wielu serwerów MCP, należy dodać go do frameworka zamiast utrzymywać kopię specyficzną dla PRG.
- Rozszerzenia `mcp-craftsman` muszą być wstecznie kompatybilne: istniejące publiczne API, wygenerowane projekty i serwery MCP mają nadal budować się i przechodzić testy bez wymaganych zmian. Zmiana łamiąca wymaga osobnej wersji major i nie może być warunkiem wdrożenia PRG MCP.
- Do frameworka nie trafia logika PRG, GIS ani polskich rejestrów. Kandydat musi mieć neutralny kontrakt, co najmniej drugi realistyczny przypadek użycia i testy w repozytorium frameworka.
- Jeżeli `mcp-craftsman` udostępnia komendę generującą projekt, feature, test, konfigurację lub inny wymagany artefakt, używamy tej komendy zamiast tworzyć pliki ręcznie. Generator jest źródłem obowiązującej struktury projektu.
- Ręczne tworzenie wygenerowanego normalnie artefaktu jest dopuszczalne tylko wtedy, gdy komenda nie istnieje albo ma potwierdzony błąd. Uniwersalny brak lub błąd generatora należy najpierw naprawić w `../mcp-craftsman` z zachowaniem kompatybilności wstecznej, a następnie ponownie uruchomić komendę w PRG MCP.
- Nie implementujemy ponownie rozwiązanych problemów. Jeżeli istnieje dobra, aktywnie utrzymywana biblioteka realizująca wymaganie, używamy jej zamiast tworzyć własny parser, algorytm, format lub warstwę infrastrukturalną.
- Bibliotekę oceniamy pod kątem aktualności wydań, aktywności maintainerów, bezpieczeństwa, licencji, jakości API i typów, zgodności z Node/ESM i wspieranymi systemami, wydajności, rozmiaru oraz możliwości testowania. Własna implementacja wymaga ADR pokazującego, dlaczego dostępne biblioteki nie spełniają wymagań.
- Integracje z bibliotekami zewnętrznymi pozostają za portami/adapters, gdy chroni to domenę przed niestabilnym API lub umożliwia bezpieczną wymianę zależności. Nie tworzymy jednak bezwartościowych wrapperów kopiujących całe API biblioteki.
- WFS jest źródłem 52 warstw obszarowych/liniowych. Warstwy `A07` i `A08` pochodzą z oficjalnych paczek adresowych GML/SHP.
- WMS służy wyłącznie do odkrywania aktualnych adresów paczek i kontroli katalogu. Obrazy WMS i `GetFeatureInfo` nie są bazą analityczną.
- Domyślny profil instalacji nie pobiera punktów adresowych całej Polski. Obecny plik SHP to około 868 MB po kompresji, a liczba punktów przekracza 8,5 mln.
- Synchronizacja jest jawna. `postinstall` nie pobiera gigabajtów danych.
- Baza jest local-first. Narzędzia odczytowe nie zmieniają danych i nie wykonują cichych zapytań sieciowych.
- Kanoniczny układ składowania geometrii to EPSG:2180. Publiczne API domyślnie przyjmuje i zwraca WGS84 (EPSG:4326), a techniczne wejście EPSG:2180 jest opcjonalne i jawne.
- Identyfikatory, kody TERYT i REGON są zawsze tekstem, aby zachować zera wiodące.
- Pełny identyfikator obiektu w API ma postać `{ layerId, objectId }`; sam `objectId` nie jest globalnie unikalny.
- Baza używa natywnego SQLite przez `better-sqlite3`, FTS5 do tekstu i R-tree do selekcji przestrzennej. Dostępność wymaganych rozszerzeń jest sprawdzana przy starcie.
- Geometria jest zapisywana jako WKB oraz bbox/centroid. Predykaty i upraszczanie wykonuje zweryfikowana biblioteka geometrii po ograniczeniu kandydatów indeksem R-tree.
- Adresy są dzielone na 16 shardów wojewódzkich. Pozwala to instalować wybrane regiony, aktualizować je atomowo i przeszukiwać całą Polskę bez jednej monolitycznej bazy.

## 4. Pełna macierz pokrycia PRG

Katalog warstw jest kodem domenowym, nie listą odkrytą dynamicznie w runtime. Zmiana katalogu źródłowego ma uruchamiać alarm kompatybilności.

| Grupa | Warstwy | Wymagane zachowanie |
| --- | --- | --- |
| Administracyjne i adresowe | `A00`–`A08` | wyszukiwanie, szczegóły, geometria, lokalizacja punktu; dla `A07` adresy i reverse geocoding, dla `A08` ulice |
| Statystyczne | `R01`–`R02` | wyszukiwanie, szczegóły, geometria, lokalizacja punktu |
| Sądy | `S01`–`S04` | właściwość terytorialna, wyszukiwanie i relacje |
| Prokuratury | `P01`–`P03` | właściwość terytorialna, wyszukiwanie i relacje |
| Służby i obrona cywilna | `K01`–`K13` | właściwość terytorialna, wyszukiwanie i relacje |
| Urzędy i zarządy | `U01`–`U11` | właściwość terytorialna, wyszukiwanie i relacje |
| Obszary morskie | `W01`–`W12` | wyszukiwanie, geometria i relacje; poprawna obsługa geometrii liniowych |

Pełne nazwy 54 warstw:

- `A00_Granice_panstwa`, `A01_Granice_wojewodztw`, `A02_Granice_powiatow`, `A03_Granice_gmin`, `A04_Granice_miast`, `A05_Granice_jednostek_ewidencyjnych`, `A06_Granice_obrebow_ewidencyjnych`, `A07_Punkty_adresowe`, `A08_Ulice`;
- `R01_Granice_rejonow_statystycznych`, `R02_Granice_obwodow_spisowych`;
- `S01_Sad_apelacyjny`, `S02_Sad_okregowy`, `S03_Sad_rejonowy`, `S04_Wojewodzki_sad_administracyjny`;
- `P01_Prokuratura_regionalna`, `P02_Prokuratura_okregowa`, `P03_Prokuratura_rejonowa`;
- `K01_Komenda_wojewodzka_policji`, `K02_Komenda_powiatowa_policji`, `K03_Komenda_stoleczna_policji`, `K04_Komenda_rejonowa_policji`, `K05_Komisariat_policji`, `K06_Komenda_wojewodzka_strazy_pozarnej`, `K07_Komenda_powiatowa_strazy_pozarnej`, `K08_Oddzial_strazy_granicznej`, `K09_Placowka_strazy_granicznej`, `K10_Dywizjon_strazy_granicznej`, `K11_Obszar_dzialania_szefa_obrony_cywilnej_wojewodztwa`, `K12_Obszar_dzialania_szefa_obrony_cywilnej_powiatu`, `K13_Obszar_dzialania_szefa_obrony_cywilnej_gminy`;
- `U01_Archiwum_panstwowe`, `U02_Urzad_skarbowy`, `U03_Wyspecjalizowany_urzad_skarbowy`, `U04_Urzad_celno-skarbowy`, `U05_Izba_administracji_skarbowej`, `U06_Nadlesnictwo`, `U07_Regionalna_dyrekcja_lasow_panstwowych`, `U08_Zarzad_zlewni_PGWWP`, `U09_Regionalny_zarzad_gospodarki_wodnej_PGWWP`, `U10_Urzad_morski`, `U11_Urzad_zeglugi_srodladowej`;
- `W01_Linia_podstawowa_morza_terytorialnego`, `W02_Morze_terytorialne_RP`, `W03_Morskie_wody_wewnetrzne`, `W04_Wylaczna_strefa_ekonomiczna`, `W05_Strefa_przylegla`, `W06_Morskie_linie_brzegowe`, `W07_Pas_nadbrzezny`, `W08_Pas_ochronny`, `W09_Pas_techniczny`, `W10_Reda`, `W11_Port_morski`, `W12_Przystan_morska`.

## 5. Publiczne narzędzia MCP

Każde narzędzie ma schemat wejścia i wyjścia, `structuredContent`, limit wyników, stabilne błędy i adnotacje MCP. Odczyty deklarują `readOnlyHint: true`; synchronizacja nie deklaruje odczytu.

| Narzędzie | Intencja i kontrakt |
| --- | --- |
| `about` | wersja pakietu, repozytorium, autor, wersja schematu bazy i krótkie objaśnienie zakresu PRG |
| `health_status` | tylko żywotność procesu; bez sieci i ciężkich zapytań |
| `server_status` | transport, katalog danych, wersja schematu, rozmiar baz i dostępność SQLite FTS5/R-tree |
| `source_status` | stan oficjalnych źródeł, zainstalowane warstwy/regiony, daty, hashe, kompletność i świeżość |
| `list_layers` | katalog wszystkich 54 warstw, grupa, geometria, dostępność lokalna, liczba rekordów i opis zastosowania |
| `sync_data` | `profile`, warstwy, zakres TERYT, migawka `current` albo dostępny rok archiwalny, tryb `missing/stale/force`; plan, postęp końcowy i wynik per shard |
| `search_areas` | wyszukiwanie obiektów `A00–A06`, `R`, `S`, `P`, `K`, `U`, `W` po nazwie/kodzie/warstwie; ranking i paginacja |
| `get_area` | jeden obiekt po `{layerId, objectId}`; atrybuty kanoniczne, źródłowe identyfikatory, bbox i centroid bez pełnej geometrii |
| `get_area_geometry` | kontrolowany GeoJSON z `detail=bbox|centroid|simplified`, limitem wierzchołków i jawnym CRS; pełny eksport tylko przez CLI |
| `locate_point` | warstwy obejmujące punkt, np. gmina, sąd, prokuratura, urząd skarbowy; wymagane jawne grupy albo bezpieczny domyślny profil `administrative` |
| `relate_areas` | relacje `contains/within/intersects/touches` między obiektem źródłowym a wskazanymi warstwami, po selekcji R-tree |
| `search_addresses` | tekst naturalny lub pola miejscowość/ulica/numer/kod pocztowy z zakresem przestrzennym; confidence, `matchedBy`, pełność pokrycia |
| `get_address` | jeden punkt adresowy po identyfikatorze IIP; adres, współrzędne, identyfikatory i data stanu |
| `reverse_address` | najbliższe punkty adresowe dla współrzędnych i maksymalnego promienia; odległość w metrach, bez udawania trafienia poza limitem |
| `search_streets` | wyszukiwanie ulic `A08` po nazwie i zakresie, niezależnie od punktów adresowych |
| `get_street` | szczegóły i kontrolowana geometria ulicy po `{layerId: A08, objectId}` |

Wspólne reguły kontraktów:

- [ ] `limit` domyślnie 20, maksymalnie 100; dalsze wyniki przez nieprzezroczysty, stabilny dla migawki `cursor`.
- [ ] Współrzędne wejściowe są unią `{latitude, longitude}` dla EPSG:4326 albo `{x, y, crs: "EPSG:2180"}`.
- [ ] Wynik przestrzenny zawsze podaje `crs`, a kolejność osi nie zależy od niejednoznaczności standardu WFS.
- [ ] Narzędzia obszarowe przyjmują opcjonalne `snapshot`; domyślnie używają jawnie wskazanej bieżącej migawki, a brak zainstalowanego roku nie przechodzi na inne dane po cichu.
- [ ] Wyszukiwanie rozróżnia `exact_id`, `exact_normalized`, `prefix`, `contains`, `fuzzy` i nie podnosi confidence bez uzasadnienia.
- [ ] Normalizacja obsługuje polskie znaki, wielkość liter, typowe skróty `ul.`, `al.`, `pl.`, liczby z literą/ukośnikiem i nie usuwa semantycznych części nazwy.
- [ ] Wieloznaczne zapytania zwracają kandydatów i kontekst, zamiast arbitralnie wybierać pierwszy rekord.
- [ ] Odpowiedź zawiera `coverage.complete`, `coverage.installedScopes` i `coverage.missingScopes`.
- [ ] Puste `items` oznacza rzeczywisty brak wyniku wyłącznie przy kompletnym pokryciu żądanego zakresu.
- [ ] Surowe pola źródłowe nie przeciekają do głównego kontraktu; opcjonalne `sourceProperties` jest ograniczone i udokumentowane.

## 6. Model danych i układ plików

Katalog danych:

```text
<data-dir>/
  catalog.sqlite
  boundaries.sqlite
  addresses-02.sqlite ... addresses-32.sqlite
  downloads/
  manifests/
  sync.lock
```

### `catalog.sqlite`

- `schema_metadata(version, created_at, app_version)`;
- `layers(layer_id, source_name, title_pl, category, geometry_type, source_channel)`;
- `sync_runs(id, mode, started_at, finished_at, status, error_code)`;
- `snapshots(dataset_key, scope, state_date, downloaded_at, etag, last_modified, sha256, record_count, schema_fingerprint, source_url)`;
- `installed_coverage(layer_id, scope_type, scope_code, snapshot_id, completeness)`.

### `boundaries.sqlite`

- `areas(rowid, snapshot_id, layer_id, object_id, name, normalized_name, code, iip_id, regon, valid_from, valid_to, version_from, area_m2, centroid_x, centroid_y, min_x, min_y, max_x, max_y, geometry_wkb, source_properties_json)`;
- klucz unikalny `(snapshot_id, layer_id, object_id)` oraz awaryjny, deterministyczny identyfikator z hasha, gdy źródło nie ma stabilnego ID;
- FTS5 po nazwie, kodzie i aliasach;
- R-tree po bbox;
- indeksy po `layer_id`, kodzie, IIP, REGON i datach ważności.

### `addresses-<woj>.sqlite`

- `addresses(rowid, object_id, iip_id, municipality_code, locality_id, locality_name, street_id, street_name, building_number, postal_code, x, y, valid_from, version_from, source_scope, source_properties_json)`;
- `streets(rowid, object_id, iip_id, municipality_code, locality_id, name, normalized_name, min_x, min_y, max_x, max_y, geometry_wkb, source_properties_json)`;
- FTS5 dla kanonicznego pełnego adresu, miejscowości i ulicy;
- R-tree dla punktów i geometrii ulic;
- klucze IIP/object ID oraz indeksy TERYT/SIMC/ULIC tylko wtedy, gdy dane rzeczywiście je zawierają;
- `import_batches` i przypisanie rekordów do gminy, aby aktualizacja usuwała rekordy skasowane w źródle.

### Zasady migracji

- [ ] Każda baza ma wersję schematu i wersję kanonicznego mapowania źródła.
- [ ] Migracja metadanych może być in-place; przebudowa indeksów/geometrii powstaje obok starej bazy i kończy się atomową podmianą.
- [ ] Niezgodna baza daje komunikat `prg-mcp sync --force`, nigdy przypadkowy błąd SQL.
- [ ] Aplikacja nie otwiera bazy nowszej niż wspierana wersja w trybie zapisu.

## 7. Profile danych i synchronizacja

| Profil | Zawartość | Zastosowanie |
| --- | --- | --- |
| `administrative` | `A00–A04` | mały, zalecany start; podstawowe granice i point-in-polygon |
| `administrative-history` | `A00–A04` dla wskazanego dostępnego roku | jawnie instalowane roczne migawki archiwalne |
| `cadastre-boundaries` | `A05–A06` | jednostki i obręby ewidencyjne, bez działek |
| `jurisdictions` | `R01–R02`, `S01–S04`, `P01–P03`, `K01–K13`, `U01–U11` | właściwość terytorialna |
| `maritime` | `W01–W12` | granice i obszary morskie |
| `addresses` | `A07–A08` dla podanych gmin/powiatów/województw | geokodowanie lokalne i ulice |
| `boundaries-full` | wszystkie 52 warstwy WFS | pełne obszary bez adresów |
| `poland-full` | wszystkie 54 warstwy | pełna instalacja, wymaga jawnego potwierdzenia rozmiaru |

Przepływ synchronizacji:

```text
plan -> lock -> discover source -> conditional download -> hash -> safe unzip
-> stream parse -> validate schema/CRS/records -> build staging tables/shard
-> integrity and coverage checks -> transaction/atomic rename -> manifest -> unlock
```

- [ ] `missing` instaluje wyłącznie brakujące zakresy.
- [ ] `stale` wykonuje najpierw tani check ETag/Last-Modified/katalogu i pobiera tylko zmienione źródła.
- [ ] `force` przebudowuje wskazane zakresy, nie cały zasób bez potrzeby.
- [ ] Synchronizacja adresów przyjmuje TERYT gminy, powiatu lub województwa, ale zapisuje dane do właściwego sharda wojewódzkiego.
- [ ] Nakładające się zakresy nie duplikują punktów; IIP i pochodzenie rekordu decydują o upsert.
- [ ] Poprzednia kompletna migawka pozostaje dostępna do końca walidacji nowej.
- [ ] Limit równoległych pobrań, timeout, retry z backoff i identyfikowalny `User-Agent`; brak agresywnego obciążania usług GUGiK.
- [ ] Archiwa są chronione przed zip-slip, zip bomb, nadmierną liczbą plików i fałszywym rozszerzeniem.
- [ ] Parser XML ma wyłączone DTD i encje zewnętrzne oraz limity głębokości, tekstu i liczby elementów.
- [ ] Parser jest strumieniowy; pełny plik GML ani pełna geometria kraju nie trafia do pamięci.
- [ ] Obsługiwany jest stary i nowy schemat EMUiA obecny w paczkach od listopada 2025 r.; wybór adaptera wynika z namespace/schema, nie z nazwy pliku.
- [ ] Nieznany fingerprint schematu zatrzymuje import przed podmianą bazy i daje czytelny raport różnic.
- [ ] Rekordy z błędną geometrią trafiają do raportu kwarantanny; synchronizacja nie może po cichu zgubić rekordów.

## 8. Architektura kodu z MCP Craftsman

Projekt startuje z `@mcp-craftsman/cli` i pozostaje TypeScript ESM na Node.js `>=20.19` oraz pnpm 10.

Repozytorium frameworka znajduje się w `../mcp-craftsman`. Praca przekrojowa jest wykonywana najpierw tam, wraz z testami i dokumentacją publicznego API, a PRG MCP korzysta następnie z opublikowanego lub jawnie spiętego lokalnego wydania. Nie importujemy prywatnych plików frameworka i nie obchodzimy jego granic pakietów.

```text
src/
  app.ts
  main.ts
  cli.ts
  mcp/registry.ts
  runtime/
  shared/                 # tylko stabilne prymitywy: coordinate, paging, errors
  features/
    health/
    about/
    server-status/
    source-status/
    list-layers/
    sync-data/
    search-areas/
    get-area/
    get-area-geometry/
    locate-point/
    relate-areas/
    search-addresses/
    get-address/
    reverse-address/
    search-streets/
    get-street/
```

Każdy feature ma `domain`, `application`, `application/ports`, `infrastructure`, `mcp` i publiczny `index.ts`. Zależności biegną do środka; MCP, SQLite, HTTP, ZIP/GML i system plików są adapterami.

Prace wykonujemy sekwencyjnie, feature po feature. W danym momencie tylko jeden feature może mieć status `in progress`; nie rozpoczynamy następnego, dopóki bieżący nie spełnia pełnego Definition of Done, nie przechodzi `pnpm quality` i nie jest oznaczony jako zamknięty. Wspólne zależności potrzebne bieżącemu feature'owi można rozwijać w `../mcp-craftsman`, ale są częścią zakresu jego domknięcia, a nie pretekstem do rozpoczęcia kolejnych feature'ów. Jeżeli feature jest zablokowany zewnętrznie, zapisujemy bloker i decyzję; zmiana kolejności wymaga jawnej aktualizacji backlogu.

- [ ] Registry zawiera jawną, posortowaną listę wszystkich publicznych narzędzi.
- [ ] Żaden feature nie importuje prywatnych ścieżek `@mcp-craftsman/*/src`.
- [ ] Każde rozszerzenie frameworka ma test regresji istniejących generatorów, transportów, CLI i publicznych eksportów oraz opis kompatybilności w changelogu.
- [ ] PRG MCP ma test na najstarszej wspieranej, opublikowanej wersji frameworka albo jawnie podnosi minimalną wersję minor bez zmiany istniejących kontraktów.
- [ ] Porty repozytoriów zwracają typy domenowe, nie wiersze SQLite i nie elementy XML.
- [ ] Wspólny moduł przestrzenny zawiera tylko układy współrzędnych, bbox, WKB i predykaty; semantyka warstw pozostaje w domenie PRG.
- [ ] `pnpm quality` uruchamia dependency-cruiser, TypeScript, ESLint, Knip, testy architektury, unit, contract i integration.

## 9. Backlog wykonawczy

### P0 — szkielet i decyzje techniczne

- [x] `PRG-001` Wygenerować projekt `prg-mcp` przez MCP Craftsman i zachować wzorzec feature-first z `teryt-mcp`.
- [x] `PRG-002` Ustawić metadane npm, bin `prg-mcp`, semver, licencję po weryfikacji warunków danych i zależności oraz pliki `NOTICE`/`CHANGELOG`.
- [x] `PRG-003` Dodać konfigurację runtime: transport, port, data dir, log level, timeout źródeł, maksymalny rozmiar pobrania i limit concurrency.
- [x] `PRG-004` Zrobić benchmark/ADR dla `better-sqlite3`, biblioteki WKB, `proj4` i biblioteki predykatów; potwierdzić macOS/Linux/Windows i publikację prebuildów.
- [x] `PRG-005` Zmierzyć rzeczywisty rozmiar, RAM i czas importu profili na danych z 2026 r.; wyniki zapisać w `docs/performance.md`.
- [x] `PRG-006` Prowadzić rejestr kandydatów do `../mcp-craftsman`; dla każdego uzasadnić uniwersalność, neutralny kontrakt, drugi przypadek użycia i decyzję framework vs PRG.
- [x] `PRG-007` Dla zaakceptowanego rozszerzenia frameworka dodać publiczne API, dokumentację, testy kompatybilności i release minor/patch przed przełączeniem PRG MCP na nową wersję.
- [x] `PRG-008` Uruchamiać w CI macierz regresji: pełne testy `../mcp-craftsman`, wygenerowany projekt referencyjny oraz `prg-mcp`; niedozwolone są wymagane migracje istniejących konsumentów w wydaniu minor/patch.
- [x] `PRG-009` Przed własną implementacją parsera, geometrii, CRS, WKB, ZIP, XML, SQLite, wyszukiwania lub retry przeprowadzić udokumentowany przegląd utrzymywanych bibliotek i zapisać decyzję wraz z kryteriami odrzucenia.
- [x] `PRG-010` Prowadzić tablicę wykonania z dokładnie jednym aktywnym feature'em; przejście do kolejnego jest dozwolone dopiero po odnotowaniu spełnienia Definition of Done i zamknięciu wszystkich testów oraz dokumentacji bieżącego feature'a.
- [x] `PRG-011` Przed ręcznym utworzeniem struktury lub artefaktu sprawdzić komendy `mcp-craftsman`; użyć dostępnego generatora, a brakującą uniwersalną funkcję generatora rozważyć i wdrożyć w frameworku.

### P1 — katalog i kontrakty źródeł

- [x] `PRG-101` Zaimplementować statyczny katalog 54 warstw z nazwami użytkowymi, kategorią, typem geometrii i kanałem źródłowym.
- [x] `PRG-102` Dodać canary porównujący katalog z WFS GetCapabilities i wykrywający dodane/usunięte/zmienione warstwy.
- [x] `PRG-103` Zbudować klienta WFS 2.0: capabilities, describe, paged get-feature, bbox/filter, retry, timeout i poprawna obsługa axis order.
- [x] `PRG-104` Zbudować katalog paczek z WMS PRG i walidować przekierowania wyłącznie do dozwolonych hostów GUGiK/Geoportalu.
- [x] `PRG-110` Zbudować katalog oficjalnych archiwalnych paczek granic, zachować rok/stated date i nie wywnioskowywać brakujących lat.
- [x] `PRG-105` Zebrać małe, legalne fixture dla każdego kształtu schematu warstw WFS; nie opierać CI na żywej usłudze.
- [x] `PRG-106` Udokumentować mapowanie skróconych pól WFS/SHP (`JPT_*`, `IIP_*`, `WERSJA_*`) do domeny.
- [x] `PRG-107` Porównać krajowy „adres uniwersalny”, GML EMUiA i SHP: pola, identyfikatory, geometrie, daty i możliwość obsługi `A08`; wybrać źródło kanoniczne, a pozostałe jako fallback.
- [x] `PRG-108` Przygotować fixture starego i nowego GML EMUiA oraz tabelę mapowania migracyjnego.
- [x] `PRG-109` Zdefiniować fingerprint schematu i tolerowane zmiany: kolejność/dodatkowe pole są ostrzeżeniem, brak pola krytycznego zatrzymuje import.

### P2 — trwałość, geometria i wyszukiwanie

- [x] `PRG-201` Zaimplementować tworzenie i migracje `catalog.sqlite`, `boundaries.sqlite` i shardów adresowych.
- [x] `PRG-202` Zaimplementować atomowy zapis, lock z wykrywaniem osierocenia oraz recovery po przerwanym imporcie.
- [x] `PRG-203` Zbudować strumieniowy parser GML 3.2 i adaptery EMUiA bez DTD/XXE.
- [x] `PRG-204` Zbudować bezpieczny strumieniowy reader ZIP oraz adapter SHP jako kontrolowany fallback.
- [x] `PRG-205` Zaimplementować transformacje EPSG:2180 ↔ EPSG:4326 i golden tests dla znanych punktów; jawnie testować kolejność osi.
- [x] `PRG-206` Zaimplementować WKB, bbox, centroid, R-tree i predykaty dla Point, LineString, Polygon, Multi* oraz dziur.
- [x] `PRG-207` Dodać FTS5 i ranking nazw obszarów z deterministycznym tie-breakiem.
- [x] `PRG-208` Dodać FTS5 adresów/ulic, polską normalizację i exact/prefix/contains/fuzzy z osobnymi progami.
- [x] `PRG-209` Zaimplementować opaque cursor związany z wersją migawki; zmiana migawki unieważnia cursor czytelnym błędem.

### P3 — synchronizacja i obserwowalność danych

- [x] `PRG-301` Zaimplementować planner profili, warstw i zakresów TERYT z estymacją pobrania oraz wolnego miejsca przed startem.
- [x] `PRG-302` Zaimplementować synchronizację warstw WFS do staging DB z paginacją, deduplikacją i walidacją count/coverage.
- [x] `PRG-303` Zaimplementować synchronizację adresów dla gminy/powiatu/województwa/Polski i podział do shardów.
- [x] `PRG-304` Zaimplementować tryby `missing`, `stale`, `force` i conditional requests.
- [x] `PRG-305` Zapisywać URL, ETag, Last-Modified, SHA-256, state date, czas pobrania, fingerprint, count i wersję adaptera.
- [x] `PRG-306` Walidować unikalność ID, zakres Polski, CRS, poprawność bbox, referencje adres–ulica–miejscowość i zgodność manifestu z bazą.
- [x] `PRG-307` Zapewnić rollback per shard/warstwa i raport częściowego planu bez częściowo opublikowanej migawki.
- [x] `PRG-308` Dodać status źródła bez pobierania danych oraz rozróżnić `available`, `changed`, `unavailable`, `schema_changed`, `unknown`.
- [x] `PRG-309` Dodać politykę świeżości konfigurowalną per dataset; domyślnie check po 24 h, bez automatycznego wielkiego downloadu przy starcie.
- [x] `PRG-310` Zaimplementować instalację niezmiennych migawek archiwalnych `A00–A04` bez nadpisywania danych bieżących i bez stosowania polityki stale.

### P4 — narzędzia operacyjne MCP

- [x] `PRG-401` Wdrożyć i przetestować `health_status`, `about`, `server_status`.
- [x] `PRG-402` Wdrożyć `source_status` z macierzą zainstalowanego pokrycia, nie tylko jednym boolem „database exists”.
- [x] `PRG-403` Wdrożyć `list_layers` z opisami pomagającymi modelowi wybrać właściwą warstwę.
- [x] `PRG-404` Wdrożyć `sync_data`; stabilne kody błędów dla braku miejsca, sieci, locka, schematu i walidacji.
- [x] `PRG-405` Dodać kontrakt public capabilities: output schema, test każdego toola, read-only annotations i stabilne invalid-input/unknown-tool errors.

### P5 — obszary i właściwość terytorialna

- [x] `PRG-501` Wdrożyć `search_areas` z filtrem kategorii/warstw, kodu i daty ważności.
- [x] `PRG-502` Wdrożyć `get_area` oraz spójne mapowanie atrybutów wszystkich grup warstw.
- [x] `PRG-503` Wdrożyć `get_area_geometry` z upraszczaniem w EPSG:2180, limitem wierzchołków i walidacją GeoJSON.
- [x] `PRG-504` Wdrożyć `locate_point`; ustalić i przetestować zachowanie punktu dokładnie na granicy (`covers`, nie arbitralne `contains`).
- [x] `PRG-505` Wdrożyć `relate_areas` dla powierzchni i linii, z limitem kosztu oraz odmową nieograniczonego skanu.
- [x] `PRG-506` Dodać golden queries dla gminy/powiatu/województwa, sądu, prokuratury, policji, urzędu skarbowego, nadleśnictwa i obszaru morskiego.
- [x] `PRG-507` Zwracać jawnie wszystkie nakładające się właściwości; nie zakładać, że każda warstwa tworzy rozłączny podział kraju.
- [x] `PRG-508` Dodać `snapshot` do zapytań obszarowych i testy porównania tej samej lokalizacji między dwiema zainstalowanymi migawkami administracyjnymi.

### P6 — adresy i ulice

- [x] `PRG-601` Wdrożyć `search_addresses` dla tekstu naturalnego i pól strukturalnych z walidacją wzajemnie wykluczających się wariantów wejścia.
- [x] `PRG-602` Wdrożyć `get_address` z identyfikatorem IIP, współrzędnymi, kodem pocztowym i pochodzeniem rekordu.
- [x] `PRG-603` Wdrożyć `reverse_address` przez rozszerzanie bbox w R-tree i dokładną odległość; twardy limit promienia i kandydatów.
- [x] `PRG-604` Wdrożyć `search_streets` i `get_street`, także dla ulic bez zainstalowanych punktów adresowych, jeśli źródło to umożliwia.
- [x] `PRG-605` Obsłużyć numery `12`, `12A`, `12/14`, nazwy bez ulicy, place/aleje/ronda/osiedla oraz miejscowości i ulice o powtarzalnych nazwach.
- [x] `PRG-606` Dodać golden queries z miast dużych, gmin wiejskich, nazw z diakrytyką, duplikatów, braków ulicy i punktów poza zakresem.
- [x] `PRG-607` Udokumentować, że kod pocztowy jest atrybutem PRG, a nie walidacją Poczty Polskiej.

### P7 — CLI i doświadczenie użytkownika

- [x] `PRG-701` Udostępnić `prg-mcp serve|status|tools|call|setup` z MCP Craftsman.
- [x] `PRG-702` Dodać `prg-mcp sync --profile ... --teryt ... --mode ...`, używający tego samego use case co `sync_data`.
- [x] `PRG-703` Dodać `prg-mcp coverage`, `prg-mcp source-status` i `prg-mcp doctor`.
- [x] `PRG-704` Dodać `prg-mcp export --layer --id --format geojson --crs`, aby pełna geometria nie przechodziła przez kontekst MCP.
- [x] `PRG-705` `setup` ma pokazać estymację transferu/dysku i zalecić `administrative`; `poland-full` wymaga jawnego wyboru.
- [x] `PRG-706` Opisać konfigurację Codex, Claude Desktop, VS Code i ręczny stdio/HTTP bez zakładania globalnej instalacji.
- [x] `PRG-707` Przygotować `docs/intent-selection.md` z pytaniami naturalnymi i oczekiwanym narzędziem, w tym rozróżnieniem PRG vs TERYT/PRNG/EGiB.
- [x] `PRG-708` Przygotować `docs/data-sync.md`, `docs/tools.md`, `docs/architecture/*`, tutorial i troubleshooting.
- [x] `PRG-709` Logi idą wyłącznie na stderr w stdio, nie zawierają całych rekordów/adresów i respektują `silent`.

### P8 — testy, bezpieczeństwo i wydajność

- [x] `PRG-801` Testy unit: parsery, normalizacja, ranking, CRS, WKB, predykaty, manifest, planner, migracje i błędy.
- [x] `PRG-802` Testy contract każdego toola dla sukcesu, braku wyniku, braku pokrycia, invalid input i starego cursora.
- [x] `PRG-803` Testy integration: fixture WFS/GML → sync → SQLite → MCP → stdio/HTTP roundtrip.
- [x] `PRG-804` Testy odporności: zerwane pobranie, timeout, 429/5xx, uszkodzony ZIP/XML, XXE, zip-slip, brak miejsca, równoległy sync i kill procesu.
- [x] `PRG-805` Property tests geometrii i normalizacji; fuzz parserów na ograniczonym budżecie.
- [x] `PRG-806` Nocny canary oficjalnych capabilities, schematów i przykładowych paczek; awaria źródła nie blokuje zwykłego CI.
- [x] `PRG-807` Test architektury feature boundaries, cykli, prywatnych importów i public API.
- [x] `PRG-808` Smoke test `npm pack`: czysta instalacja, setup fixture, status, search, locate, address i stdio.
- [x] `PRG-809` SBOM/audit zależności, allowlista hostów, brak dowolnych URL-i w input MCP i redakcja danych w logach.

### P9 — dokumentacja wiarygodności i wydanie

- [x] `PRG-901` Opisać provenance każdej warstwy, ograniczenia źródła, daty stanu i interpretację atrybutów ważności/wersji.
- [x] `PRG-902` Opublikować tabelę zgodności 54/54 z fixture, testem, narzędziem i źródłem.
- [x] `PRG-903` Zweryfikować licencję kodu i warunki ponownego wykorzystania danych; dodać wymagane attribution/NOTICE. Przed wydaniem wyjaśnić i uzupełnić brak pola `license` oraz tekstu licencji w publikowanych paczkach `@mcp-craftsman/*@0.2.1`.
- [x] `PRG-904` Zweryfikować binaria i prebuildy na aktualnych Node LTS dla macOS arm64/x64, Linux x64/arm64 i Windows x64.
- [x] `PRG-905` Przygotować release checklist, podpis/provenance npm, changelog, rollback i clean-install verification.
- [x] `PRG-906` Wydać najpierw `0.x` dla profilu administrative + wybranych adresów; `1.0` dopiero po spełnieniu pełnej macierzy 54/54.

## 10. Stabilne błędy

Minimalna taksonomia:

- `DATA_NOT_INSTALLED` — podaje wymagany profil/TERYT i komendę;
- `COVERAGE_INCOMPLETE` — wynik nie może zostać uznany za pełny;
- `SOURCE_UNAVAILABLE` / `SOURCE_TIMEOUT` / `SOURCE_RATE_LIMITED`;
- `SOURCE_SCHEMA_CHANGED` — zawiera fingerprint i brakujące pola krytyczne;
- `SYNC_LOCKED`, `INSUFFICIENT_DISK`, `ARCHIVE_UNSAFE`, `IMPORT_INVALID`;
- `DATABASE_INCOMPATIBLE`, `DATABASE_CORRUPT`;
- `INVALID_COORDINATE`, `UNSUPPORTED_CRS`, `QUERY_TOO_BROAD`, `GEOMETRY_TOO_LARGE`;
- `CURSOR_STALE`, `OBJECT_NOT_FOUND`, `AMBIGUOUS_IDENTIFIER`.

Komunikat może być po angielsku dla stabilności kontraktu, ale zawiera `code`, `message`, `details` i `recovery`. Testy porównują kod i strukturę, nie przypadkowy tekst biblioteki.

## 11. Macierz intencji MCP

| Pytanie użytkownika | Oczekiwana akcja |
| --- | --- |
| „W jakiej gminie leży ten punkt?” | `locate_point`, warstwa `A03` |
| „Jaki sąd rejonowy jest właściwy dla tego adresu?” | `search_addresses`, potem `locate_point` dla `S03` |
| „Znajdź gminę Wieliszew” | `search_areas` z `A03` |
| „Pokaż dane granicy gminy ...” | `get_area`, a geometria tylko na wyraźne żądanie przez `get_area_geometry` |
| „Jakie gminy przecina obszar nadleśnictwa?” | `relate_areas` z targetem `A03` |
| „Znajdź adres Marszałkowska 1 Warszawa” | `search_addresses` |
| „Co jest najbliższym adresem dla 52.23, 21.01?” | `reverse_address` |
| „Jaki jest kod TERYT Warszawy?” | wyjaśnić niejednoznaczność i skierować do TERYT MCP; PRG służy tu do obiektu przestrzennego |
| „Znajdź działkę 146501_8.0201.1” | odmowa zakresowa i wskazanie EGiB/ULDK |
| Brak danych adresowych dla województwa | `DATA_NOT_INSTALLED`, następnie jawne `sync_data` i ponowienie |

## 12. Budżety jakości i wydajności

Budżety mierzone po warm-up na referencyjnym laptopie i pełnej instalacji; benchmark zapisuje sprzęt, wersję Node i migawkę danych.

- `health_status`, `server_status`, `list_layers`: p95 < 50 ms;
- exact ID/code lookup: p95 < 50 ms;
- wyszukiwanie tekstowe top 20: p95 < 200 ms;
- `locate_point` dla maks. 10 warstw: p95 < 300 ms;
- `reverse_address` w promieniu 1 km: p95 < 200 ms;
- relacja po R-tree dla typowego obiektu: p95 < 1 s; kosztowniejsze żądania kończą się `QUERY_TOO_BROAD` z sugestią zawężenia;
- pamięć procesu bez synchronizacji < 250 MB; parser importu nie rośnie liniowo z rozmiarem źródła;
- wynik MCP standardowo < 256 KB; geometria ma osobny twardy limit;
- każda operacja musi mieć deterministyczne sortowanie.

## 13. Definition of Done dla pojedynczej funkcji

- kontrakt domenowy i Zod/JSON Schema wejścia oraz wyjścia;
- opis narzędzia pozwalający modelowi odróżnić je od sąsiednich narzędzi;
- implementacja przez port, bez zależności domeny od SQLite/HTTP/MCP;
- unit test, contract test, przypadek błędu i fixture bez żywej sieci;
- provenance, data-state i coverage w wyniku danych;
- stabilny kod błędu i recovery dla brakującego zakresu;
- limit czasu, liczby wyników, pamięci i wielkości odpowiedzi;
- dokumentacja i przykład naturalnego promptu;
- przejście `pnpm quality` i adekwatnego benchmarku.
- jeśli funkcja rozszerza `mcp-craftsman`: neutralne publiczne API, drugi przypadek użycia, testy wstecznej kompatybilności i changelog frameworka.
- wykorzystanie utrzymywanej biblioteki albo ADR uzasadniający własną implementację; zależność ma zweryfikowaną licencję, bezpieczeństwo, kompatybilność i stan utrzymania.
- feature zostaje jawnie oznaczony jako zamknięty; dopiero ten stan pozwala rozpocząć następny feature w ustalonej kolejności.
- wszystkie artefakty obsługiwane przez generatory frameworka powstały przez odpowiednie komendy; ręczne odstępstwo ma zapisane uzasadnienie.

## 14. Kolejność dostarczania

1. P0–P3: fundament, katalog 54 warstw, baza i bezpieczna synchronizacja.
2. P4–P5: operacje, warstwy administracyjne i właściwość terytorialna — pierwsze użyteczne wydanie `0.1`.
3. P6: adresy/ulice dla zakresów regionalnych — wydanie `0.2`.
4. P7–P8: pełny UX, odporność, benchmarki i paczka npm — release candidate.
5. P9 i macierz 54/54: wydanie `1.0`.

Nie deklarować pełnego pokrycia PRG przed przejściem testów wszystkich 54 warstw oraz importu obu schematów adresowych.
