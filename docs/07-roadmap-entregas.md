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
