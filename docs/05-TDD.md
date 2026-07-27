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

## TDD-TC-024 — Cuenta activa y versión

- Cubre: BDD-SC-007, BDD-SC-008, PRD-FR-005
- Nivel: unitario de middleware
- Aserciones: usuario inexistente/inactivo o versión distinta recibe 403; usuario vigente continúa con rol de DB
- Estado: passed

## TDD-TC-025 — Política de roles

- Cubre: BDD-SC-011, PRD-FR-007
- Nivel: unitario
- Aserciones: lista permitida continúa; cualquier otro rol recibe 403
- Estado: passed

## TDD-TC-026 — Lectura de cliente ajeno

- Cubre: BDD-SC-009, PRD-FR-006
- Nivel: integración HTTP
- Aserciones: Asesor recibe 403 y no obtiene PII; Administrador y Coordinador continúan
- Estado: passed

## TDD-TC-027 — Mutación de asociaciones ajenas

- Cubre: BDD-SC-010, PRD-FR-006
- Nivel: integración HTTP
- Aserciones: desasociar y disolver grupo ajeno no ejecutan UPDATE
- Estado: passed

## TDD-TC-028 — Revocación por logout

- Cubre: BDD-SC-012, PRD-FR-008
- Nivel: integración HTTP
- Aserciones: logout incrementa versión; token previo ya no autentica
- Estado: passed

## TDD-TC-029 — Regresión de cobertura

- Cubre: PRD-NFR-003
- Nivel: estructural y suite completa
- Aserciones: rutas comerciales críticas declaran política; TDD-TC-018..028 pasan
- Estado: passed

## TDD-TC-030 — Commit y rollback

- Cubre: BDD-SC-013, PRD-NFR-004
- Aserciones: `BEGIN/COMMIT/release` al éxito; `BEGIN/ROLLBACK/release` al fallo
- Estado: passed

## TDD-TC-031 — Conexión única

- Cubre: PRD-FR-009
- Aserciones: todas las consultas del callback usan el mismo cliente
- Estado: passed

## TDD-TC-032 — Locks de inventario

- Cubre: BDD-SC-014, BDD-SC-015, PRD-FR-010
- Aserciones: movimientos y producción usan transacción y `FOR UPDATE`
- Estado: passed

## TDD-TC-033 — Locks de estado

- Cubre: BDD-SC-016, BDD-SC-017, PRD-FR-011
- Aserciones: decisiones y estatus bloquean y revalidan antes de mutar
- Estado: passed

## TDD-TC-034 — Regresión completa

- Cubre: PRD-NFR-004
- Aserciones: TDD-TC-018..033 y suite anterior permanecen verdes
- Estado: passed
