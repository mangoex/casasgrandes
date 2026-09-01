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

## Diseño CHG-003

### SDD-CMP-009 — Adaptador transaccional

- Cubre: PRD-FR-009, PRD-NFR-004
- `db.transaction(work)` expone `get/all/run` sobre una misma conexión.
- Siempre libera la conexión; confirma al éxito y revierte ante excepción.

### SDD-CMP-010 — Inventario serializado

- Cubre: PRD-FR-009, PRD-FR-010
- Bloquea filas de `productos` en orden estable y lee el último movimiento dentro de la misma transacción.

### SDD-CMP-011 — Estados serializados

- Cubre: PRD-FR-011
- Cotización, puja y cliente se bloquean antes de validar transición.
- El segundo competidor observa el estado confirmado por el primero y no repite efectos.

## Diseño CHG-004

### SDD-CMP-012 — Guard de egreso

- Cubre: PRD-FR-012, PRD-FR-014
- `generateText` valida opt-in y obtiene claves solo desde entorno.

### SDD-CMP-013 — Contextos seguros

- Cubre: PRD-FR-013, PRD-FR-016
- Constructores puros generan contexto CEO/Outreach pseudonimizado y mensajes Coordinator locales.

### SDD-CMP-014 — Redacción de logs

- Cubre: PRD-FR-015, PRD-NFR-005
- Utilidad recursiva elimina campos sensibles y patrones de email, teléfono, token o clave.

### SDD-CMP-015 — Persistencia IA atómica

- La cotización Outreach, detalles, total y notificación se confirman en una transacción.

## Diseño CHG-005

### SDD-CMP-016 — Lockfile corregido

- Cubre: PRD-FR-017, PRD-NFR-006
- `package-lock.json` fija versiones corregidas de `body-parser`, `tar` y `undici`.
- No cambia las dependencias directas ni el rango de runtime declarado por la aplicación.

## Diseño CHG-006

### SDD-CMP-017 — Rate limiter acotado

- Cubre: PRD-FR-018
- Ventana fija de 15 minutos con stores separados por IP y hash SHA-256 del identificador.
- El store elimina ventanas vencidas y limita su cardinalidad para evitar crecimiento ilimitado.

### SDD-CMP-018 — Parsers por riesgo

- Cubre: PRD-FR-019
- Autenticación se ejecuta antes del parser de 12 MiB para anexos.
- El resto de rutas usa parser JSON de 1 MiB y errores `413` JSON.

### SDD-CMP-019 — Cabeceras y proxy

- Cubre: PRD-FR-020, PRD-NFR-007
- `TRUST_PROXY_HOPS` acepta solo enteros acotados.
- `script-src 'self'` bloquea bloques inline; `script-src-attr 'unsafe-inline'` conserva temporalmente handlers heredados bajo riesgo visible.

## Diseño CHG-007

### SDD-CMP-020 — Persistencia de cotización

- Cubre: PRD-FR-021, PRD-NFR-008
- Un servicio transaccional inserta cabecera y detalles, bloquea planeación/prospecto y aplica sus transiciones.

### SDD-CMP-021 — Edición con inventario

- Cubre: PRD-FR-022, PRD-NFR-008
- Bloquea cotización y productos en orden estable; calcula saldos desde el último movimiento ya bloqueado.

### SDD-CMP-022 — Conversión idempotente

- Cubre: PRD-FR-023
- La ruta bloquea planificación antes de consultar elegibilidad y prospecto existente.

## Diseño CHG-008

### SDD-CMP-023 — Sondas operativas

- Cubre: PRD-FR-024, PRD-FR-025, PRD-NFR-009
- Vida no consulta dependencias; disponibilidad usa `SELECT 1` con timeout y un cuerpo público mínimo.

### SDD-CMP-024 — Contexto de solicitud

- Cubre: PRD-FR-026
- Un middleware valida identificadores acotados o genera UUID y registra método, ruta sin query, estado y duración.

### SDD-CMP-025 — Controlador de ciclo de vida

- Cubre: PRD-FR-027, PRD-NFR-009
- El cierre es idempotente, detiene aceptación y scheduler, espera actividad y cierra PostgreSQL antes del límite.

## Diseño CHG-009

### SDD-CMP-026 — Presupuesto monetario determinista

- Cubre: PRD-FR-029, PRD-NFR-010
- `utils/pricing.js` expone una función pura que normaliza importes a centavos, calcula reducción mensual, tope total y saldo del asesor, y valida la equivalencia de las representaciones monetaria y porcentual cuando ambas existen.
- El porcentaje usa el precio anual y redondeo de centavo `half-up`.
- `pricing_reference.py` evalúa los mismos fixtures con `Decimal`; no participa en el runtime HTTP.

### SDD-CMP-027 — Resolvedor mensual único

- Cubre: PRD-FR-028, PRD-FR-030
- El resolvedor carga precio anual y fila mensual para una fecha explícita, ejecuta SDD-CMP-026 y entrega el producto mensual al motor existente.
- Previsualización, alta y edición llaman al resolvedor; Outreach recibe el mismo contrato mediante una dependencia compartida.
- Configuración inválida produce error de dominio y ninguna cotización se persiste.

### SDD-CMP-028 — Snapshot y presentación

- Cubre: PRD-FR-031, PRD-NFR-011
- `cotizacion_detalles` añade columnas nullable para catálogo, mensual, reducción, tope, descuento asesor y versión de contrato.
- `precio_lista_unitario` continúa siendo compatible y para CHG-009 contiene el precio mensual.
- El frontend muestra precio mensual, reducción incluida y saldo adicional; el slider nunca supera el valor devuelto por el servidor.
- Las filas legadas conservan columnas nuevas nulas y se presentan con el desglose disponible, sin recalcularse.

## Diseño CHG-010

### SDD-CMP-029 — Control vinculado de Programación

- Cubre: PRD-FR-032
- El servidor devuelve el precio anual junto a cada fila mensual como referencia inmutable del cálculo.
- Una función pura del frontend recalcula precio mensual, descuento monetario y porcentaje a partir del último campo editado, con dinero a dos decimales y porcentaje a cuatro.
- El motor monetario acepta ambas representaciones solo cuando producen el mismo tope al centavo.

## Diseño CHG-011

### SDD-CMP-030 — Rango comercial desde precio mensual

- Cubre: PRD-FR-033
- `calculateDiscountBudget` conserva la diferencia catálogo-mes como dato informativo y devuelve el tope promocional completo como disponibilidad del asesor.
- Previsualización, creación y edición limitan el descuento por `min(tope_mensual, precio_neto_antes_del_asesor)`.
- El frontend usa `max_discount_mxn` como atributo `max` de la barra y lo etiqueta como límite configurado del mes.

## Diseño CHG-012

### SDD-CMP-031 — Contrato separado de descuento incorporado y tope

- Cubre: PRD-FR-034
- `crm_precios_mensuales.tope_descuento_mxn` conserva el máximo autorizado; `promo_dinero` y `promo_porcentaje` representan la reducción ya incorporada y vinculada con `precio`.
- La migración aditiva toma el tope previo de `promo_dinero` y alinea el precio efectivo con la representación que Programación ya mostraba, sin modificar cotizaciones históricas.
- El resolvedor devuelve precio mensual, descuento incorporado, tope total y saldo adicional `max(tope - incorporado, 0)`.
- El navegador muestra una barra acumulada de cero al tope, la inicializa en el descuento incorporado, impide bajar de ese piso y envía al servidor únicamente la diferencia adicional.
- Si piso y tope coinciden, la barra queda completa y deshabilitada; el precio final permanece en el precio mensual.
