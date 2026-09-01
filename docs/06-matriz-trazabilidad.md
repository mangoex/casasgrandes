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
| OBJ-006 | PRD-FR-012, PRD-FR-014 | SDD-CMP-012, ADR-004 | BDD-SC-018, BDD-SC-022 | TDD-TC-035 | `agentsService.js`, `server.js`, `db.js` | EVD-003: opt-in, entorno y limpieza heredada | verified-local |
| OBJ-006 | PRD-FR-013 | SDD-CMP-013 | BDD-SC-019, BDD-SC-020 | TDD-TC-036, TDD-TC-037 | `utils/aiPrivacy.js` | EVD-003: contextos sin identidad/contacto | verified-local |
| OBJ-006 | PRD-FR-015 | SDD-CMP-014 | BDD-SC-023 | TDD-TC-039 | `writeLog`, `sanitizeLogDetail` | EVD-003: redacción recursiva aprobada | verified-local |
| OBJ-006 | PRD-FR-016 | SDD-CMP-013 | BDD-SC-021 | TDD-TC-038 | `runCoordinatorAgent` | EVD-003: generación determinista local | verified-local |
| OBJ-006 | PRD-NFR-005 | SDD-CMP-012, SDD-CMP-013, SDD-CMP-014, SDD-CMP-015 | BDD-SC-018..023 | TDD-TC-035, TDD-TC-036, TDD-TC-037, TDD-TC-038, TDD-TC-039, TDD-TC-040 | CHG-004 | EVD-003: suite completa 37/37 | Gate 4 passed |
| OBJ-007 | PRD-FR-017, PRD-NFR-006 | SDD-CMP-016, ADR-005 | BDD-SC-024 | TDD-TC-041 | `package-lock.json` | EVD-004: cero vulnerabilidades y 37/37 pruebas | Gate 4 passed |
| OBJ-008 | PRD-FR-018 | SDD-CMP-017, ADR-006 | BDD-SC-025, BDD-SC-026 | TDD-TC-042, TDD-TC-043 | `utils/rateLimiter.js`, `routes/auth.js` | EVD-005: 429 antes de consulta número 11 | verified-local |
| OBJ-008 | PRD-FR-019 | SDD-CMP-018 | BDD-SC-027, BDD-SC-028 | TDD-TC-044 | `server.js` | EVD-005: parser grande detrás de autenticación | verified-local |
| OBJ-008 | PRD-FR-020, PRD-NFR-007 | SDD-CMP-019 | BDD-SC-029 | TDD-TC-045 | `utils/httpSecurity.js`, `server.js`, `.env.example` | EVD-005: cabeceras y proxy acotado | Gate 4 passed |
| OBJ-009 | PRD-FR-021 | SDD-CMP-020, ADR-007 | BDD-SC-030 | TDD-TC-046 | creación de cotización | EVD-006: un solo `tx` y locks de vínculo | verified-local |
| OBJ-009 | PRD-FR-023 | SDD-CMP-022 | BDD-SC-031 | TDD-TC-047 | conversión de planificación | EVD-006: lock y reutilización | verified-local |
| OBJ-009 | PRD-FR-022, PRD-NFR-008 | SDD-CMP-021 | BDD-SC-032, BDD-SC-033 | TDD-TC-048, TDD-TC-049 | edición e inventario | EVD-006: saldos simulados, locks ordenados y 47/47 | Gate 4 passed |
| OBJ-010 | PRD-FR-024, PRD-FR-025 | SDD-CMP-023, ADR-008 | BDD-SC-034, BDD-SC-035, BDD-SC-036 | TDD-TC-050, TDD-TC-051 | `server.js`, `db.js` | EVD-007: sondas HTTP 200/503 | verified-local |
| OBJ-010 | PRD-FR-026 | SDD-CMP-024 | BDD-SC-037 | TDD-TC-052 | `utils/observability.js`, `server.js` | EVD-007: ID y log mínimo | verified-local |
| OBJ-010 | PRD-FR-027, PRD-NFR-009 | SDD-CMP-025 | BDD-SC-038, BDD-SC-039 | TDD-TC-053, TDD-TC-054 | `utils/serverLifecycle.js`, `agentsService.js`, `db.js`, `server.js` | EVD-007: cierre idempotente y 55/55 | Gate 4 passed |
| OBJ-011 | PRD-FR-028, PRD-FR-029 | SDD-CMP-026, SDD-CMP-027, ADR-009 | BDD-SC-040, BDD-SC-041, BDD-SC-046, BDD-SC-047 | TDD-TC-055, TDD-TC-056, TDD-TC-058 | `utils/pricing.js`, `utils/monthlyPricing.js`, `pricing_reference.py`, `server.js` | EVD-008: oráculo, unidad y HTTP aprobados | verified-local |
| OBJ-011 | PRD-FR-030 | SDD-CMP-027 | BDD-SC-042, BDD-SC-043, BDD-SC-044 | TDD-TC-057, TDD-TC-058, TDD-TC-059 | `server.js`, `agentsService.js`, `public/js/app.js` | EVD-008: payload 375 rechazado; 12 meses atómicos simulados | verified-local |
| OBJ-011 | PRD-FR-031, PRD-NFR-011 | SDD-CMP-028 | BDD-SC-045 | TDD-TC-060, TDD-TC-061 | `db.js`, `server.js`, `agentsService.js`, `public/js/app.js` | EVD-008: snapshot aditivo; PostgreSQL real pendiente | implemented-tested-local |
| OBJ-011 | PRD-NFR-010 | SDD-CMP-026 | BDD-SC-040, BDD-SC-041, BDD-SC-046 | TDD-TC-055, TDD-TC-056, TDD-TC-062 | CHG-009 | EVD-008: Python 1/1, Node 65/65, npm audit 0 | Gate 4 local conditional |
| OBJ-012 | PRD-FR-032 | SDD-CMP-029, ADR-010 | BDD-SC-048..051 | TDD-TC-063..066 | `public/js/programacion-pricing.js`, `public/js/app.js`, `utils/pricing.js`, `server.js` | EVD-009: Node 104/104, Python 1/1, auditoría 0 | verified-local |
| OBJ-013 | PRD-FR-033 | SDD-CMP-030, ADR-011 | BDD-SC-052..054 | TDD-TC-067..070 | `utils/pricing.js`, `utils/monthlyPricing.js`, `server.js`, `public/js/app.js` | EVD-010: Node 104/104, Python 1/1, sintaxis y diff aprobados | verified-local |
| OBJ-014 | PRD-FR-034 | SDD-CMP-031, ADR-012 | BDD-SC-055..057 | TDD-TC-071..074 | `db.js`, `utils/pricing.js`, `utils/monthlyPricing.js`, `server.js`, `public/js/app.js` | EVD-011: Node 106/106, Python 1/1, casos 89/1089 y 1089/1089 aprobados | verified-local |

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

## EVD-003 — Evidencia local CHG-004

- Fecha: 2026-07-27
- Comando rojo: `node --test test/aiPrivacy.test.js`
- Resultado rojo: exit 1, 0/6 aprobadas antes de implementación.
- Comando verde focalizado: `node --test test/aiPrivacy.test.js`
- Resultado verde focalizado: exit 0, 6/6 aprobadas.
- Comando de regresión: `npm test` fuera del sandbox para permitir puertos HTTP locales.
- Resultado de regresión: exit 0, 37/37 aprobadas.
- Verificación adicional: sintaxis Node, Humanio estricto, política readiness y `git diff --check`.
- Alcance no ejecutado: invocación contra proveedor IA, PostgreSQL productivo, navegador visual y despliegue.

## EVD-004 — Evidencia local CHG-005

- Fecha: 2026-07-27
- Comando inicial: `npm audit --omit=dev`
- Resultado inicial: exit 1, 3 vulnerabilidades (1 crítica, 1 alta, 1 baja).
- Actualizaciones: `body-parser` 2.2.2→2.3.0, `tar` 7.5.16→7.5.22 y `undici` 6.26.0→6.28.0.
- Comando verde: `npm audit --omit=dev`
- Resultado verde: exit 0, cero vulnerabilidades.
- Regresión: `npm test`, exit 0, 37/37 aprobadas.
- Verificación adicional: sintaxis Node, Humanio estricto, política readiness y `git diff --check`.

## EVD-005 — Evidencia local CHG-006

- Fecha: 2026-07-27
- Comando rojo: `node --test test/httpHardening.test.js`
- Resultado rojo: exit 1, 0/5 aprobadas antes de implementación.
- Comando focalizado: `node --test test/httpHardening.test.js`
- Resultado focalizado: exit 0, 6/6 aprobadas, incluida ruta HTTP productiva.
- Regresión: `npm test`, exit 0, 43/43 aprobadas.
- Auditoría: `npm audit --omit=dev`, exit 0, cero vulnerabilidades.
- Verificación adicional: sintaxis Node, Humanio estricto, política readiness y `git diff --check`.
- Alcance no ejecutado: proxy y rate limiter distribuidos, navegador visual y despliegue.

## EVD-006 — Evidencia local CHG-007

- Fecha: 2026-07-27
- Comando rojo: `node --test test/commercialAtomicity.test.js`
- Resultado rojo: exit 1, 0/4 aprobadas antes de implementación.
- Comando focalizado: `node --test test/commercialAtomicity.test.js`
- Resultado focalizado: exit 0, 4/4 aprobadas.
- Regresión: `npm test`, exit 0, 47/47 aprobadas.
- Auditoría: `npm audit --omit=dev`, exit 0, cero vulnerabilidades.
- Verificación adicional: sintaxis Node, Humanio estricto, política readiness y `git diff --check`.
- Alcance no ejecutado: carrera real y rollback contra PostgreSQL aislado, navegador y despliegue.

## EVD-007 — Evidencia local CHG-008

- Fecha: 2026-07-27
- Comando rojo: `node --test test/operationalReadiness.test.js`
- Resultado rojo: exit 1, módulo operativo ausente antes de implementación.
- Comando focalizado: `node --test test/operationalReadiness.test.js` fuera del sandbox para permitir HTTP local.
- Resultado focalizado: exit 0, 8/8 aprobadas; liveness independiente, readiness 503→200 por ruta productiva y cierre DB aun con drenado fallido.
- Regresión: `npm test`, exit 0, 55/55 aprobadas.
- Auditoría: `npm audit --omit=dev`, exit 0, cero vulnerabilidades.
- Humanio estricto sobre fuente, excluyendo `.git`, `node_modules` y artefactos visuales ajenos: 0 errores, 0 advertencias.
- Política readiness: 5/5 casos aprobados; sintaxis Node y `git diff --check`: exit 0.
- Alcance no ejecutado: señal y drenado contra PostgreSQL/orquestador de staging, retención central de logs y despliegue.

## EVD-008 — Evidencia local CHG-009

- Fecha: 2026-08-27.
- RED: `node --test test/pricingDiscountBudget.test.js`, exit 1 por ausencia de `utils/monthlyPricing.js` antes de la implementación.
- Oráculo: `PYTHONPYCACHEPREFIX=/private/tmp/casasgrandes-chg009-pycache python3 -m unittest test.test_pricing_reference -v`, exit 0, 1/1.
- GREEN focalizado HTTP y unidad: `node --test test/pricingDiscountBudget.test.js test/pricingRoutes.test.js`, exit 0, 10/10.
- Regresión: `npm test`, exit 0, 65/65.
- Auditoría: `npm audit --omit=dev`, exit 0, cero vulnerabilidades.
- Sintaxis: `node --check` sobre motor, resolvedor, servidor, agentes y frontend; exit 0.
- Humanio estricto sobre espejo de fuente sin `.git`, `node_modules` ni artefactos visuales ajenos: 0 errores y 0 advertencias. La validación inicial del checkout completo detectó un falso positivo de secreto en `node_modules/simple-get/README.md`; no pertenece a la fuente del incremento.
- Política readiness: 5/5 casos del marco aprobados; `git diff --check`, exit 0.
- No ejecutado: DDL y transacciones contra PostgreSQL real aislado, navegador autenticado de escritorio/móvil, Outreach contra proveedor, despliegue, rollback o datos productivos.
- Decisión: Gate 4 local condicionado; Gate 5 producción `NOT READY`.

## EVD-009 — Evidencia local CHG-010

- Fecha: 2026-09-01.
- Pruebas focalizadas: `node --test test/programacionPricing.test.js test/pricingDiscountBudget.test.js`, exit 0, 13/13.
- Oráculo: Python `-m unittest test.test_pricing_reference -v`, exit 0, 1/1.
- Regresión: `npm test`, exit 0, 104/104.
- Auditoría: `npm audit --omit=dev`, exit 0, cero vulnerabilidades.
- Sintaxis Node y `git diff --check`: exit 0.
- Ajuste de portabilidad: la prueba de límites de endpoint normaliza CRLF para ejecutarse también en Windows.
- Pendiente al registrar esta evidencia: merge commit, push y verificación del redeploy.

## EVD-010 — Evidencia local CHG-011

- Fecha: 2026-09-01.
- Rojo controlado: las pruebas focalizadas fallaron 5 casos antes del cambio por descontar la diferencia contra catálogo del tope mensual.
- Pruebas focalizadas: `node --test test/pricingDiscountBudget.test.js test/pricingRoutes.test.js`, exit 0, 11/11.
- Oráculo: Python `-m unittest test.test_pricing_reference -v`, exit 0, 1/1.
- Regresión: `npm test`, exit 0, 104/104.
- Sintaxis Node y `git diff --check`: exit 0.
- Pendiente al registrar esta evidencia: verificación visual en navegador y despliegue.

## EVD-011 — Evidencia local CHG-012

- Fecha: 2026-09-01.
- Rojo controlado: 7 fallos focalizados confirmaron que el motor, HTTP, esquema y frontend mezclaban piso acumulado con tope.
- Pruebas focalizadas: `node --test test/pricingDiscountBudget.test.js test/pricingRoutes.test.js`, exit 0, 13/13.
- Casos de negocio: incorporado `1,089`/tope `1,089` produce saldo cero; incorporado `89`/tope `1,089` produce saldo adicional `1,000`.
- Oráculo: Python `-m unittest test.test_pricing_reference -v`, exit 0, 1/1.
- Regresión: `npm test`, exit 0, 106/106.
- Sintaxis Node, cache busting de assets y `git diff --check`: exit 0.
- Pendiente al registrar esta evidencia: verificación visual posterior al redeploy.
