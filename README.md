# PRG MCP

Serwer MCP dla Państwowego Rejestru Granic (PRG), oficjalnego rejestru Głównego Urzędu Geodezji i Kartografii.

Projekt jest na wczesnym etapie rozwoju. Obecne wydanie udostępnia szkielet serwera i narzędzie `health_status`. Obsługa danych PRG będzie dodawana feature po feature.

## Wymagania

- Node.js 20.19 lub nowszy;
- pnpm 10.x do pracy ze źródłami.

## Uruchomienie ze źródeł

```bash
pnpm install
pnpm quality
pnpm build
node dist/cli.js tools
```

Domyślnym transportem jest stdio. Transport HTTP można wybrać przez `MCP_TRANSPORT=http`.

## Źródło danych

Dane PRG publikuje Główny Urząd Geodezji i Kartografii w serwisie [Geoportal.gov.pl](https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/). Dane nie są dołączone do pakietu npm.

## Licencja

Kod źródłowy jest dostępny na warunkach EUPL-1.2 only. Szczegóły dotyczące oprogramowania i danych znajdują się w `LICENSE` oraz `NOTICE.md`.
