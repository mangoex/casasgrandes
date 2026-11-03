# Plan — {{CHG-###}}

- Objetivo: {{OBJ-###}}
- Requisitos: {{PRD-FR-###}}
- Decisión: {{ADR-### o no aplica}}
- Escenarios: {{BDD-SC-###}}
- Pruebas: {{TDD-TC-###}}
- Gate de salida: CI verde y aprobación explícita del propietario para merge o despliegue

| Orden | Tarea | IDs | Evidencia esperada | Estado |
|---|---|---|---|---|
| 1 | Cerrar historia, requisito, contrato y ADR | {{CHG-###}} | Paquete en `docs/cambios/{{CHG-###}}` | pendiente |
| 2 | Escribir Gherkin y casos TDD en rojo | {{BDD-SC-###}}, {{TDD-TC-###}} | Comando y fallo real | pendiente |
| 3 | Implementar el mínimo | {{rutas o módulos}} | Pruebas focalizadas en verde | pendiente |
| 4 | Correr CI completo | lint, suite, BDD, cobertura, contrato, secretos, dependencias | Enlace de la corrida | pendiente |
| 5 | Abrir PR | revisión de código y seguridad | URL del PR, sin merge | pendiente |
