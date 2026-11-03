# ADR-017 — Arnés de ingeniería para agentes

La copia canónica está en `docs/adr/ADR-017.md`. Si este resumen y ese archivo divergen, manda el ADR.

## Decisión breve

- Flujo por paquete CHG antes de código de producto.
- Cucumber y Supertest para una muestra de Gherkin, no para todo `docs/04-BDD.md`.
- PostgreSQL 16 como servicio de CI, con esquema efímero y semilla ficticia. Sin Testcontainers en este cambio.
- Cobertura `c8` con piso 35/35/55/70 (líneas, sentencias, ramas, funciones).
- OpenAPI 3.1 validado fuera del proceso de Express.
- CI en cada PR, con gitleaks y `.gitleaksignore` para lo ya comprometido, y `npm audit` desde severidad alta.
- Parches transitivos de dependencias para que el gate de auditoría pueda ponerse en verde sin cambiar rutas.

## Aprobación

Pendiente del propietario. No incluye merge ni despliegue.
