# Rozwój MCP Craftsman z PRG MCP

## Granice

Framework znajduje się lokalnie w `../mcp-craftman`, a upstream w `ciembor/mcp-craftsman`. PRG może proponować zmianę frameworka wyłącznie po wpisaniu jej do `framework-candidates.md`.

## Wymagania kompatybilnego rozszerzenia

1. Neutralny kontrakt i co najmniej dwóch realistycznych konsumentów.
2. Publiczny eksport z właściwego root package; zakaz importów z `src/` konsumenta.
3. Testy unit, architektury, publicznych eksportów i istniejących generatorów/transportów zależnie od zakresu.
4. Test aktualnego wygenerowanego projektu oraz projektu używającego najstarszej wspieranej wersji.
5. Dokumentacja publicznego API i wpis w changelogu frameworka.
6. Brak wymaganej migracji w minor/patch. Zmiana łamiąca trafia wyłącznie do major.
7. Wydanie minor/patch przed zmianą zależności PRG na nowe API.

## Release gate

PRG nie może zależeć od nieopublikowanego publicznego API frameworka w commicie przeznaczonym do wydania. Lokalny link jest dozwolony podczas developmentu i testów macierzy, ale lockfile wydania musi wskazywać opublikowaną wersję.

Poprawki generatora zastosowane jednorazowo przed utworzeniem plików PRG nie tworzą zależności runtime. Commity `cef432d`, `92b730a`, `7b83045` i `18ee7d7` należą do tej kategorii. Ich publikacja jest zalecana dla kolejnych projektów, ale PRG runtime nadal działa z opublikowanym `@mcp-craftsman/*@0.2.1`.

Publikacja npm nie jest wykonywana automatycznie w ramach pracy nad PRG. Wymaga jawnej autoryzacji właściciela, czystego worktree frameworka, pełnego quality gate i release checklist.
