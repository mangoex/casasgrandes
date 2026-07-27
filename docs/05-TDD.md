# Test-Driven Development

## TDD-TC-018 — Prohibición de borrado al arrancar

- Cubre: BDD-SC-001, PRD-FR-001
- Nivel: regresión estructural
- Fixture: fuente de `db.js`
- Acción: inspeccionar las operaciones de `initSchema`
- Aserciones: no existe limpieza de `planificacion_semanal` condicionada por conteo de cotizaciones
- Estado: passed

## TDD-TC-019 — Cookie protegida

- Cubre: BDD-SC-002, BDD-SC-003, PRD-FR-002
- Nivel: unitario e integración HTTP
- Fixture: opciones de cookie en desarrollo y producción
- Acción: construir y serializar cookie
- Aserciones: `HttpOnly`, `SameSite=Strict`, `Path=/` y `Secure` en producción
- Integración: login web no expone token; modo explícito de script devuelve Bearer sin cookie
- Estado: passed

## TDD-TC-020 — Token fuera de almacenamiento web

- Cubre: BDD-SC-002, PRD-FR-002
- Nivel: regresión estructural
- Fixture: fuente de `public/js/app.js`
- Acción: inspeccionar persistencia de sesión
- Aserciones: no usa `localStorage` ni `sessionStorage` para token o usuario
- Estado: passed

## TDD-TC-021 — Codificación de contenido

- Cubre: BDD-SC-004, PRD-FR-003
- Nivel: unitario
- Fixture: HTML, atributos y texto normal
- Acción: aplicar codificación
- Aserciones: caracteres ejecutables quedan convertidos en entidades
- Estado: passed

## TDD-TC-022 — Contraseña de alta

- Cubre: BDD-SC-005, PRD-FR-004
- Nivel: unitario y contrato
- Fixture: contraseñas ausentes, cortas y válidas
- Acción: validar entrada
- Aserciones: solo acepta 12 o más caracteres
- Estado: passed

## TDD-TC-023 — Migraciones sin contraseña conocida

- Cubre: BDD-SC-006, PRD-FR-004
- Nivel: regresión estructural
- Fixture: migraciones y formulario de login
- Acción: buscar credenciales conocidas o defaults implícitos
- Aserciones: no aparecen contraseñas públicas ni hashes predeterminados
- Estado: passed

## Estrategia

- Unitarias: utilidades de cookie, contraseña y codificación.
- Integración: login, restauración por cookie y logout se prueban mediante HTTP local real.
- PostgreSQL: la integración contra una base aislada permanece pendiente.
- Contrato: alta de asesor exige contraseña.
- Seguridad: XSS, sesión y credencial inicial.
- Regresión: arranque no destructivo y ausencia de secretos demostrativos.
