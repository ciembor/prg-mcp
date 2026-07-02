# Tutorial

## 1. Instalacja ze źródeł

```bash
pnpm install
pnpm build
node dist/cli.js tools
```

W paczce npm używaj binarki `prg-mcp` bez zakładania instalacji globalnej:

```bash
npx prg-mcp tools
```

## 2. Plan danych

```bash
prg-mcp setup
prg-mcp coverage
```

Publiczny runner synchronizacji nie jest jeszcze spakowany. Dane muszą być przygotowane przez skonfigurowany pipeline importu albo przyszłą komendę `sync`.

Adresy będą planowane dla jawnego zakresu:

```bash
prg-mcp setup --profile addresses --teryt 146501
```

## 3. Pierwsze zapytania

```bash
prg-mcp call list_layers '{}'
prg-mcp call search_areas '{"query":"Warszawa","layerId":"A03","limit":5}'
prg-mcp call source_status '{"checkRemote":false}'
```

## 4. Konfiguracja klientów MCP

Codex, Claude Desktop i VS Code powinny uruchamiać lokalną komendę projektu albo paczki, nie wymagać globalnej instalacji:

```json
{
  "mcpServers": {
    "prg": {
      "command": "npx",
      "args": ["prg-mcp", "serve"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "MCP_DATA_DIR": "/absolute/path/to/prg-data"
      }
    }
  }
}
```

Dla pracy ze źródeł:

```json
{
  "mcpServers": {
    "prg": {
      "command": "node",
      "args": ["/absolute/path/to/prg-mcp/dist/cli.js", "serve"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "MCP_DATA_DIR": "/absolute/path/to/prg-data"
      }
    }
  }
}
```

HTTP do lokalnego testu:

```bash
MCP_TRANSPORT=http MCP_PORT=3000 prg-mcp serve
curl -s http://127.0.0.1:3000/health
```
