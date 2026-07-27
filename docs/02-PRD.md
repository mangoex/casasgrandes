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

## Incremento CHG-002 — Autorización y revocación

### OBJ-004 — Contener acceso por identidad, rol y propiedad

Impedir que una cuenta activa consulte o modifique recursos fuera de su función o cartera, y revocar inmediatamente sesiones que hayan dejado de ser válidas.

### PRD-FR-005 — Identidad vigente

Cada petición protegida debe validar en PostgreSQL que la cuenta siga activa, conservar el rol vigente y presentar la misma versión de sesión que el token.

Criterio de aceptación: una cuenta desactivada, una versión anterior o un usuario inexistente recibe `403` sin ejecutar el endpoint.

### PRD-FR-006 — Propiedad comercial

Un Asesor solo puede acceder a clientes, asociaciones, cotizaciones, planeaciones, prospectos, visitas y reportes propios.

Criterio de aceptación: cambiar el ID por el de otra cartera produce `403` y ninguna mutación.

### PRD-FR-007 — Política explícita por rol

Las rutas sensibles deben declarar roles permitidos mediante políticas reutilizables. Almacén y Acopio no pueden acceder a carteras comerciales; Asesor no puede ejecutar funciones administrativas.

Criterio de aceptación: la matriz de roles cuenta con pruebas positivas y negativas.

### PRD-FR-008 — Revocación

Logout, desactivación, cambio de rol y cambio de contraseña revocan los tokens emitidos previamente.

Criterio de aceptación: reutilizar un token anterior a cualquiera de esos eventos produce `403`.

### PRD-NFR-003 — Denegación segura

La autorización debe fallar cerrada, responder antes de la lógica productiva y no depender de filtros enviados por el cliente.

Métrica: 100% de TDD-TC-024..029 aprobadas y ninguna regresión de TDD-TC-018..023.

## Incremento CHG-003 — Integridad transaccional

### OBJ-005 — Conservar inventario y asignaciones bajo fallos y concurrencia

### PRD-FR-009 — Unidad atómica

Producción UAN-32, movimientos de almacén, entrega/reversión de cotizaciones y decisiones de puja deben confirmar todos sus efectos o ninguno.

### PRD-FR-010 — Bloqueo antes de calcular

El saldo o estado nuevo se calcula después de bloquear el producto o recurso canónico mediante `FOR UPDATE`.

### PRD-FR-011 — Transición idempotente

Una decisión o transición concurrente debe revalidar el estado bloqueado e impedir efectos duplicados.

### PRD-NFR-004 — Recuperación

Un fallo simulado después de una escritura debe ejecutar `ROLLBACK`, liberar la conexión y conservar el error original.

## Incremento CHG-004 — Privacidad y egreso IA

### OBJ-006 — Usar IA sin divulgar PII ni secretos

### PRD-FR-012 — Opt-in externo

CEO y Outreach solo invocan modelos externos cuando `AI_EXTERNAL_PROCESSING_ENABLED=true`.

### PRD-FR-013 — Contexto minimizado

Los payloads externos contienen identificadores internos, métricas y catálogos estrictamente necesarios; excluyen nombres, correos, teléfonos y texto libre de clientes.

### PRD-FR-014 — Secretos fuera de DB

Las claves IA se leen desde entorno y la API rechaza intentos de persistir nuevas claves.

### PRD-FR-015 — Logs mínimos

Los logs conservan resultado operativo, conteos e IDs técnicos; no respuestas completas, teléfonos, URLs de contacto ni stacks sin redacción.

### PRD-FR-016 — Coordinación local

Los mensajes de agenda se construyen localmente, sin enviar asesor, agricultor o agenda a terceros.

### PRD-NFR-005 — Privacidad verificable

Las pruebas inspeccionan el contexto productivo y fallan si reaparece PII o lectura de claves desde PostgreSQL.

## Incremento CHG-005 — Dependencias seguras

### OBJ-007 — Eliminar vulnerabilidades conocidas del runtime

### PRD-FR-017 — Remediación compatible

Las dependencias transitivas vulnerables se actualizarán a versiones corregidas sin introducir saltos mayores innecesarios.

### PRD-NFR-006 — Auditoría reproducible

`npm audit --omit=dev` debe terminar con código 0 y cero vulnerabilidades; la suite completa debe permanecer verde.

## Incremento CHG-006 — Resistencia a abuso HTTP

### OBJ-008 — Reducir fuerza bruta y consumo no acotado

### PRD-FR-018 — Límite de login

Login limita intentos por origen y por identificador seudonimizado, responde `429` con `Retry-After` y no conserva correos o usuarios en memoria.

### PRD-FR-019 — Payload acotado

El JSON general admite como máximo 1 MiB. El anexo PDF conserva hasta 12 MiB solo después de autenticar la sesión.

### PRD-FR-020 — Proxy explícito

La aplicación solo confía en el número entero de saltos configurado mediante `TRUST_PROXY_HOPS`; ausencia o valor inválido equivale a cero.

### PRD-NFR-007 — Aislamiento HTTP

Respuestas aplican CSP sin bloques de script inline, aislamiento de origen, no-cache para API y HSTS en producción.
