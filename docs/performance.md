# Wydajność i pojemność

## Punkt odniesienia z danych PRG 2026

Pomiar wykonano 22 czerwca 2026 r. na macOS arm64. Źródłem były oficjalne pliki GUGiK dla województwa kujawsko-pomorskiego (`04`):

- `04_GraniceAdministracyjne.zip`, 12 271 036 B, zawartość GML datowana na 16 czerwca 2026 r.;
- `adruni_04.csv`, 32 804 453 B, pobrany 22 czerwca 2026 r.

Paczka granic po rozpakowaniu miała 37 938 456 B i zawierała:

| Warstwa | Rekordy | Rozmiar GML |
| --- | ---: | ---: |
| A01 województwa | 1 | 468 970 B |
| A02 powiaty | 23 | 1 986 166 B |
| A03 gminy | 144 | 4 905 742 B |
| A05 jednostki ewidencyjne | 183 | 5 607 017 B |
| A06 obręby ewidencyjne | 3764 | 24 970 561 B |

Regionalna paczka nie zawierała `A00` ani `A04`; profil produkcyjny musi uzupełnić je z WFS lub właściwej paczki krajowej i nie może zakładać stałego zestawu plików w archiwum.

## Benchmark importu pojemnościowego

Polecenie:

```bash
pnpm benchmark:prg-2026
```

Wynik referencyjny:

| Metryka | Wynik |
| --- | ---: |
| obiekty granic | 4115 |
| adresy | 395 558 |
| import granic | 596,47 ms |
| import adresów | 4147,94 ms |
| import łącznie | 4796,40 ms |
| maksymalny RSS | 97 419 264 B |
| wynikowa baza SQLite | 50 208 768 B |

SQLite miał aktywne FTS5 i R-tree. Import adresów używał strumieniowego `csv-parse`, a GML strumieniowego `saxes`. W źródłowym CSV wystąpił nieucieczony cudzysłów w nazwie ulicy, dlatego parser musi jawnie obsługiwać `relax_quotes` i zachować fixture regresyjne tego przypadku.

To jest benchmark pojemnościowy, nie produkcyjny importer. Dla granic zapisuje atrybuty i bbox wyliczony z `pos`/`posList`, ale nie zapisuje kompletnego WKB. Dla adresów zapisuje pola wyszukiwawcze i punkt R-tree z adresu uniwersalnego. P1/P2 muszą osobno zweryfikować pełne mapowanie schematu, geometrię wieloczęściową, relacje i walidację rekordów.

## Rozmiary profilu krajowego

Nagłówki oficjalnych plików sprawdzone 22 czerwca 2026 r.:

| Paczka | Rozmiar skompresowany |
| --- | ---: |
| jednostki administracyjne | 378 519 945 B |
| granice specjalne | 713 346 834 B |
| punkty adresowe SHP | 868 426 337 B |
| adres uniwersalny Polska | 116 652 122 B |
| suma transferu tych wariantów | 2 076 945 238 B |

Nie należy sumować alternatywnych formatów tego samego zbioru podczas planowania synchronizacji. Planner ma wybrać jeden kanoniczny wariant i doliczyć staging, bazę docelową oraz zapas na atomową podmianę. Przed pełnym importem wymagane jest co najmniej dwukrotne miejsce względem przewidywanej bazy plus rozmiar archiwów.

## Budżety i następne pomiary

Budżety zapytań znajdują się w backlogu. Każdy benchmark produkcyjny musi podawać commit, wersję Node, platformę, architekturę, identyfikację źródła, liczbę rekordów i peak RSS. Wyniki pełnej Polski zostaną dodane po ukończeniu kanonicznych importerów i nie będą ekstrapolowane z jednego województwa jako pomiar.
