# Tablica wykonania

Tablica jest aktualizowana w tym samym commicie, który zamyka bieżący feature. Dokładnie jeden feature może mieć status `in_progress`.

| Feature | Status | Zakres zamknięcia |
| --- | --- | --- |
| PRG-801 | in_progress | unit tests for parsers, ranking, CRS, WKB, predicates, manifests, planner, migrations and errors |
| PRG-709 | closed | stderr-only/silent-aware CLI diagnostics and log redaction rule |
| PRG-708 | closed | data sync, tools, architecture, tutorial and troubleshooting documentation |
| PRG-707 | closed | natural-language intent selection guide |
| PRG-706 | closed | Codex, Claude Desktop, VS Code and stdio/HTTP configuration docs |
| PRG-705 | closed | setup estimates, administrative recommendation and poland-full confirmation |
| PRG-704 | closed | CLI GeoJSON export outside MCP context |
| PRG-703 | closed | coverage, source-status and doctor CLI commands |
| PRG-702 | closed | sync CLI command backed by sync_data use case |
| PRG-701 | closed | serve/status/tools/call/setup CLI surface |
| PRG-101 | closed | statyczny katalog 54 warstw PRG |
| PRG-011 | closed | generator-first: komendy, kontrola kontraktowa i procedura odstępstwa |
| PRG-010 | closed | tablica, reguły przejścia i test kontraktowy |
| PRG-009 | closed | przegląd bibliotek i Dependabot |
| PRG-008 | closed | wieloplatformowa macierz CI |
| PRG-007 | closed | release gate frameworka |
| PRG-006 | closed | rejestr kandydatów frameworka |
| PRG-005 | closed | benchmark danych PRG 2026 |
| PRG-004 | closed | ADR stosu przestrzennego |
| PRG-003 | closed | konfiguracja runtime |
| PRG-002 | closed | pakiet, CLI i informacje prawne |
| PRG-001 | closed | wygenerowany szkielet i health feature |

## Reguły przejścia

1. Feature `in_progress` jest jedynym zakresem implementacyjnym.
2. Zależność frameworkowa wymagana do jego zamknięcia pozostaje częścią tego samego zakresu.
3. Przejście wymaga spełnionego Definition of Done, zielonego `pnpm quality`, dokumentacji i commitu.
4. W commicie zamykającym status zmienia się na `closed`, a dokładnie następny feature na `in_progress`.
5. Bloker jest opisany w tablicy. Zmiana kolejności wymaga uzasadnienia w commicie i backlogu.
6. Po zakończeniu epiku bez rozpoczęcia następnego zadania aktywnym wpisem jest pierwszy feature kolejnego epiku; nie pozostawiamy ukrytej pracy.
