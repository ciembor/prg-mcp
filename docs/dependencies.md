# Polityka i przegląd zależności

Stan przeglądu: 2026-06-22. Wersje sprawdzono w rejestrze npm i oficjalnych repozytoriach projektów.

## Reguła decyzji

Używamy utrzymywanej biblioteki zamiast implementować standard, parser lub algorytm ponownie. Oceniamy datę ostatniego wydania, aktywność repozytorium, licencję, Node ESM/TypeScript, streaming, limity bezpieczeństwa, wydajność i wspierane platformy. Własna implementacja wymaga ADR z pomiarem i konkretnym brakiem istniejących bibliotek.

Zależności są przypinane lockfile. Dependabot co tydzień zgłasza aktualizacje npm i GitHub Actions. Aktualizacja nie jest automatycznie mergowana: musi przejść macierz CI i benchmark adekwatny do obszaru.

## Decyzje

| Obszar | Biblioteka / wersja podczas przeglądu | Stan | Decyzja |
| --- | --- | --- | --- |
| SQLite, FTS5, R-tree | `better-sqlite3` 12.11.1, MIT, aktualizacja 2026-06-15 | aktywnie utrzymywana, prebuildy Node 22+ | użyć; skrypt instalacyjny jako jedyny na allowliście pnpm |
| WKB | `@loaders.gl/core` i `@loaders.gl/wkt` 4.4.3, MIT, 2026-06-13 | aktywnie utrzymywane, ESM/TS, Node | użyć loadera/writera, bez własnego kodera |
| SHP/DBF | `@loaders.gl/shapefile` 4.4.3, MIT, 2026-06-13 | aktywnie utrzymywana | użyć wyłącznie jako fallback dla oficjalnych paczek SHP |
| CRS | `proj4` 2.20.9, MIT, 2026-06-08 | aktywnie utrzymywana | użyć z jawnymi definicjami i golden tests EPSG:2180/4326 |
| predykaty i simplify | moduły Turf 7.3.5, MIT, 2026-05-17 | aktywnie utrzymywane | użyć modułów per operacja; nie instalować całego `@turf/turf` |
| CSV | `csv-parse` 7.0.0, MIT, 2026-06-14 | aktywnie utrzymywana, streaming | użyć; fixture dla nieucieczonych cudzysłowów PRG |
| XML/GML | `saxes` 6.0.0, ISC, 2022-05-17 | stabilna, streaming, lecz bez nowych wydań | warunkowo użyć jako tokenizer SAX; ograniczyć DTD/encje i fuzzować; mapowanie GML pozostaje nasze |
| XML DOM | `fast-xml-parser` 5.9.3, MIT, 2026-06-19 | aktywnie utrzymywana, ale model pełnego drzewa | odrzucić dla dużych GML z powodu pamięci; dopuszczalna dla małych capabilities |
| ZIP/deflate | `fflate` 0.8.3, MIT, 2026-05-16 | aktywnie utrzymywana, streaming | użyć z własnymi limitami liczby/rozmiaru wpisów i ochroną zip-slip |
| retry/backoff | `p-retry` 8.0.0, MIT, Node >=22, 2026-03-26 | aktywnie utrzymywana | użyć dla idempotentnych GET/HEAD; statusy i Retry-After pozostają polityką adaptera |
| wyszukiwanie | SQLite FTS5 + indeksy znormalizowane | część wybranego SQLite | użyć; bez osobnego silnika i bez własnego indeksu odwróconego |

## Otwarte decyzje

- Walidacja topologiczna pełnych geometrii: rozpocząć od walidacji strukturalnej i Turf. GEOS/WASM rozważyć dopiero po fixture pokazującym niepoprawny wynik.
- Rozszerzenia fuzzy: najpierw zmierzyć FTS5/trigram i deterministyczne reguły. Nie dodawać biblioteki podobieństwa bez golden queries.
- `saxes` wymaga ponownego audytu bezpieczeństwa przed P1. Jeżeli brak utrzymania stanie się ryzykiem, zastąpić go utrzymywanym parserem strumieniowym, a nie DOM-em.

## Kryteria odrzucenia biblioteki

- brak zgodnej licencji lub brak informacji o licencji;
- brak wsparcia Node 22 ESM albo wymagany toolchain bez prebuildów na wspieranych systemach;
- konieczność wczytania całego krajowego pliku do pamięci;
- brak możliwości ustawienia limitów wejścia lub bezpiecznego przerwania;
- niewiarygodne typy, brak testów lub porzucone API z utrzymywanym zamiennikiem;
- regresja poza budżetem potwierdzona benchmarkiem.
