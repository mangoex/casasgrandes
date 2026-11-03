# Casos TDD — CHG-026

## TDD-TC-121 — Contrato OpenAPI del API de bots

- Cubre: HARNESS-REQ-001, ADR-017
- Nivel: contrato
- Archivo: `test/contract/bot_v1_openapi.test.js`
- Fixture: `docs/api/bot-v1.yaml` y un cuerpo `{ "status": "ok" }`
- Acción: validar el documento 3.1, aceptar el ejemplo, rechazar un estado distinto o una propiedad extra, y pedir `GET /api/v1/bot/health` a Express
- Aserciones: el documento es válido, el ejemplo cumple, el contraejemplo no, y la ruta responde 404
- Estado: implementado en la rama

## TDD-TC-122 — Muestra Gherkin ejecutable

- Cubre: BDD-SC-034, BDD-SC-036, BDD-SC-100, BDD-SC-103, BDD-SC-105
- Nivel: HTTP con Supertest
- Archivo: `features/`
- Fixture: asesores, productor y producto ficticios, inyectados en los métodos de `db` que esas rutas ya usan. No hay semilla CSV.
- Acción: `npm run test:bdd`
- Aserciones: salud 200/503, crédito a 7560, apartado en cero, suma de tamaños distinta de 100 rechazada con 400 y sin escritura
- Estado: implementado en la rama

## TDD-TC-123 — Reserva en PostgreSQL con semilla ficticia

- Cubre: BDD-SC-104
- Nivel: PostgreSQL 16 aislado
- Archivo: `test/integration/postgres_fake_seed.test.js`
- Fixture: esquema efímero, `almacen.ficticio@example.test`, híbrido de demostración, 90 y 50 bolsas físicas
- Acción: `POST /api/almacen/solicitudes/101/asignaciones` con 60 BT1 y 40 BT2
- Aserciones: 201, dos reservas activas, existencia física sin cambio, correos solo `@example.test`, esquema eliminado al final
- Rojo si no hay base: el caso se omite y lo dice. No se marca como éxito de negocio.
- Estado: implementado en la rama; la ejecución real ocurre cuando existe la URL o en CI

## Comandos

```bash
npm test
npm run test:bdd
npm run test:contract
npm run test:coverage
```
