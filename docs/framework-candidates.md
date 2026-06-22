# Rejestr kandydatów do MCP Craftsman

Repozytorium frameworka jest lokalnie dostępne jako `../mcp-craftman`; repozytorium upstream ma nazwę `ciembor/mcp-craftsman`. Każdy kandydat musi być neutralny domenowo, mieć drugi realistyczny przypadek użycia i nie może wymuszać migracji istniejących konsumentów w wydaniu minor/patch.

| ID | Potrzeba | Drugi przypadek użycia | Decyzja | Status / dowód |
| --- | --- | --- | --- | --- |
| FW-001 | samodzielny `tsconfig.json` generatora | dowolny serwer tworzony poza monorepo frameworka | framework | zaakceptowane; `cef432d`, test kontraktu generatora |
| FW-002 | poprawne skanowanie `src/` w teście architektury | każdy wygenerowany projekt z zagnieżdżonymi feature'ami | framework | zaakceptowane; `92b730a`, test regresji |
| FW-003 | Knip bez wyjątków dla używanych zależności | każdy projekt używający `core` i `node` | framework | zaakceptowane; `7b83045`, test regresji |
| FW-004 | coverage ograniczone do kodu aplikacji | serwery posiadające skrypty i konfiguracje w repozytorium | framework | zaakceptowane; `18ee7d7`, test regresji |
| FW-005 | timeout źródła, limit downloadu i concurrency | serwery dużych rejestrów, ale wartości i semantyka zależą od źródła | PRG MCP | odrzucone z frameworka; `PrgConfig` pozostaje domenowy |
| FW-006 | katalog 54 warstw i profile PRG | brak neutralnego drugiego zastosowania | PRG MCP | odrzucone z frameworka |

## Proces decyzji

1. Opisać problem bez nazw PRG/GUGiK i wskazać drugiego konsumenta.
2. Sprawdzić publiczne API i generatory frameworka; nie dodawać duplikatu.
3. Ocenić, czy zmiana jest poprawką frameworka, opcjonalnym rozszerzeniem czy logiką domenową.
4. Dla frameworka dodać test regresji, dokumentację i wpis changeloga.
5. Użyć nowej funkcji w PRG dopiero po kompatybilnym wydaniu, chyba że jest to jednorazowa poprawka generatora użyta przed utworzeniem plików projektu.

Rejestr jest aktualizowany przed rozpoczęciem implementacji kandydata. Brak wpisu oznacza, że zmiana nie może być wykonana w frameworku w ramach prac PRG.
