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

## Diseño CHG-013

### SDD-CMP-032 — Captura canónica de precio mensual y saldo Asesor

- Cubre: PRD-FR-035.
- La API de Programación acepta por mes `precio` y `asesor_dinero`; deriva en servidor `promo_dinero`, `promo_porcentaje` y `tope_descuento_mxn` para no confiar en representaciones redundantes del cliente.
- La respuesta conserva compatibilidad con los campos históricos y añade `asesor_dinero = max(tope_descuento_mxn - promo_dinero, 0)`.
- El frontend retira el control porcentual, muestra el precio base del catálogo junto al selector, mantiene vinculados Precio del mes y Descuento del mes ($), y conserva independiente el saldo Asesor.
- Cotizador muestra `precio_catalogo` como Precio base, mantiene el piso acumulado y presenta como disponible el saldo adicional del asesor.

## Diseño CHG-014

### SDD-CMP-033 — Nucle mensual autoritativo y auditable

- Cubre: PRD-FR-036.
- `crm_nucle_mensual` conserva doce porcentajes validados entre 0 y 100; solo Administrador puede leerlos y modificarlos desde el catálogo administrativo.
- `applyNucleDiscount` determina elegibilidad por categoría y calcula en centavos el porcentaje sobre el precio neto (después del descuento del asesor) y con piso cero.
- Previsualización, creación y edición consultan el porcentaje del mes en servidor; el cliente solo envía `nucle_aplicado`.
- `cotizaciones` guarda bandera, porcentaje y descuento total; `cotizacion_detalles` guarda el descuento Nucle unitario y la versión `CHG-014`.
- El frontend muestra la casilla, el descuento en el resumen y el snapshot en el detalle de la cotización.

## Diseño CHG-016

### SDD-CMP-034 — Control bidireccional y de precisión de cotización

- Cubre: PRD-FR-037.
- El elemento `<input type="range" class="item-discount-slider">` define `step="1"` para desplazar la barra en incrementos enteros de $1 MXN.
- El contenedor de Precio Final incluye un `<input type="number" class="item-final-price-input">` editable con `step="1"`.
- El input `item-final-price-input` configura `min` y `max` dinámicamente:
  `minAllowedPrice = Math.round(Math.max((basePrice - nucleDiscount) - maxAdditionalDiscount, 0))`
  `maxAllowedPrice = Math.round(Math.max(basePrice - nucleDiscount, 0))`
- El contenedor incluye la referencia visual `<div class="item-final-price-min-label">Mín: $X MXN</div>`.
- Al escribir en `item-final-price-input`, `onFinalPriceInputChange` calcula:
  `targetAdditional = basePrice - nucleDiscount - enteredPrice`
  `clampedAdditional = clamp(targetAdditional, 0, maxAdditionalDiscount)`
  `slider.value = discountFloor + clampedAdditional`
- Si el usuario teclea un precio menor a `minAllowedPrice` y ya completó los dígitos del importe mínimo, se acota de inmediato a `minAllowedPrice` para impedir valores inferiores a la condición mensual autorizada.
- Sincroniza visualmente la barra, el descuento aplicado y el total global mediante `recalcTotalsWithDiscounts()`.
- Al salir del foco (`blur`) o al disparar `change`, cualquier valor fuera de `[minAllowedPrice, maxAllowedPrice]` se acota estrictamente a su frontera.
- Al interactuar con el slider, `onDiscountSliderChange` sincroniza de inmediato el campo `item-final-price-input`.

## Diseño CHG-017

### SDD-CMP-035 — Elegibilidad determinista de Cuenta Clave para Calamar e Hipopótamo

- Cubre: PRD-FR-038, ADR-015.
- La función de dominio `isKeyAccountEligible(prod)` (JS) e `is_key_account_eligible(category, product_name)` (Python) verifica dos condiciones obligatorias:
  1. Categoría elegible: `híbrido`, `hibrido`, `semilla`, `semillas`.
  2. Coincidencia de nombre de producto: debe contener `calamar` o `hipopotamo` (insensible a acentos y mayúsculas).
- Cualquier otra variedad de semilla (ej. Rinoceronte, Armadillo, Vitala, A-7573) y cualquier agroquímico o fertilizante se evalúa como no elegible (`false`).
- En `getNetPrice(prod, volMultiplier, keyAccountDiscount, activeSeason)`:
  - `effectiveKeyAccountDiscount = isKeyAccountEligible(prod) ? (Number(keyAccountDiscount) || 0) : 0`
  - `netPrice = Math.max(priceBeforeKeyAccount - effectiveKeyAccountDiscount, 0)`
- En la API de cotizaciones (`/api/cotizaciones/calcular`), el ítem calculado retorna `descuento_cuenta_clave_mxn = 0` para productos no elegibles.
- En `public/js/app.js`, como `hasKeyAccountDiscount` evalúa a falso cuando el descuento es cero, el elemento visual `item-key-account-step` se oculta automáticamente.
- El oráculo `pricing_reference.py` modela `calculate_item_net_price` de forma determinista para pruebas cruzadas continuas.

## Diseño CHG-018 — Centro de notificaciones contextuales y componentes shadcn

### SDD-CMP-036 — Disparador y badge de notificaciones en el Tablero

- Cubre: PRD-FR-039
- Botón disparador en el encabezado superior derecho del dashboard (desktop) y en el encabezado móvil con microanimación de pulso (`pulse-ring` y `pulse-core`) cuando existen notificaciones no leídas.
- Cierra con clic exterior, botón de cerrar o tecla `Escape`.

### SDD-CMP-037 — Agregador contextual de notificaciones por rol

- Cubre: PRD-FR-040, PRD-FR-041
- **Asesor**: Agrega visitas pendientes de hoy (`/api/planificacion` con `fecha_programada = hoy` y `realizada = 0`) junto con avisos de cartera (`/api/notificaciones`).
- **Administrador**: Agrega cotizaciones pendientes de revisión o aprobación (`/api/cotizaciones` con estatus `Borrador`, `Pendiente`, `Pendiente Autorización`) junto con alertas del sistema.
- **Backend**: Expone `POST /api/notificaciones/leido` para marcar como leídas las notificaciones del usuario activo.

### SDD-CMP-038 — Estructura shadcn UI / Tailwind / TypeScript

- Cubre: PRD-FR-042
- Se alojan los componentes `/components/ui/vercel-notification-popover.tsx` y `demo.tsx` con arquitectura shadcn/Radix UI.

## Diseño CHG-019 — Resiliencia en Tablero General y Reporte de Comisiones

### SDD-CMP-039 — Resolución canónica de ciclo en Tablero General

- Cubre: PRD-FR-043
- En `public/js/app.js`, la función `loadDashboardData` resuelve el ciclo agrícola activo:
  `const selectedCycle = cycleSelect?.value || '';`
- Si `cycleSelect` no tiene valor seleccionado o no está montado en el DOM, el fallback envía una cadena vacía o toma el valor predeterminado del primer ciclo disponible en `allCycles`.
- Al garantizar la existencia de la variable local en scope, no se produce `ReferenceError` y el flujo asíncrono completa la renderización de KPIs, barras de progreso y pedidos recientes.

### SDD-CMP-040 — Mapeo canónico de columnas en Reporte de Comisiones

- Cubre: PRD-FR-044
- En `server.js` (endpoint `GET /api/comisiones/reporte`), la consulta SQL a la tabla `cotizaciones` se actualiza para proyectar:
  `c.folio_cotizacion, c.fecha_creacion AS fecha_cotizacion, c.condiciones_pago`
- Garantiza total compatibilidad con la base de datos PostgreSQL en Railway sin romper el contrato esperado por el frontend en `row.fecha_cotizacion`.

## Diseño CHG-020 — Acceso a Seguimiento para Asesores y Aislamiento de Cartera

### SDD-CMP-041 — Adaptación contextual de interfaz y selector de asesor

- Cubre: PRD-FR-045, PRD-FR-046
- En `public/index.html`, la opción de navegación (`data-target="seguimiento-view"`) y la sección de vista se etiquetan con la clase `commercial-or-director-only`.
- En `public/js/app.js`:
  - `showAppView` activa la visibilidad para `['Administrador', 'Coordinador', 'Director', 'Asesor']`.
  - `switchView` permite el ingreso a la vista y personaliza el título: `"Mi Seguimiento"` para rol `Asesor` y `"Seguimiento de Operaciones & Asesores"` para roles directivos/supervisores.
  - `loadSeguimientoDashboard` oculta el contenedor del selector `#sf-filter-asesor` cuando el usuario es Asesor, previniendo exposición de nombres de otros asesores y manipulación en cliente.

### SDD-CMP-042 — Forzado autoritativo de identidad y Cartera en Backend

- Cubre: PRD-FR-046
- El middleware de autorización en `GET /api/seguimiento/dashboard` autoriza roles comerciales y directivos (`['Administrador', 'Coordinador', 'Director', 'Asesor']`).
- Si `req.user.nivel_rol === 'Asesor'`:
  - `targetAsesorId` se fija irrevocablemente a `req.user.id`.
  - Se ignora cualquier valor enviado en `req.query.asesor_id`.
  - La respuesta JSON en `filters.asesor_id` retorna `String(req.user.id)`.
- Todas las consultas del dashboard (`asesoresQuery`, `metasQuery`, `clientsQuery`, `quotesQuery`, `detailsQuery`, `planQuery`, `visitsQuery`) ejecutan la cláusula `WHERE asesor_id = ?`, asegurando aislamiento total en la base de datos.

## Componentes del Incremento CHG-021

### SDD-CMP-043 â€” Matriz de AutorizaciÃ³n Perimetral de Inventario y AlmacÃ©n

- **UbicaciÃ³n**: `middleware/authorization.js` y `server.js`.
- **DiseÃ±o**:
  - `INVENTORY_ROLES` en `middleware/authorization.js` se amplÃ­a a `[ADMIN, COORDINATOR, DIRECTOR, WAREHOUSE, COLLECTION, ADVISOR]` para permitir que las rutas de solo lectura de existencias (`GET /api/almacen/existencias`, `GET /api/almacen/lotes-disponibles`, `GET /api/almacen/movimientos/tipos`) sean consumibles por la fuerza de ventas.
  - La seguridad de mutaciÃ³n se preserva de manera granular:
    - `POST /api/almacen/existencias/:id/ajuste`: `requireAdmin` (HTTP 403 para Asesor).
    - `POST /api/almacen/movimientos`: `allowedWarehouseRoles = ['Administrador', 'Coordinador', 'Almacen', 'Director']` (HTTP 403 para Asesor).
    - `DELETE /api/almacen/movimientos/:id`: `requireAdmin` (HTTP 403 para Asesor).

### SDD-CMP-044 â€” OptimizaciÃ³n de Consulta y PaginaciÃ³n de Pujas

- **UbicaciÃ³n**: `server.js`, `db.js`, `public/index.html` y `public/js/app.js`.
- **DiseÃ±o**:
  - `server.js` (`GET /api/asignacion/sin-asesor`):
    - ParÃ¡metro opcional `puja=1` (o `disponible_para_puja=1`) aplica filtro SQL `AND c.disponible_para_puja = 1`.
    - ProyecciÃ³n explÃ­cita de campos: `c.id, c.nombre, c.contacto, c.telefono, c.ubicacion, c.superficie_text, c.disponible_para_puja, c.asesor_id, c.cuenta_clave_id, cc.tier_name as cuenta_clave_nombre, cc.descuento_mxn`.
  - `db.js`:
    - Ãndice compuesto en PostgreSQL: `CREATE INDEX IF NOT EXISTS idx_clientes_sin_asesor_puja ON clientes (activo, asesor_id, disponible_para_puja);`.
  - `public/index.html`:
    - Incorpora `#bids-search-input`, `#bids-count-badge` y `#bids-pagination` (con `#bids-page-prev`, `#bids-page-next`, `#bids-pagination-summary`, `#bids-pagination-current`).
  - `public/js/app.js` (`loadClientBidsPool`):
    - Consume `/api/asignacion/sin-asesor?puja=1`.
    - Paginación cliente de 50 registros por página con filtrado instantáneo por búsqueda.

## Componentes del Incremento CHG-022

### SDD-CMP-045 — Exclusión de Almacén del Panel del Vendedor y Blindaje Perimetral de Inventario

- **Ubicación**: `middleware/authorization.js`, `public/index.html` y `public/js/app.js`.
- **Diseño**:
  - **Backend (`middleware/authorization.js`)**:
    - `INVENTORY_ROLES` excluye terminantemente a `ROLES.ADVISOR` (`Asesor`), quedando restringido a:
      `[ROLES.ADMIN, ROLES.COORDINATOR, ROLES.DIRECTOR, ROLES.WAREHOUSE, ROLES.COLLECTION]`.
    - El middleware perimetral `app.use('/api/almacen', authenticateToken, requireRoles(INVENTORY_ROLES))` rechaza con HTTP 403 Forbidden cualquier solicitud originada por un Asesor.
  - **Frontend Markup (`public/index.html`)**:
    - El elemento de navegación `li.nav-item[data-target="almacen-view"]` se equipa con la clase de rol `inventory-access-only` y atributo inline `style="display: none;"` para evitar parpadeos visuales al cargar la página.
    - La sección contenedora `#almacen-view` se marca con `inventory-access-only`.
  - **Frontend Control & Routing (`public/js/app.js`)**:
    - En la función `switchView(viewId, viewTitle)`, si `viewId === 'almacen-view'` y el rol es `Asesor`, se cancela la llamada a `loadAlmacenData()` y se redirige automáticamente al Tablero General (`dashboard-view`).

## Componentes del Incremento CHG-023

### SDD-CMP-046 — Matriz de Roles y Autorización de Observador en Backend

- **Ubicación**: `middleware/authorization.js` y `server.js`.
- **Diseño**:
  - `ROLES.OBSERVER = 'Observador'` se formaliza en `middleware/authorization.js`.
  - El rol no forma parte de `COMMERCIAL_ROLES` ni de `INVENTORY_ROLES`.
  - En `server.js`:
    - `POST /api/planificacion`: valida `if (req.user.nivel_rol === 'Observador') return res.status(403).json({ error: 'El perfil Observador no tiene permisos para programar o modificar actividades.' });`.
    - `PUT /api/planificacion/:id`: valida `if (req.user.nivel_rol === 'Observador') return res.status(403).json({ error: 'El perfil Observador no tiene permisos para modificar actividades.' });`.
    - `DELETE /api/planificacion/:id` y `POST /api/planificacion/bulk-delete`: restringidos a `Administrador` (Observador recibe 403).
    - `POST /api/planificacion/:id/convertir-prospecto`: valida `if (req.user.nivel_rol === 'Observador') return res.status(403).json({ error: 'El perfil Observador no tiene permisos para convertir actividades.' });`.
    - `POST /api/reportes-etapa`: valida `if (req.user.nivel_rol === 'Observador') return res.status(403).json({ error: 'El perfil Observador no tiene permisos para registrar reportes de visita.' });`.
    - `GET /api/planificacion`: al no ser `Asesor`, permite consultar `?asesor_id=ALL` o `?asesor_id=<id>` sin restricciones.

### SDD-CMP-047 — Adaptación de Interfaz y Enrutador Cliente para Perfil Observador

- **Ubicación**: `public/index.html` y `public/js/app.js`.
- **Diseño**:
  - `public/index.html`:
    - El modal de Administración `#asesor-role` incluye `<option value="Observador">Observador (Solo Lectura Visitas)</option>`.
    - El contenedor del filtro de asesores en Planificación se adapta para mostrarse a `Administrador`, `Coordinador` y `Observador`.
    - El botón `#btn-open-plan-modal` ("Agendar Visita") se condiciona por rol para ocultarse al Observador.
  - `public/js/app.js`:
    - `showAppView()`:
      - Si `user.nivel_rol === 'Observador'`, oculta los elementos de navegación no autorizados y muestra Planificación y Tablero (lectura).
      - Redirige el inicio a `switchView('planeacion-view', 'Planificación')`.
    - `loadPlaneacionView()`:
      - Invoca `loadPlanAdvisorOptions()` para que el selector de asesores se pueble con "Todos los Asesores" y los asesores activos.
    - `loadWeeklySchedule()`:
      - Evalúa que si `user.nivel_rol === 'Observador'`, no se renderizan botones de acción en las tarjetas (`actions = ''`).
    - `openEditPlanModal(p)`:
      - Si `user.nivel_rol === 'Observador'`, establece el título `Detalle de Visita (Solo Lectura)`, deshabilita todos los campos (`input.disabled = true`) y oculta los botones `#plan-submit-btn` y `#btn-convert-to-prospect`.
    - `switchView(viewId, title)`:
      - Si `user.nivel_rol === 'Observador'` e intenta conmutar a una vista restringida, redirige a `planeacion-view`.
