# Registro de decisiones — CHG-026

| Fecha | ID | Decisión | Quién | Estado |
|---|---|---|---|---|
| 2026-11-03 | ADR-017 | Arnés con Cucumber, servicio PostgreSQL 16, c8, OpenAPI fuera de Express y CI en cada PR | agente, a partir del encargo | propuesta hasta que el propietario acepte el PR |
| 2026-11-03 | CHG-026 | No se implementa `/api/v1/bot` ni se altera el esquema | encargo del propietario | vigente para este cambio |
| 2026-11-03 | CHG-026 | No se reescribe historia, no se editan CSV y no hay merge ni despliegue | encargo del propietario | vigente |

## Aprobaciones que siguen abiertas

- Merge: pendiente. Hace falta un sí explícito del propietario.
- Despliegue: pendiente.
- Hacer el repositorio privado, purgar del historial los CSV con datos personales y rotar el secreto JWT de respaldo: pendiente. Este cambio no puede hacerlo sin violar el encargo.
- Confirmar o ajustar el piso de cobertura 35/35/55/70: pendiente. El valor está justificado en ADR-017 y se puede cambiar sin tocar producto.

## Evidencia

- Se completa en el cuerpo del pull request con los comandos realmente ejecutados.
