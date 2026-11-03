# Trazabilidad — CHG-026

| Objetivo | Requisito | Diseño | Escenario | Prueba | Implementación | Evidencia | Estado |
|---|---|---|---|---|---|---|---|
| Arnés | HARNESS-REQ-001 | ADR-017 | BDD-SC-034, BDD-SC-036 | TDD-TC-122 | `features/chg008_salud.feature` | `npm run test:bdd` | propuesta |
| Arnés | HARNESS-REQ-001 | ADR-017 | BDD-SC-100, BDD-SC-103 | TDD-TC-122 | `features/chg025_contratos.feature` | `npm run test:bdd` | propuesta |
| Arnés | HARNESS-REQ-001 | ADR-017 | BDD-SC-105 (suma inválida) | TDD-TC-122 | `features/chg025_reservas.feature` | `npm run test:bdd` | propuesta |
| Arnés | HARNESS-REQ-001 | ADR-017 | BDD-SC-104 | TDD-TC-123 | `test/integration/postgres_fake_seed.test.js` | PostgreSQL 16 en CI | propuesta |
| Arnés | HARNESS-REQ-001 | ADR-017 | contrato bot | TDD-TC-121 | `docs/api/bot-v1.yaml`, `test/contract/bot_v1_openapi.test.js` | `npm run test:contract` | propuesta |

## Huecos

- El Gherkin histórico que no está en `features/` sigue siendo documentación, no una prueba.
- TDD-TC-118 y TDD-TC-123 no corren en local si no hay URL de PostgreSQL. CI sí los corre.
- Privatizar el repositorio, purgar historia, rotar el JWT y retirar los CSV reales no está hecho.
