# Plan — CHG-026

- Objetivo: arnés de ingeniería, sin objetivo de producto nuevo
- Requisitos: HARNESS-REQ-001
- Decisión: ADR-017
- Escenarios: BDD-SC-034, BDD-SC-036, BDD-SC-100, BDD-SC-103, BDD-SC-104, BDD-SC-105
- Pruebas: TDD-TC-121, TDD-TC-122, TDD-TC-123 y la suite ya existente
- Gate de salida: CI verde. Merge y despliegue no forman parte del gate de este cambio.

| Orden | Tarea | IDs | Evidencia esperada | Estado |
|---|---|---|---|---|
| 1 | Dejar plantillas, ADR-017 y el contrato vacío del bot | CHG-026, ADR-017 | Documentos en el PR | hecho en la rama |
| 2 | Hacer ejecutable una muestra de Gherkin ya implementado | BDD-SC-034, BDD-SC-036, BDD-SC-100, BDD-SC-103, BDD-SC-105 | `npm run test:bdd` | hecho en la rama |
| 3 | Integrar PostgreSQL 16 con semilla ficticia | TDD-TC-123, TDD-TC-118 | CI con servicio `postgres:16` | hecho en la rama |
| 4 | Validar OpenAPI y cubrir con piso modesto | TDD-TC-121 | `npm run test:contract` y `npm run test:coverage` | hecho en la rama |
| 5 | Abrir el PR sin merge | CHG-026 | URL del PR y CI | pendiente de publicación |
