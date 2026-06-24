# Tablica wykonania

Tablica jest aktualizowana w tym samym commicie, który zamyka bieżący feature. Dokładnie jeden feature może mieć status `in_progress`.

| Feature | Status | Zakres zamknięcia |
| --- | --- | --- |
| PRG-906 | closed | staged 0.x and 1.0 release criteria documented |
| PRG-905 | closed | release checklist, npm provenance, rollback and clean-install verification |
| PRG-904 | closed | Node/platform verification matrix for macOS, Linux and Windows |
| PRG-903 | closed | code license, PRG data conditions and attribution notices |
| PRG-902 | closed | 54/54 layer coverage matrix with fixture, tool and source |
| PRG-901 | closed | provenance, source limitations, state dates and validity/version attribute interpretation |
| PRG-809 | closed | SBOM/audit entry point, host allowlist and no arbitrary URL MCP input contract |
| PRG-808 | closed | npm pack clean-install smoke for setup, tools and CLI startup |
| PRG-807 | closed | architecture boundaries, cycle, private import and public API tests |
| PRG-806 | closed | separate non-blocking nightly canary for source catalogs and fixtures |
| PRG-805 | closed | bounded geometry property and GML fuzz coverage |
| PRG-804 | closed | resilience coverage for download/source failures, unsafe archives/XML, rollback and validation errors |
| PRG-803 | closed | fixture GML to SQLite to MCP core/stdio/HTTP roundtrip |
| PRG-802 | closed | public tool contracts for success, invalid input, no-result and stale cursor behavior |
| PRG-801 | closed | unit tests for parsers, ranking, CRS, WKB, predicates, manifests, planner, migrations and errors |
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
