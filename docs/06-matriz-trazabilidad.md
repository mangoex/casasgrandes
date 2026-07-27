# Matriz de trazabilidad

| Objetivo | Requisito | Diseño | Escenario | Prueba | Implementación | Evidencia | Estado |
|---|---|---|---|---|---|---|---|
| OBJ-001 | PRD-FR-001 | SDD-CMP-001 | BDD-SC-001 | TDD-TC-018 | `db.js` | `npm test`: TDD-TC-018 passed | verified-local |
| OBJ-002 | PRD-FR-002 | SDD-CMP-002, ADR-001 | BDD-SC-002, BDD-SC-003 | TDD-TC-019, TDD-TC-020 | `utils/security.js`, `middleware/auth.js`, `routes/auth.js`, `public/js/app.js` | HTTP real login/cookie/me/logout passed | verified-local |
| OBJ-002 | PRD-FR-003 | SDD-CMP-003 | BDD-SC-004 | TDD-TC-021 | `public/js/security.js`, `public/js/app.js`, `server.js` | Payload HTML hostil codificado; headers añadidos | verified-local |
| OBJ-003 | PRD-FR-004 | SDD-CMP-004 | BDD-SC-005, BDD-SC-006 | TDD-TC-022, TDD-TC-023 | `utils/security.js`, `server.js`, `migrate.py`, `migrate_pg.js`, `public/index.html` | Contraseña ausente/corta rechazada; defaults ausentes | verified-local |
| OBJ-001, OBJ-002, OBJ-003 | PRD-NFR-001 | SDD-CMP-001..004 | BDD-SC-001..006 | TDD-TC-018..023 | `test/securityHardening.test.js`, `test/authSession.test.js` | `npm test`: 24/24 passed; `git diff --check`: exit 0 | Gate 4 passed |
| OBJ-002 | PRD-NFR-002 | SDD-CMP-002 | BDD-SC-002, BDD-SC-003 | TDD-TC-019, TDD-TC-020 | `middleware/auth.js`, `routes/auth.js`, `public/js/app.js` | Bearer conservado para integraciones; navegador migrado a cookie | verified-local |

## Huecos

- Pruebas con PostgreSQL real y navegador visual se ejecutarán cuando exista un entorno aislado autorizado.
- Gate 5 permanece bloqueado hasta completar autorización, privacidad, observabilidad y rollback productivo.
