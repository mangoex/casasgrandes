# Roadmap de entregas

## Incremento 1

- Objetivo: OBJ-001, OBJ-002, OBJ-003
- Requisitos: PRD-FR-001..004, PRD-NFR-001..002
- Escenarios: BDD-SC-001..006
- Pruebas: TDD-TC-018..023
- Dependencias: Node.js y validación estática; PostgreSQL real no requerido para las pruebas unitarias.
- Gate de salida: Gate 4 local

## Tareas

| Orden | Tarea | IDs | Evidencia esperada | Estado |
|---|---|---|---|---|
| 1 | Definir contrato y pruebas P0 | CHG-001, PRD-FR-001..004 | Documentos y pruebas inicialmente rojas | completed |
| 2 | Corregir arranque, sesión, XSS y contraseñas | SDD-CMP-001..004 | Código y pruebas verdes | completed |
| 3 | Validar trazabilidad y suite completa | TDD-TC-018..023 | Comandos, resultados y diff check | completed |
| 4 | Abordar autorización, transacciones y privacidad | RSK-004..006 | Incremento posterior aprobado | pending |

## Incremento 2 — CHG-002

- Objetivo: OBJ-004
- Requisitos: PRD-FR-005..008, PRD-NFR-003
- Escenarios: BDD-SC-007..012
- Pruebas: TDD-TC-024..029
- Gate de salida: Gate 4 local de autorización y revocación

| Orden | Tarea | IDs | Evidencia esperada | Estado |
|---|---|---|---|---|
| 1 | Formalizar identidad, roles y propiedad | ADR-002, PRD-FR-005..008 | Contrato trazable | completed |
| 2 | Probar denegación y revocación | TDD-TC-024..029 | Pruebas inicialmente rojas | completed |
| 3 | Implementar middleware y cierres IDOR | SDD-CMP-005..008 | Pruebas verdes | completed |
| 4 | Validar suite y readiness | OBJ-004 | EVD-001 y validación estricta | completed |

## Incremento 3 — CHG-003

| Orden | Tarea | IDs | Estado |
|---|---|---|---|
| 1 | Contrato de atomicidad y concurrencia | ADR-003, PRD-FR-009..011 | completed |
| 2 | Pruebas rojas transaccionales | TDD-TC-030..034 | completed |
| 3 | Adaptador, locks y refactor crítico | SDD-CMP-009..011 | completed |
| 4 | Simulación de fallos y gate | OBJ-005 | completed |

## Incremento 4 — CHG-004

| Orden | Tarea | IDs | Estado |
|---|---|---|---|
| 1 | Política de egreso y secretos | ADR-004, PRD-FR-012..016 | completed |
| 2 | Pruebas de privacidad | TDD-TC-035..040 | completed |
| 3 | Contextos, logs y coordinación local | SDD-CMP-012..014 | completed |
| 4 | Persistencia Outreach atómica y gate | SDD-CMP-015 | completed |

## Incremento 5 — CHG-005

| Orden | Tarea | IDs | Estado |
|---|---|---|---|
| 1 | Registrar hallazgo y decisión | RSK-008, ADR-005 | completed |
| 2 | Actualizar dependencias transitivas compatibles | SDD-CMP-016 | completed |
| 3 | Ejecutar auditoría y regresión | TDD-TC-041 | completed |

## Incremento 6 — CHG-006

| Orden | Tarea | IDs | Estado |
|---|---|---|---|
| 1 | Definir límites y confianza | ADR-006, PRD-FR-018..020 | completed |
| 2 | Probar limiter, parsers y cabeceras | TDD-TC-042..045 | completed |
| 3 | Implementar controles HTTP | SDD-CMP-017..019 | completed |
| 4 | Ejecutar regresión y gates | EVD-005 | completed |

## Incremento 7 — CHG-007

| Orden | Tarea | IDs | Estado |
|---|---|---|---|
| 1 | Formalizar unidad comercial | ADR-007, PRD-FR-021..023 | completed |
| 2 | Probar creación, conversión y edición | TDD-TC-046..049 | completed |
| 3 | Implementar transacciones y locks | SDD-CMP-020..022 | completed |
| 4 | Ejecutar regresión y gates | EVD-006 | completed |

## Incremento 8 — CHG-008

| Orden | Tarea | IDs | Estado |
|---|---|---|---|
| 1 | Formalizar salud y ciclo de vida | ADR-008, PRD-FR-024..027 | completed |
| 2 | Probar sondas, correlación y cierre | TDD-TC-050..054 | completed |
| 3 | Implementar controles operativos | SDD-CMP-023..025 | completed |
| 4 | Ejecutar regresión y gates | EVD-007 | completed |

## Incremento 9 — CHG-009

| Orden | Tarea | IDs | Estado |
|---|---|---|---|
| 1 | Formalizar precio mensual y presupuesto total | ADR-009, PRD-FR-028..031 | completed |
| 2 | Crear oráculo y pruebas inicialmente rojas | TDD-TC-055..062 | completed |
| 3 | Implementar resolvedor, snapshot, canales y UI | SDD-CMP-026..028 | completed-local |
| 4 | Ejecutar regresión, PostgreSQL aislado y gates | EVD-008 | partial-no-postgresql-browser |
