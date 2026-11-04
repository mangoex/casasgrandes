# Plan — CHG-027

- Objetivo: OBJ-023
- Requisitos: PRD-FR-060, PRD-FR-061, PRD-FR-062, PRD-NFR-013
- Decisión: ADR-018, ADR-019
- Escenarios: BDD-SC-107..118, BDD-SC-122..125
- Pruebas: TDD-TC-121, TDD-TC-124..130 y TDD-TC-134
- Gate de salida: CI verde de la implementación. Merge y despliegue esperan un sí explícito del propietario.

| Orden | Tarea | IDs | Evidencia esperada | Estado |
|---|---|---|---|---|
| 1 | Cerrar historia, requisito, contrato y ADR | CHG-027, ADR-018, ADR-019 | Paquete en `docs/cambios/CHG-027` y `docs/api/bot-v1.yaml` | hecho en la rama |
| 2 | Publicar Gherkin omitido y la lista TDD | BDD-SC-107..118, TDD-TC-124..130 | `npm run test:bdd` en verde con escenarios skipped | hecho en la rama |
| 3 | Ajustar el lint del contrato sin montar rutas | TDD-TC-121 | `npm run lint:openapi` y 404 en Express | hecho en la rama |
| 4 | Confirmar la lista del registro de decisiones | CHG-027 | C-01..C-12 aceptadas como estaban recomendadas | hecho |
| 5 | Escribir TDD-TC-124..130 en rojo y quitar `@no-implementado` al implementar | BDD-SC-107..118, BDD-SC-122..124 | Fallo 404 y luego verde | hecho en la rama |
| 6 | Corte A: tablas, hash, alta, revocación, alcance, rol, límite, errores y auditoría | PRD-FR-060, PRD-NFR-013, SDD-DB-020, SDD-CMP-052 | Pruebas de clave y auditoría en verde | hecho en la rama |
| 7 | Corte B: salud montada y tres lecturas de inventario | PRD-FR-061, PRD-FR-062, SDD-CMP-053 | Pruebas de disponible, vistas y redacción en verde | hecho en la rama |
| 8 | CI completo del comportamiento | lint, suite, BDD, cobertura, contrato, secretos, dependencias | Corrida de la rama | en el pull request |
| 9 | Merge y despliegue | CHG-027 | Sí explícito del propietario | fuera de este paquete |

## Cortes

El corte A se implementa antes que el B y los dos permanecen en CHG-027. El B no se fusiona solo: sin las claves no hay forma de probar la visibilidad. Separar un CHG de fundación alargaría la aprobación sin cubrir el escenario que el propietario pidió, que es un bot consultando stock.

## Gate de este pull request

Este PR termina en la fila 3. Las filas 4 a 9 no se ejecutan aquí.
