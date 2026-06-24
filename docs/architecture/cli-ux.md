# CLI i doświadczenie użytkownika

CLI jest cienką warstwą nad tymi samymi use case'ami, których używają narzędzia MCP. Publiczny runner synchronizacji nie jest jeszcze wystawiony; `setup` używa tego samego plannera i walidacji profili oraz zakresów TERYT.

## Komendy

- `serve`, `tools`, `call` pochodzą z MCP Craftsman.
- `status`, `setup`, `coverage`, `source-status`, `doctor` i `export` są rozszerzeniami PRG.
- Każda komenda użytkowa wypisuje JSON na stdout.
- Diagnostyka idzie na stderr i respektuje `MCP_LOG_LEVEL=silent`.

## Stdio

W transporcie stdio stdout jest kanałem protokołu MCP. Kod PRG nie zapisuje logów ani całych rekordów na stdout. Komendy CLI mogą wypisywać JSON na stdout, bo nie uruchamiają wtedy serwera stdio.

## Dane w logach

Logi nie powinny zawierać pełnych rekordów źródłowych, pełnych adresów ani geometrii. Do diagnostyki używamy identyfikatorów warstw, scope TERYT, dataset key, statusów i kodów błędów.
