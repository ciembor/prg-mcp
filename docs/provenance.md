# Provenance i ograniczenia źródła

PRG MCP korzysta z oficjalnych danych Głównego Urzędu Geodezji i Kartografii udostępnianych przez Geoportal.gov.pl. Dane nie są dołączone do paczki npm; użytkownik synchronizuje je jawnie do lokalnego katalogu danych.

## Źródła

| Źródło | Rola w PRG MCP |
| --- | --- |
| https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/ | opis rejestru, zakres danych, dostępność pobierania i archiwa |
| https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRG/WFS/AdministrativeBoundaries | WFS dla 52 warstw granic, obszarów i linii |
| https://mapy.geoportal.gov.pl/wss/service/PanstwowyRejestrGranic | WMS katalogu paczek PRG do pobrania |
| https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaNumeracjiAdresowej | WMS/KIUA dla adresów i lokalizacji adresowych |

Geoportal opisuje PRG jako urzędową, referencyjną bazę danych dla podziałów terytorialnych kraju oraz ewidencji miejscowości, ulic i adresów. Strona wskazuje też, że dane PRG są dostępne bezpłatnie i do dowolnego wykorzystania.

## Daty stanu

- Granice administracyjne i powierzchnie jednostek zasadniczego trójstopniowego podziału kraju są aktualizowane według stanu na 1 stycznia danego roku.
- Dane adresowe są aktualizowane bieżąco w powiązaniu ze zmianami w ewidencji miejscowości, ulic i adresów prowadzonymi przez gminy.
- Każda lokalna migawka zapisuje `stateDate`, `downloadedAt`, `checkedAt`, `etag`, `lastModified`, `sha256`, `schemaFingerprint`, `sourceUrl` i liczbę rekordów, gdy źródło je dostarcza lub importer może je wyliczyć.

## Ograniczenia interpretacji

- PRG MCP nie jest TERYT, PRNG ani EGiB. Kody TERYT, REGON, IIP i atrybuty źródłowe są zwracane tylko wtedy, gdy występują w danych PRG.
- Kod pocztowy jest atrybutem punktu adresowego PRG, nie walidacją Poczty Polskiej.
- Właściwość terytorialna jest relacją przestrzenną z lokalnej migawki danych; użytkownik powinien sprawdzić `datasetState`, `syncedAt`, `coverage` i datę stanu.
- Brak lokalnych danych nie jest pustym wynikiem. Narzędzia powinny zwracać informację o brakującym pokryciu lub komendę synchronizacji.

## Atrybuty ważności i wersji

| Atrybut kanoniczny | Znaczenie |
| --- | --- |
| `validFrom`, `validTo` | zakres ważności obiektu, jeśli źródło go podaje |
| `versionFrom`, `versionTo` | zakres wersji lub lifecycle obiektu, jeśli występuje w schemacie źródłowym |
| `stateDate` | data stanu migawki źródła lub paczki |
| `downloadedAt` | czas pobrania danych do lokalnego stagingu |
| `checkedAt` | czas ostatniego sprawdzenia metadanych źródła |

Nie należy mieszać migawek historycznych z bieżącymi po cichu. Zapytania ze `snapshot` używają wskazanej migawki albo zwracają błąd braku danych.
