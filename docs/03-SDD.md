# Software Design Document

## Arquitectura

Express sirve el frontend y las APIs; PostgreSQL conserva el estado. El incremento separa utilidades de seguridad puras para que el mismo contrato gobierne cookies, contraseñas y codificación HTML.

## Componentes

### SDD-CMP-001 — Inicialización segura

- Responsabilidad: aplicar únicamente cambios de esquema idempotentes.
- Cubre: PRD-FR-001, PRD-NFR-001
- Entradas: conexión PostgreSQL y esquema existente.
- Salidas: esquema compatible sin mutaciones destructivas de datos.

### SDD-CMP-002 — Sesión web

- Responsabilidad: emitir, leer y eliminar cookie de autenticación.
- Cubre: PRD-FR-002, PRD-NFR-002
- Entradas: credenciales y petición HTTP.
- Salidas: cookie protegida y usuario autenticado.
- Compatibilidad: `X-Auth-Mode: bearer` devuelve token solo al cliente interno que lo solicita explícitamente; el login web no usa ese modo.

### SDD-CMP-003 — Renderizado

- Responsabilidad: codificar texto y Markdown restringido antes de usar `innerHTML`.
- Cubre: PRD-FR-003, PRD-NFR-001
- Entradas: cadenas de DB, usuario o proveedor IA.
- Salidas: HTML sin etiquetas o atributos inyectados.

### SDD-CMP-004 — Alta e importación de usuarios

- Responsabilidad: validar contraseña explícita y eliminar valores compartidos.
- Cubre: PRD-FR-004, PRD-NFR-001
- Entradas: contraseña administrativa o hash bcrypt en `INITIAL_ADVISOR_PASSWORD_HASH`.
- Salidas: hash bcrypt de una credencial no implícita.

## Datos e invariantes

- Modelo: se conserva el esquema actual de `asesores`; no se almacena el token en la base.
- Invariantes: migraciones automáticas no borran filas; contraseña mínima de 12 caracteres; cookies no son accesibles mediante JavaScript.

## Estados y transiciones

| Actor | Precondición | Evento | Efectos | Auditoría |
|---|---|---|---|---|
| Servidor | Esquema accesible | Arranque | Solo DDL idempotente | Log de inicialización |
| Usuario activo | Credenciales válidas | Login | Cookie firmada emitida | Respuesta de login |
| Administrador | Contraseña válida | Alta de asesor | Hash bcrypt persistido | Registro de asesor |
| Navegador | Contenido no confiable | Render | Texto codificado | Prueba DOM |

## Integraciones, seguridad y observabilidad

- Integraciones: navegador, PostgreSQL y proveedores IA existentes.
- Permisos: login público; sesión requerida para APIs; alta de asesor reservada a Administrador.
- Logs y métricas: errores existentes; observabilidad ampliada permanece en fase posterior.
- Migraciones y rollback: el cambio elimina una mutación destructiva; rollback de código restaura archivos, nunca datos borrados.

## Diseño CHG-002

### SDD-CMP-005 — Identidad activa

- Cubre: PRD-FR-005, PRD-FR-008, PRD-NFR-003
- `authenticateToken` valida firma y después consulta `asesores`.
- El JWT incluye `session_version`.
- `req.user` se reconstruye desde la fila vigente, no desde claims de rol.

### SDD-CMP-006 — Políticas de rol

- Cubre: PRD-FR-007, PRD-NFR-003
- `requireRoles(...roles)` deniega cualquier rol no listado.
- Matriz: Administrador global; Coordinador comercial/programación; Asesor cartera propia; Almacen y Acopio inventario según operación.

### SDD-CMP-007 — Propiedad de recursos

- Cubre: PRD-FR-006, PRD-NFR-003
- `requireOwnership(user, ownerId)` permite Administrador/Coordinador y exige igualdad para Asesor.
- Los endpoints cargan primero una proyección mínima `{id, asesor_id}` y autorizan antes de devolver PII o mutar.

### SDD-CMP-008 — Revocación

- Cubre: PRD-FR-008
- `session_version` inicia en 1.
- Logout y cambios sensibles incrementan la versión en la misma base canónica.
- Tokens anteriores fallan antes de alcanzar el controlador.
