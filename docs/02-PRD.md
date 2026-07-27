# Product Requirements Document

## Problema

El sistema puede perder planeación al arrancar, ejecutar HTML no confiable con acceso a sesiones y crear cuentas con una contraseña pública.

## Personas

- Administrador responsable de usuarios y operación.
- Asesor que usa el CRM desde navegador.
- Responsable operativo de los datos PostgreSQL.

## Alcance y exclusiones

- Incluye: arranque seguro, sesión web HttpOnly, sanitización y contraseñas explícitas.
- Excluye: despliegue y correcciones P1/P2.

## Requisitos funcionales

### PRD-FR-001 — Arranque no destructivo

El sistema no debe borrar planeación ni otros datos operativos durante inicialización o migración automática.

Criterio de aceptación: arrancar con cero cotizaciones conserva todas las filas de planeación.

### PRD-FR-002 — Sesión protegida

El login debe emitir la sesión mediante cookie `HttpOnly`, `Secure` en producción y `SameSite=Strict`; el frontend no debe persistir JWT en almacenamiento web.

Criterio de aceptación: `localStorage` y `sessionStorage` no contienen el token y `/api/auth/me` restaura la sesión.

### PRD-FR-003 — Renderizado seguro

El frontend debe escapar contenido persistido o generado externamente antes de insertarlo en HTML.

Criterio de aceptación: una carga con etiquetas, atributos o scripts se muestra como texto y no crea nodos ejecutables.

### PRD-FR-004 — Contraseña explícita

Crear o importar un asesor debe exigir una contraseña única de al menos 12 caracteres; no debe existir valor predeterminado ni credencial precargada.

Criterio de aceptación: una alta sin contraseña válida es rechazada y las migraciones exigen una credencial de bootstrap explícita cuando no pueden conservar una existente.

## Requisitos no funcionales

### PRD-NFR-001 — Seguridad de regresión

Cada regla P0 debe contar con una prueba automatizada que falle si reaparece el patrón vulnerable.

Métrica: 100% de `TDD-TC-018` a `TDD-TC-023` ejecutadas y aprobadas.

### PRD-NFR-002 — Compatibilidad

Las APIs seguirán aceptando temporalmente `Authorization: Bearer` para scripts internos. Esos scripts solicitan el token en login mediante `X-Auth-Mode: bearer`, mientras el navegador usa exclusivamente cookie.

Métrica: pruebas existentes aprobadas y login web funcional sin token legible por JavaScript.

## Criterios de éxito

- Ningún borrado inferido en el arranque.
- Ninguna contraseña pública o implícita en rutas productivas o formularios.
- Ningún flujo P0 renderiza contenido no confiable sin escape.
- Pruebas y validación Humanio con evidencia ejecutada.
