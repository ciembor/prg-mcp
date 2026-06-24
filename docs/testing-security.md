# Testy, bezpieczeństwo i wydajność

Ten dokument mapuje wymagania P8 na stałe artefakty repozytorium.

| Wymaganie | Artefakty |
| --- | --- |
| `PRG-801` unit coverage | `test/unit/**`: parsery, normalizacja, ranking, CRS, WKB, predykaty, manifesty, planner, migracje i błędy |
| `PRG-802` contract tools | `test/contracts/public-capabilities.contract.test.ts`, `test/contracts/*-public-api.contract.test.ts`, `test/unit/search/opaque-cursor.test.ts` |
| `PRG-803` integration roundtrip | `test/integration/mcp-roundtrip.integration.test.ts`, `test/integration/app.smoke.test.ts` |
| `PRG-804` resilience | ZIP/XML safety tests, sync rollback tests, WFS retry/timeout tests and validation error tests |
| `PRG-805` property/fuzz | `test/unit/spatial/geometry-property.test.ts`, `test/unit/importing/gml-fuzz.test.ts` |
| `PRG-806` nightly canary | `.github/workflows/nightly-canary.yml` |
| `PRG-807` architecture | `test/architecture/project.architecture.test.ts` plus dependency-cruiser in `pnpm quality` |
| `PRG-808` npm pack smoke | `scripts/pack-smoke.mjs`, `pnpm test:pack-smoke`, quality workflow step |
| `PRG-809` security | `test/contracts/security-package.contract.test.ts`, WMS host allowlist tests, `pnpm security:audit` |

`pnpm quality` remains the normal local gate. `pnpm test:pack-smoke` performs a clean tarball install and is also run in CI after build. The nightly canary is a separate, non-blocking workflow so official source drift is visible without blocking ordinary pull requests.
