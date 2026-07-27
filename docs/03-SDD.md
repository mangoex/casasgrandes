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
