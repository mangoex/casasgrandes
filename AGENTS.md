# Gobierno del proyecto

## Autoridad

1. Constitución.
2. Decisiones confirmadas y ADR vigentes.
3. PRD y reglas de negocio.
4. SDD.
5. BDD y TDD.
6. Plan y tareas.
7. Código.

## Reglas

- No programar antes de identificar requisitos e IDs afectados.
- Actualizar BDD y TDD antes de cambios de comportamiento.
- Implementar el cambio mínimo.
- Ejecutar pruebas y reportar evidencia real.
- No introducir secretos ni datos personales innecesarios.

## Entorno de Cloud Agent

El arranque local usa Node.js, PostgreSQL 16 y `python` apuntando a Python 3. La instalación ejecuta `npm ci`. Al iniciar, el entorno levanta PostgreSQL, asegura la base `casas_grandes` con el rol local `casasgrandes` (autenticación trust solo en localhost), crea `/workspace/.env` si falta y deja la API en el puerto 3000, sesión tmux `web`.

`.env` está en `.gitignore`. Guarda `JWT_SECRET`, `DATABASE_URL` y el acceso local `LOCAL_DEV_LOGIN_USERNAME` / `LOCAL_DEV_LOGIN_PASSWORD` (usuario `agente.local`). No lo copies a commits ni a la documentación.

Comandos:

- API: `npm start`, con PostgreSQL en marcha y `.env` presente.
- Pruebas Node: `npm test`.
- Motor de comisiones: `python comisiones.py --test`.
- Oráculo de precios: `PYTHONPATH=/workspace python3 test/test_pricing_reference.py -v`.

`migrate_pg.js` corre solo cuando faltan las tablas base. `GEMINI_API_KEY` y `OPENROUTER_API_KEY` son opcionales; la IA externa queda apagada.
