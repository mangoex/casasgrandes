# Matriz de trazabilidad

| Objetivo | Requisito | Diseño | Escenario | Prueba | Implementación | Evidencia | Estado |
|---|---|---|---|---|---|---|---|
| OBJ-001 | PRD-FR-001 | SDD-CMP-001 | BDD-SC-001 | TDD-TC-018 | `db.js` | `npm test`: TDD-TC-018 passed | verified-local |
| OBJ-002 | PRD-FR-002 | SDD-CMP-002, ADR-001 | BDD-SC-002, BDD-SC-003 | TDD-TC-019, TDD-TC-020 | `utils/security.js`, `middleware/auth.js`, `routes/auth.js`, `public/js/app.js` | HTTP real login/cookie/me/logout passed | verified-local |
| OBJ-002 | PRD-FR-003 | SDD-CMP-003 | BDD-SC-004 | TDD-TC-021 | `public/js/security.js`, `public/js/app.js`, `server.js` | Payload HTML hostil codificado; headers añadidos | verified-local |
| OBJ-003 | PRD-FR-004 | SDD-CMP-004 | BDD-SC-005, BDD-SC-006 | TDD-TC-022, TDD-TC-023 | `utils/security.js`, `server.js`, `migrate.py`, `migrate_pg.js`, `public/index.html` | Contraseña ausente/corta rechazada; defaults ausentes | verified-local |
| OBJ-001, OBJ-002, OBJ-003 | PRD-NFR-001 | SDD-CMP-001..004 | BDD-SC-001..006 | TDD-TC-018..023 | `test/securityHardening.test.js`, `test/authSession.test.js` | `npm test`: 24/24 passed; `git diff --check`: exit 0 | Gate 4 passed |
| OBJ-002 | PRD-NFR-002 | SDD-CMP-002 | BDD-SC-002, BDD-SC-003 | TDD-TC-019, TDD-TC-020 | `middleware/auth.js`, `routes/auth.js`, `public/js/app.js` | Bearer conservado para integraciones; navegador migrado a cookie | verified-local |
| OBJ-004 | PRD-FR-005 | SDD-CMP-005 | BDD-SC-007, BDD-SC-008 | TDD-TC-024 | `middleware/auth.js`, `db.js` | EVD-001: cuenta activa, versión y rol DB aprobados | verified-local |
| OBJ-004 | PRD-FR-006 | SDD-CMP-007 | BDD-SC-009, BDD-SC-010 | TDD-TC-026, TDD-TC-027 | `routes/clientes.js`, `server.js` | EVD-001: lectura, asociación y reactivación IDOR bloqueadas | verified-local |
| OBJ-004 | PRD-FR-007 | SDD-CMP-006 | BDD-SC-011 | TDD-TC-025, TDD-TC-029 | `middleware/authorization.js`, rutas API | EVD-001: matriz positiva/negativa y superficies declaradas | verified-local |
| OBJ-004 | PRD-FR-008 | SDD-CMP-005, SDD-CMP-008, ADR-002 | BDD-SC-008, BDD-SC-012 | TDD-TC-024, TDD-TC-028 | `routes/auth.js`, `server.js`, `middleware/auth.js` | EVD-001: token previo a logout rechazado | verified-local |
| OBJ-004 | PRD-NFR-003 | SDD-CMP-005..008 | BDD-SC-007..012 | TDD-TC-024..029 | Incremento CHG-002 | EVD-001: suite completa 28/28 | Gate 4 passed |
| OBJ-005 | PRD-FR-009 | SDD-CMP-009, SDD-CMP-010 | BDD-SC-013, BDD-SC-015 | TDD-TC-030, TDD-TC-031, TDD-TC-032 | `db.js`, `utils/databaseTransaction.js`, `server.js` | EVD-002: commit/rollback/fallo simulado | verified-local |
| OBJ-005 | PRD-FR-010 | SDD-CMP-010 | BDD-SC-014, BDD-SC-015 | TDD-TC-032 | inventario y producción | EVD-002: producto bloqueado antes del saldo | verified-local |
| OBJ-005 | PRD-FR-011 | SDD-CMP-011, ADR-003 | BDD-SC-016, BDD-SC-017 | TDD-TC-033 | cotizaciones y pujas | EVD-002: cotización, cliente y puja bloqueados | verified-local |
| OBJ-005 | PRD-NFR-004 | SDD-CMP-009..011 | BDD-SC-013..017 | TDD-TC-030, TDD-TC-031, TDD-TC-032, TDD-TC-033, TDD-TC-034 | Incremento CHG-003 | EVD-002: suite completa 31/31 | Gate 4 passed |

## Huecos

- Pruebas con PostgreSQL real y navegador visual se ejecutarán cuando exista un entorno aislado autorizado.
- Gate 5 permanece bloqueado hasta completar autorización, privacidad, observabilidad y rollback productivo.
- `EXC-001`: Coordinador conserva alcance comercial global hasta que exista un modelo de equipos aprobado.

## EVD-001 — Evidencia local CHG-002

- Fecha: 2026-07-27
- Comando rojo: `node --test test/authorizationHardening.test.js test/authSession.test.js`
- Resultado rojo: exit 1, 0/4 aprobadas antes de implementación.
- Comando verde: `npm test`
- Resultado verde: exit 0, 28/28 aprobadas.
- Verificación adicional: sintaxis Node y `git diff --check`, exit 0.
- Alcance no ejecutado: PostgreSQL aislado, navegador visual y producción.

## EVD-002 — Evidencia local CHG-003

- Fecha: 2026-07-27
- Comando rojo: `node --test test/transactionHardening.test.js`
- Resultado rojo: exit 1, 0/3 aprobadas.
- Comando verde: `npm test`
- Resultado verde: exit 0, 31/31 aprobadas.
- Fallo simulado: segunda escritura falla; secuencia observada `BEGIN`, escrituras, `ROLLBACK`, `RELEASE`.
- Verificación adicional: sintaxis Node, Humanio estricto y `git diff --check`.
- Alcance no ejecutado: concurrencia contra PostgreSQL real; edición completa de cotización y conversiones planificación–prospecto permanecen en backlog transaccional.
