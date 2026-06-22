# Workflow generator-first

Struktura projektu i feature'ów pozostaje zgodna z generatorami MCP Craftsman. Przed ręcznym utworzeniem artefaktu należy sprawdzić, czy framework udostępnia odpowiadającą mu komendę.

## Dostępne komendy

- nowy projekt: `mcp-craftsman init <name>`;
- nowy feature w tym repozytorium: `pnpm generate:feature -- <name>`;
- nowy feature w innym katalogu: `pnpm generate:feature -- <name> --path <path>`.

Po wygenerowaniu feature'u wolno zmieniać jego zawartość, ale zachowujemy granice warstw i rejestrację dostarczone przez framework. Nazwa uruchamianej komendy oraz wynik jej działania należą do notatki implementacyjnej feature'u lub opisu commitu.

## Procedura braku lub błędu generatora

1. Sprawdzić CLI zainstalowane w projekcie oraz źródła lokalnego frameworka w `../mcp-craftsman` (w tym środowisku repozytorium może występować jako `../mcp-craftman`).
2. Jeżeli mechanizm jest uniwersalny, wpisać go do `docs/framework-candidates.md`, zaimplementować w frameworku z testem regresji i zachowaniem kompatybilności wstecznej, a następnie ponownie użyć generatora w PRG MCP.
3. Jeżeli mechanizm jest specyficzny dla PRG albo generatora nie da się bezpiecznie rozszerzyć w bieżącym feature, zapisać odstępstwo w tabeli poniżej przed ręcznym utworzeniem plików.
4. Odstępstwo nie pozwala ominąć tablicy wykonania ani Definition of Done.

## Rejestr odstępstw

| Feature | Artefakt | Powód | Decyzja frameworkowa |
| --- | --- | --- | --- |
| — | — | Brak odstępstw | — |
