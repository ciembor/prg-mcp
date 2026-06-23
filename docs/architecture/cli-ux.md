# CLI i doświadczenie użytkownika

CLI jest cienką warstwą nad tymi samymi use case'ami, których używają narzędzia MCP. Dzięki temu `sync_data` i `prg-mcp sync` mają ten sam planner, walidację profili, zakresów TERYT i błędów.

## Komendy

- `serve`, `tools`, `call` pochodzą z MCP Craftsman.
- `status`, `setup`, `sync`, `coverage`, `source-status`, `doctor` i `export` są rozszerzeniami PRG.
- Każda komenda użytkowa wypisuje JSON na stdout.
- Diagnostyka idzie na stderr i respektuje `MCP_LOG_LEVEL=silent`.

## Stdio

W transporcie stdio stdout jest kanałem protokołu MCP. Kod PRG nie zapisuje logów ani całych rekordów na stdout. Komendy CLI mogą wypisywać JSON na stdout, bo nie uruchamiają wtedy serwera stdio.

## Dane w logach

Logi nie powinny zawierać pełnych rekordów źródłowych, pełnych adresów ani geometrii. Do diagnostyki używamy identyfikatorów warstw, scope TERYT, dataset key, statusów i kodów błędów.
