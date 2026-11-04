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

## TDD-TC-035 — Opt-in y secretos

- Cubre: BDD-SC-018, BDD-SC-022
- Aserciones: opt-in falla cerrado; API no persiste claves y el arranque elimina copias heredadas
- Estado: passed

## TDD-TC-036 — Contexto CEO minimizado

- Cubre: BDD-SC-019
- Aserciones: el perfil contiene solo ID y métricas agregadas
- Estado: passed

## TDD-TC-037 — Contexto Outreach minimizado

- Cubre: BDD-SC-020
- Aserciones: alias estable sin nombre, correo ni teléfono
- Estado: passed

## TDD-TC-038 — Coordinación local

- Cubre: BDD-SC-021
- Aserciones: mensaje determinista generado sin proveedor externo
- Estado: passed

## TDD-TC-039 — Redacción de logs

- Cubre: BDD-SC-023
- Aserciones: campos y patrones sensibles se sustituyen por `[REDACTED]`
- Estado: passed

## TDD-TC-040 — Regresión CHG-004

- Cubre: PRD-NFR-005
- Aserciones: código productivo usa entorno y transacción Outreach
- Estado: passed

## TDD-TC-041 — Auditoría de dependencias

- Cubre: BDD-SC-024, PRD-NFR-006
- Aserciones: `npm audit --omit=dev` reporta cero y `npm test` permanece verde
- Estado: passed

## TDD-TC-042 — Ventana y cardinalidad

- Cubre: BDD-SC-025, BDD-SC-026
- Aserciones: límite, `Retry-After`, expiración y máximo de entradas
- Estado: passed

## TDD-TC-043 — Clave seudonimizada

- Cubre: PRD-FR-018
- Aserciones: el store recibe hash y no identificador en claro
- Estado: passed

## TDD-TC-044 — Parsing por riesgo

- Cubre: BDD-SC-027, BDD-SC-028
- Aserciones: 1 MiB general y autenticación previa al parser de adjuntos
- Estado: passed

## TDD-TC-045 — Cabeceras y proxy

- Cubre: BDD-SC-029, PRD-FR-020, PRD-NFR-007
- Aserciones: CSP, HSTS, aislamiento y proxy acotado
- Estado: passed

## TDD-TC-046 — Creación atómica

- Cubre: BDD-SC-030, PRD-FR-021
- Aserciones: cabecera, detalles y transiciones usan el mismo `tx`
- Estado: passed

## TDD-TC-047 — Conversión concurrente

- Cubre: BDD-SC-031, PRD-FR-023
- Aserciones: planificación bloqueada y prospecto existente reutilizado
- Estado: passed

## TDD-TC-048 — Edición e inventario

- Cubre: BDD-SC-032, BDD-SC-033, PRD-FR-022
- Aserciones: locks ordenados, saldo revalidado y rollback común
- Estado: passed

## TDD-TC-049 — Regresión CHG-007

- Cubre: PRD-NFR-008
- Aserciones: suite completa y verificaciones de seguridad permanecen verdes
- Estado: passed

## TDD-TC-050 — Sondas HTTP

- Cubre: BDD-SC-034, BDD-SC-035, BDD-SC-036
- Aserciones: vida no depende de DB; readiness traduce éxito a 200 y fallo a 503 sin detalle
- Estado: passed

## TDD-TC-051 — Timeout de disponibilidad

- Cubre: BDD-SC-036, PRD-NFR-009
- Aserciones: una consulta que no termina degrada dentro del límite
- Estado: passed

## TDD-TC-052 — ID y log de solicitud

- Cubre: BDD-SC-037, PRD-FR-026
- Aserciones: conserva ID válido, reemplaza entrada inválida y excluye query/PII
- Estado: passed

## TDD-TC-053 — Cierre ordenado e idempotente

- Cubre: BDD-SC-038, BDD-SC-039, PRD-FR-027
- Aserciones: servidor, scheduler y pool cierran una sola vez aun con llamadas repetidas
- Estado: passed

## TDD-TC-054 — Regresión CHG-008

- Cubre: PRD-NFR-009
- Aserciones: suite, auditoría de dependencias y gates Humanio permanecen verdes
- Estado: passed

## TDD-TC-055 — Oráculo Python

- Cubre: BDD-SC-040, BDD-SC-041, BDD-SC-046, PRD-NFR-010
- Aserciones: `Decimal` produce reducción, tope, saldo y redondeo esperados para todos los fixtures
- Estado: passed-local

## TDD-TC-056 — Paridad del motor productivo

- Cubre: BDD-SC-040, BDD-SC-041, BDD-SC-046, PRD-FR-029
- Aserciones: JavaScript en centavos coincide exactamente con los fixtures del oráculo y rechaza representaciones inconsistentes
- Estado: passed-local

## TDD-TC-057 — Validación atómica de Programación

- Cubre: BDD-SC-042, PRD-FR-030
- Aserciones: reducción superior al tope responde 400 antes de abrir transacción; doce meses válidos conservan propagación y promociones
- Estado: passed-local

## TDD-TC-058 — Autoridad del servidor en cotización

- Cubre: BDD-SC-040, BDD-SC-043, PRD-FR-028..030
- Aserciones: resolver devuelve precio mensual y saldo; descuento superior produce error en previsualización, alta y edición
- Estado: passed-local

## TDD-TC-059 — Cobertura de canales

- Cubre: BDD-SC-044, PRD-FR-030
- Aserciones: creación, edición, planificación y Outreach invocan el resolvedor mensual compartido
- Estado: passed-local

## TDD-TC-060 — Snapshot histórico

- Cubre: BDD-SC-045, PRD-FR-031, PRD-NFR-011
- Aserciones: partidas nuevas persisten el desglose CHG-009 y filas legadas quedan nulas sin backfill inferido
- Estado: passed-local

## TDD-TC-061 — Contrato frontend

- Cubre: BDD-SC-040, BDD-SC-043
- Aserciones: interfaz etiqueta precio mensual, reducción incluida y saldo; slider usa exclusivamente el máximo del servidor
- Estado: passed-local

## TDD-TC-062 — Regresión CHG-009

- Cubre: PRD-NFR-010, PRD-NFR-011
- Aserciones: pruebas Python y Node, suite completa, auditoría, Humanio estricto y diff check permanecen verdes
- Estado: passed-local

## TDD-TC-063 — Vinculación desde precio

- Cubre: BDD-SC-048, PRD-FR-032
- Aserciones: precio mensual produce descuento en MXN y porcentaje equivalentes contra el precio anual
- Estado: passed-local

## TDD-TC-064 — Vinculación desde dinero

- Cubre: BDD-SC-049, PRD-FR-032
- Aserciones: descuento en MXN produce precio mensual y porcentaje equivalentes
- Estado: passed-local

## TDD-TC-065 — Vinculación desde porcentaje

- Cubre: BDD-SC-050, PRD-FR-032
- Aserciones: porcentaje produce descuento en MXN y precio mensual con redondeo monetario
- Estado: passed-local

## TDD-TC-066 — Validación de representaciones

- Cubre: BDD-SC-051, PRD-FR-032
- Aserciones: el motor acepta dinero y porcentaje equivalentes y rechaza discrepancias
- Estado: passed-local

## TDD-TC-067 — Presupuesto mensual completo

- Cubre: BDD-SC-052, PRD-FR-033
- Aserciones: la disponibilidad del asesor equivale al tope mensual completo aunque exista diferencia contra catálogo
- Estado: passed-local

## TDD-TC-068 — Contrato HTTP del Cotizador

- Cubre: BDD-SC-052, BDD-SC-053, PRD-FR-033
- Aserciones: la previsualización devuelve máximo 1089 desde precio 6300 y precio final 5211 al aplicarlo
- Estado: passed-local

## TDD-TC-069 — Rechazo sobre el límite

- Cubre: BDD-SC-054, PRD-FR-033
- Aserciones: previsualización, alta y edición rechazan un descuento superior al tope
- Estado: passed-local

## TDD-TC-070 — Contrato visual de la barra

- Cubre: BDD-SC-052, BDD-SC-053
- Aserciones: la interfaz etiqueta el límite mensual y asigna `max_discount_mxn` al máximo de la barra
- Estado: passed-local

## TDD-TC-071 — Presupuesto con tope independiente

- Cubre: BDD-SC-055, BDD-SC-056, PRD-FR-034
- Aserciones: descuento incorporado 89 y tope 1089 producen saldo adicional 1000; descuento incorporado 1089 produce saldo cero
- Estado: passed-local

## TDD-TC-072 — Precio mensual autoritativo por HTTP

- Cubre: BDD-SC-055, BDD-SC-057, PRD-FR-034
- Aserciones: la previsualización inicia en el precio mensual y resta solo el adicional sobre el piso incorporado
- Estado: passed-local

## TDD-TC-073 — Contrato visual acumulado

- Cubre: BDD-SC-055, BDD-SC-056, BDD-SC-057
- Aserciones: la barra conserva piso, tope, relleno absoluto y convierte el valor total a descuento adicional antes de enviar
- Estado: passed-local

## TDD-TC-074 — Migración y persistencia del tope

- Cubre: PRD-FR-034, SDD-CMP-031
- Aserciones: esquema, lectura y guardado conservan `tope_descuento_mxn` separado de las representaciones vinculadas
- Estado: passed-local

## TDD-TC-075 — Derivación canónica por fila

- Cubre: BDD-SC-059, PRD-FR-035
- Aserciones: precio base 7015, mensual 6926 y Asesor 1000 producen incorporado 89 y tope 1089
- Estado: passed-local

## TDD-TC-076 — Independencia del saldo Asesor

- Cubre: BDD-SC-059
- Aserciones: cambiar precio del mes recalcula el descuento incorporado sin cambiar el dinero capturado para Asesor
- Estado: passed-local

## TDD-TC-077 — Canonicalización HTTP

- Cubre: BDD-SC-059, SDD-CMP-032
- Aserciones: la API recibe solo precio mensual y Asesor y persiste las representaciones derivadas exactas
- Estado: passed-local

## TDD-TC-078 — Contrato visual

- Cubre: BDD-SC-058, BDD-SC-060
- Aserciones: Programación muestra precio base fijo, Precio del mes, Descuento del mes y Asesor en dinero; Cotizador muestra precio base del catálogo
- Estado: passed-local

## TDD-TC-079 — Validación porcentual Nucle

- Cubre: BDD-SC-061
- Aserciones: acepta 0..100 y rechaza valores fuera del rango
- Estado: passed-local

## TDD-TC-080 — Elegibilidad por categoría

- Cubre: BDD-SC-063
- Aserciones: Híbrido y Semilla son elegibles; Agroquímico no
- Estado: passed-local

## TDD-TC-081 — Acumulación después del asesor
**Descripción:** `applyNucleDiscount` debe calcular el descuento sobre el precio neto (después del asesor) y sumar este beneficio.
**Entrada:** `category = 'Híbrido'`, `monthlyPrice = 900`, `priceAfterAdvisor = 800`, `percentage = 10`, `quantity = 2`
**Salida esperada:** `requestedUnitDiscount = 80`, `finalUnitPrice = 720`, `subtotal = 1440`
- Estado: passed-local

## TDD-TC-082 — Exclusión de Agroquímicos

- Cubre: BDD-SC-063
- Aserciones: precio y subtotal de Agroquímicos no cambian
- Estado: passed-local

## TDD-TC-083 — Contrato HTTP mixto

- Cubre: BDD-SC-062, BDD-SC-063
- Aserciones: previsualización mixta devuelve descuento, porcentaje y total correctos
- Estado: passed-local

## TDD-TC-084 — Esquema e interfaz

- Cubre: BDD-SC-061, BDD-SC-064, SDD-CMP-033
- Aserciones: migración aditiva, pestaña administrativa, casilla y payload existen
- Estado: passed-local

## TDD-TC-085 — Catálogo administrativo

- Cubre: BDD-SC-061
- Aserciones: GET completa doce meses y PUT persiste exactamente doce filas en transacción
- Estado: passed-local

## TDD-TC-086 — Persistencia decimal Nucle

- Cubre: BDD-SC-061, PRD-FR-036
- Aserciones: el porcentaje se redondea a dos decimales, la interfaz usa incrementos de `0.01` y el UPSERT retorna `mes` en lugar de una columna `id` inexistente
- Estado: passed-local

## TDD-TC-087 — Granularidad entera y sincronización bidireccional de Precio Final en Cotizador

- Cubre: BDD-SC-065, BDD-SC-066, PRD-FR-037, SDD-CMP-034
- Aserciones:
  1. El control deslizante del Cotizador declara `step="1"` y se configura con paso entero.
  2. Existe el campo editable `item-final-price-input` con control bidireccional.
  3. Al ingresar un precio final objetivo dentro de rango, se calcula el descuento adicional exacto y se sincroniza la posición del slider y totales.
  4. Al ingresar un precio inferior al mínimo permitido por el tope del asesor, se acota al límite máximo autorizado sin violar PROJECT-PR-018.
  5. Presionar Enter en `item-final-price-input` previene la acción por defecto (`event.preventDefault()`) impidiendo el auto-envío de la cotización.
  6. Los eventos de tecleo manual aíslan su propagación (`stopPropagation()`) evitando que `debouncedLiveCalculation` sobreescriba el campo mientras el usuario edita.
  7. Al desenfocar o confirmar (`blur` / `change` / `Enter`), `onFinalPriceInputBlur` invoca `debouncedLiveCalculation()`, solicitando el recálculo al servidor y refrescando la hoja virtual.
  8. `getQuotePayload` sincroniza el ítem derivando el descuento aplicado tanto del precio numérico manual como del slider, garantizando que el recálculo por cambio de bolsas preserve el precio fijado.
- Estado: passed-local

## TDD-TC-088 — Oráculo determinista Python de elegibilidad de Cuenta Clave (Calamar e Hipopótamo)

- Cubre: BDD-SC-067, BDD-SC-068, PRD-FR-038
- Aserciones:
  1. `is_key_account_eligible('Híbrido', 'Hipopótamo Acceleron')` y `is_key_account_eligible('Híbrido', 'Calamar')` retornan `True`.
  2. `is_key_account_eligible('Híbrido', 'Rinoceronte Acceleron')` y `is_key_account_eligible('Híbrido', 'Armadillo')` retornan `False`.
  3. `is_key_account_eligible('Agroquímico', 'Clavis')` y `is_key_account_eligible('Fertilizante', 'Urea')` retornan `False`.
  4. `calculate_item_net_price` aplica el descuento de Cuenta Clave a Calamar e Hipopótamo y lo excluye en cualquier otra semilla o químico.
- Estado: passed-local

## TDD-TC-089 — Motor de precios JS exclusivo para Calamar e Hipopótamo

- Cubre: BDD-SC-067, BDD-SC-068, PRD-FR-038, SDD-CMP-035
- Aserciones:
  1. `getNetPrice` en JS descuenta cuenta clave para Calamar e Hipopótamo.
  2. `getNetPrice` en JS NO descuenta cuenta clave para otras semillas (ej. Rinoceronte, Armadillo, Vitala).
  3. `getNetPrice` en JS NO descuenta cuenta clave para Agroquímicos (ej. Clavis) ni Fertilizantes.
  4. En `/api/cotizaciones/calcular`, una partida de producto no elegible para un cliente Cuenta Clave reporta `descuento_cuenta_clave_mxn = 0`.
- Estado: passed-local

## TDD-TC-090 — Endpoint de lectura y marcado de notificaciones

- Cubre: BDD-SC-069..071, PRD-FR-039, PRD-FR-041
- Aserciones: `GET /api/notificaciones` responde para cualquier rol autenticado y `POST /api/notificaciones/leido` actualiza `leido = 1` de forma segura.
- Estado: passed-local

## TDD-TC-091 — Agregador y filtrado contextual por rol (Asesor vs Administrador)

- Cubre: BDD-SC-069, BDD-SC-070, PRD-FR-040
- Aserciones: el agregador detecta visitas de hoy pendientes para el Asesor y cotizaciones por revisar/autorizar para el Administrador.
- Estado: passed-local

## TDD-TC-092 — Resolución de ciclo y carga de estadísticas en Tablero General

- Cubre: BDD-SC-072, PRD-FR-043, SDD-CMP-039
- Aserciones:
  1. `public/js/app.js` define adecuadamente la variable local `selectedCycle` en `loadDashboardData` a partir del selector `cycleSelect?.value || ''`.
  2. No existen referencias huérfanas o no declaradas a `selectedCycle` en el frontend.
  3. El endpoint `/api/dashboard/stats` responde 200 con la estructura completa de KPIs y progreso de metas con o sin parámetro de ciclo.
- Estado: passed-local

## TDD-TC-093 — Compatibilidad de columnas SQL en Reporte de Comisiones

- Cubre: BDD-SC-073, PRD-FR-044, SDD-CMP-040
- Aserciones:
  1. La consulta SQL en `/api/comisiones/reporte` proyecta `c.fecha_creacion AS fecha_cotizacion` evitando el error `column c.fecha_cotizacion does not exist`.
  2. El endpoint responde HTTP 200 con el listado de comisiones sin error 500.
- Estado: passed-local

## TDD-TC-094 â€” Aislamiento estricto de cartera en Seguimiento para Asesores

- Cubre: BDD-SC-075, PRD-FR-046, SDD-CMP-042
- Aserciones:
  1. Solicitud con rol Asesor a `/api/seguimiento/dashboard` responde 200 y fuerza `targetAsesorId = req.user.id`.
  2. Si el Asesor envÃ­a `?asesor_id=ALL` o `?asesor_id=99`, el backend descarta el parÃ¡metro y devuelve solo sus registros.
  3. Roles sin permisos comerciales o directivos (ej. Almacen) reciben 403 Forbidden.
- Estado: passed-local

## TDD-TC-095 â€” NavegaciÃ³n e interfaz de Seguimiento para Asesores

- Cubre: BDD-SC-074, BDD-SC-076, PRD-FR-045, SDD-CMP-041
- Aserciones:
  1. `public/index.html` y `public/js/app.js` exponen el elemento de menÃº de seguimiento para `Asesor`.
  2. `switchView` permite cambiar a `seguimiento-view` con tÃ­tulo "Mi Seguimiento" para el rol Asesor.
  3. Para el rol Asesor, el selector `#sf-filter-asesor` se oculta en la vista.
- Estado: passed-local

## TDD-TC-096 — Autorización de lectura de existencias y protección de mutaciones para Asesores (Superado por TDD-TC-098 en CHG-022)

- Cubre: BDD-SC-077, BDD-SC-078, PRD-FR-047, SDD-CMP-043
- Aserciones:
  1. `INVENTORY_ROLES` incluye `Asesor` (superado en CHG-022 donde se excluye).
  2. Peticiones de Asesor a `POST /api/almacen/existencias/:id/ajuste` responden HTTP 403 Forbidden.
  3. Peticiones de Asesor a `POST /api/almacen/movimientos` responden HTTP 403 Forbidden.
- Estado: superado-por-chg022

## TDD-TC-097 — Filtrado por servidor y paginación de agricultores en puja

- Cubre: BDD-SC-079, PRD-FR-048, SDD-CMP-044
- Aserciones:
  1. `GET /api/asignacion/sin-asesor?puja=1` filtra estrictamente por `disponible_para_puja = 1`.
  2. `public/index.html` declara `#bids-search-input`, `#bids-count-badge` y `#bids-pagination`.
  3. `public/js/app.js` consume `/api/asignacion/sin-asesor?puja=1` y pagina en bloques de 50 registros.
- Estado: passed-local

## TDD-TC-098 — Exclusión de Asesor en INVENTORY_ROLES y denegación perimetral HTTP 403

> Acotado por TDD-TC-120/CHG-025: `GET /api/almacen/existencias` queda permitido en modo totalizado; las demás rutas permanecen denegadas.

- Cubre: BDD-SC-082, PRD-FR-049, SDD-CMP-045
- Aserciones:
  1. `INVENTORY_ROLES` excluye terminantemente a `ROLES.ADVISOR` (`Asesor`).
  2. Middleware `requireRoles(INVENTORY_ROLES)` rechaza a cualquier usuario con `user.nivel_rol === 'Asesor'` con HTTP 403 Forbidden y no llama a `next()`.
  3. `server.js` mantiene blindada la ruta `/api/almacen` con `authenticateToken` y `requireRoles(INVENTORY_ROLES)`.
- Estado: passed-local

## TDD-TC-099 — Ocultamiento de Almacén en interfaz y guardia en enrutador de cliente

> Acotado por TDD-TC-120/CHG-025: el Asesor ve existencias generales, pero no pestañas operativas ni tamaños.

- Cubre: BDD-SC-080, BDD-SC-081, BDD-SC-083, PRD-FR-049, SDD-CMP-045
- Aserciones:
  1. `public/index.html` asigna la clase `inventory-access-only` y estilo `display: none;` al elemento `li.nav-item[data-target="almacen-view"]`.
  2. `public/js/app.js` oculta los elementos `.inventory-access-only` para usuarios con rol `Asesor`.
  3. `public/js/app.js` en `switchView` redirige a `dashboard-view` si un `Asesor` intenta activar `almacen-view`.
- Estado: passed-local

## TDD-TC-100 — Definición de ROLES.OBSERVER y denegación de mutaciones a planificación

- Cubre: BDD-SC-087, PRD-FR-051, SDD-CMP-046
- Aserciones:
  1. `ROLES.OBSERVER` está definido como `'Observador'` en `middleware/authorization.js`.
  2. `POST /api/planificacion` rechaza solicitudes de `Observador` con HTTP 403 Forbidden.
  3. `PUT /api/planificacion/:id` rechaza solicitudes de `Observador` con HTTP 403 Forbidden.
  4. `POST /api/planificacion/:id/convertir-prospecto` rechaza solicitudes de `Observador` con HTTP 403 Forbidden.
  5. `POST /api/reportes-etapa` rechaza solicitudes de `Observador` con HTTP 403 Forbidden.
- Estado: passed-local

## TDD-TC-101 — Interfaz de Planificación: exposición de filtro de asesores y modo solo lectura

- Cubre: BDD-SC-084, BDD-SC-085, BDD-SC-086, PRD-FR-050, PRD-FR-051, SDD-CMP-047
- Aserciones:
  1. `public/index.html` y `public/js/app.js` exponen el filtro de asesores `#plan-advisor-filter` para el rol `Observador`.
  2. `public/js/app.js` oculta el botón "Agendar Visita" (`#btn-open-plan-modal`) para el rol `Observador`.
  3. `public/js/app.js` en `loadWeeklySchedule` omite botones de acción en tarjetas para `Observador`.
  4. `public/js/app.js` en `openEditPlanModal` activa modo solo lectura deshabilitando inputs y ocultando botón de guardar cuando el rol es `Observador`.
- Estado: passed-local

## TDD-TC-102 — Catálogo de roles en Administración incluye opción Observador

- Cubre: BDD-SC-088, PRD-FR-050, SDD-CMP-047
- Aserciones:
  1. `public/index.html` incluye `<option value="Observador">` dentro de `#asesor-role`.
  2. `public/js/app.js` reconoce `Observador` al inicializar la sesión y enrutador.
- Estado: passed-local

## TDD-TC-103 — Recálculo reactivo inmediato y sincronización de totales en Cotizador para cualquier rol y dispositivo

> Acotado por ADR-016/CHG-025: se conserva el cálculo interno y el subtotal por partida, pero se eliminan el resumen, total visible, puntos, cupón y hoja virtual del Cotizador.

- Cubre: BDD-SC-089, PRD-FR-037, SDD-CMP-034
- Aserciones:
  1. `recalcTotalsWithDiscounts` prioriza el precio unitario del campo numérico manual `item-final-price-input` si contiene un valor válido, o en su defecto el precio derivado del slider (`basePrice - additional - nucle`).
  2. Modificar la cantidad (`item-qty-input` o botones `+`/`-`) invoca `recalcTotalsWithDiscounts` inmediatamente y actualiza el subtotal interno de la partida sin esperar la respuesta asíncrona del backend.
  3. Modificar el precio final manual (`item-final-price-input`) actualiza el subtotal interno; el servidor conserva la autoridad del importe persistido.
  4. `.mobile-item-subtotal` permanece visible en el formulario; la tarjeta `.mobile-quote-summary` queda suprimida por ADR-016/CHG-025 para todos los tamaños y roles.
  5. `updateVirtualSheet` y los nodos `preview-*` no existen en el contrato CHG-025.
- Estado: passed-local

## TDD-TC-104 — Lista blanca de manejadores en SecurityUtils permite eliminar salidas de almacén y capturar precios

- Cubre: BDD-SC-090, BDD-SC-091, SDD-SEC-012
- Aserciones:
  1. `allowedHandlerFunctions` en `public/js/security.js` contiene `deleteWarehouseMovement`, `onFinalPriceInputChange` y `onFinalPriceInputBlur`.
  2. `SecurityUtils.isAllowedHandler` valida positivamente llamadas directas a estas funciones con argumentos numéricos o `this`.
  3. `SecurityUtils.installInnerHtmlGuard` preserva intactos los atributos `onclick="deleteWarehouseMovement(...)"` y `oninput="onFinalPriceInputChange(this)"` tras la inyección HTML.
- Estado: passed-local

## TDD-TC-105 — Captura reactiva de precio final manual y coordinación con cantidad en Cotizador

- Cubre: BDD-SC-091, PRD-FR-037, SDD-CMP-034
- Aserciones:
  1. En `addQuoteItemRow`, `.item-final-price-input` se enlaza directamente con listeners para los eventos `input`, `change` y `blur`.
  2. `handleBuilderContainerInput` y `handleBuilderContainerChange` no descartan ni abortan prematuramente los eventos originados en `.item-final-price-input`.
  3. `recalcTotalsWithDiscounts` sincroniza el subtotal de la fila y el gran total al valor exacto del precio manual por la cantidad.
- Estado: passed-local

## TDD-TC-106 — Estandarización de 10 calibres en híbridos y corrección de categoría Muralla Max

- Cubre: BDD-SC-092, PRD-CAT-005, SDD-DB-018
- Aserciones:
  1. La base de datos y `db.js` configuran los 10 calibres oficiales (`BT1, BT2, BT3, BW1, BW2, PT1, PT2, PT3, PW1, PW2`) para los productos híbridos activos.
  2. `MURALLA MAX 250ML` tiene `tipo_categoria = 'Agroquímicos'`.
  3. `getSizesForProduct` devuelve los 10 calibres para `A-7573 ACCELERON` y `A-7573 PONCHO`.
- Estado: passed-local

## TDD-TC-107 — Normalización y persistencia de ciclo manual en movimientos de almacén

- Cubre: BDD-SC-093, PRD-FR-052
- Aserciones:
  1. `normalizeMovementItems` extrae `ciclo` / `ciclo_agricola` de las partidas tanto en payload multi-ítem como legado.
  2. Al recibir un texto manual de ciclo (ej. "O-I 2026"), se limpia y normaliza como string no vacío.
  3. Si el ciclo no se proporciona, se normaliza como null.
- Estado: passed-local

## TDD-TC-108 — Desglose y agregación determinista de existencias físicas por lote por producto

- Cubre: BDD-SC-095, PRD-FR-053
- Aserciones:
  1. La función de agregación agrupa movimientos de inventario por producto y desglosa lotes con saldo neto $> 0$.
  2. Para un producto como "Hipopótamo" con 150.000 dividido en Lote X (90.000), Lote Y (20.000) y Lote Z (40.000), genera la estructura correcta con `totalStock = 150.000` y el array de lotes.
  3. Los lotes agotados (saldo 0 o menor) se excluyen del desglose activo.
- Estado: passed-local

## TDD-TC-109 — Integración de interfaz y exportación CSV con ciclo y desglose visual de lotes

- Cubre: BDD-SC-094, BDD-SC-095, PRD-FR-052, PRD-FR-053
- Aserciones:
  1. `exportKardexToCSV` genera la cabecera "Ciclo" y proyecta el valor `ciclo_agricola` en las filas exportadas.
  2. `addWarehouseMovementItem` y `updateOperationUI` exponen el campo `.move-item-ciclo` exclusivamente al seleccionar Entrada en cada partida y lo ocultan en Salida.
  3. La cabecera de Entrada no contiene el campo global `#move-ciclo-entrada`, garantizando que la captura sea individual por renglón.
  4. La tabla de existencias genera la fila secundaria con `.lot-breakdown-row` para productos con saldo positivo.
- Estado: passed-local

## TDD-TC-110 — Migración garantizada y autorrecuperación de columna `ciclo_agricola` en `almacen_movimientos`

- Cubre: BDD-SC-096, PRD-FR-052
- Aserciones:
  1. `initSchema` en `db.js` no aborta las migraciones de `almacen_movimientos` por requerir que las 7 tablas existan simultáneamente (`cnt < 7`), sino que asegura la tabla `metas_ventas` (`CREATE TABLE IF NOT EXISTS metas_ventas`) y valida solo las tablas núcleo mínimas o aplica las columnas sobre `almacen_movimientos` siempre que exista.
  2. Se expone una función auxiliar de aseguramiento de columnas de almacén (`ensureWarehouseMovementsSchema`) y autorrecuperación en `POST /api/almacen/movimientos` que ante un error `column "ciclo_agricola" of relation "almacen_movimientos" does not exist` ejecuta `ALTER TABLE almacen_movimientos ADD COLUMN IF NOT EXISTS ciclo_agricola TEXT` y reintenta la operación exitosamente.
- Estado: passed-local

## Casos TDD del Incremento CHG-025

### TDD-TC-111 — Contratos puros por condición
- Cubre: BDD-SC-097, BDD-SC-100, BDD-SC-103; PRD-FR-054, PRD-FR-056, PRD-FR-057.
- Verifica normalización, campos permitidos, `precio lleno * 1.08`, total cero de Apartado y prohibición de beneficios.
- Estado: passed-local

### TDD-TC-112 — Precio propuesto informativo por partida
- Cubre: BDD-SC-098; PRD-FR-055.
- Verifica opcionalidad, validación no negativa, persistencia y ausencia de efecto monetario.
- Estado: passed-local

### TDD-TC-113 — Elegibilidad Contado por venta y cobro
- Cubre: BDD-SC-099; PRD-FR-055.
- Verifica orden independiente, segunda confirmación e idempotencia.
- Estado: passed-local

### TDD-TC-114 — Autorización por rol y condición
- Cubre: BDD-SC-102; PRD-FR-058, SDD-SEC-013.
- Verifica Administrador/Coordinador, 403 para Asesor/Almacén y rechazo sin solicitud.
- Estado: passed-local

### TDD-TC-115 — Documento institucional PDF
- Cubre: BDD-SC-101; PRD-FR-056, PRD-NFR-012.
- Verifica MIME, firma `%PDF`, límite, reemplazo administrativo y lectura comercial.
- Estado: passed-local

### TDD-TC-116 — Validación de asignación mult tamaño
- Cubre: BDD-SC-104, BDD-SC-105; PRD-FR-059.
- Verifica suma exacta, mismo producto, cantidades positivas y tamaños no repetidos.
- Estado: passed-local

### TDD-TC-117 — Disponibilidad física menos reservas
- Cubre: BDD-SC-104, BDD-SC-105; PRD-FR-059.
- Verifica cálculo por producto/tamaño y fallo completo ante insuficiencia.
- Estado: passed-local

### TDD-TC-118 — Transacción, concurrencia e idempotencia de reservas
- Cubre: BDD-SC-105; PRD-FR-059, PRD-NFR-012.
- Requiere PostgreSQL aislado para dos asignaciones concurrentes y replay.
- Automatización: `test/chg025_postgres_reservations.test.js`, ejecutable con `CHG025_TEST_POSTGRES_URL`; crea y elimina un esquema efímero, usa la ruta HTTP real y verifica `[201, 409]`, una sola reserva activa y replay `200` sin duplicación.
- CI: `.github/workflows/chg025-postgres.yml` provisiona PostgreSQL 16 para ejecución manual o en pull request.
- Estado: implemented-pending-postgresql-execution

### TDD-TC-119 — Entrega, liberación y reversión
- Cubre: BDD-SC-106; PRD-FR-059.
- Verifica transiciones y que cada efecto físico ocurra exactamente una vez.
- Estado: passed-local

### TDD-TC-120 — Contrato visual y regresión del Cotizador
- Cubre: BDD-SC-097..103; PRD-FR-054..058.
- Verifica DOM condicionado, etiquetas, filtros, ausencia de tamaños/resumen y acciones por rol.
- Verifica además que Administración no reciba ni edite calibres en el catálogo comercial, que el backend redacte tamaños en catálogo, propuestas y Kardex para cualquier rol distinto de Almacén, y que solo `Almacen` y `Administrador` puedan filtrar lotes por tamaño o registrar movimientos manuales de semilla con tamaño (rechazando con 403 a `Coordinador` y demás roles).
- Estado: passed-local

## Casos TDD del arnés CHG-026

No cubren una regla comercial nueva. El detalle está en `docs/cambios/CHG-026/casos-tdd.md`.

### TDD-TC-121 — Contrato OpenAPI 3.1 del API de bots

- Cubre: HARNESS-REQ-001, ADR-017, y desde CHG-027 también ADR-018 y ADR-019.
- Archivo: `test/contract/bot_v1_openapi.test.js`.
- Estado: el documento describe la lectura y las claves. La prueba valida la salud real, el 401 de una clave ausente y los ejemplos. Un campo de más, un lote con reservado o una clave dentro del listado no pasan.

### TDD-TC-122 — Muestra Gherkin por HTTP

- Cubre: BDD-SC-034, BDD-SC-036, BDD-SC-100, BDD-SC-103 y la suma inválida de BDD-SC-105.
- Comando: `npm run test:bdd`.
- Estado: implementado en la rama.

### TDD-TC-123 — Reserva ficticia en PostgreSQL 16

- Cubre: BDD-SC-104.
- Archivo: `test/integration/postgres_fake_seed.test.js`.
- Estado: implementado. Se omite sin URL y se ejecuta en CI.

## Casos TDD de CHG-027

Implementados en la rama. El detalle está en `docs/cambios/CHG-027/casos-tdd.md`. Merge y despliegue siguen pendientes.

### TDD-TC-124 — Hash, alta y revocación

- Cubre: BDD-SC-111, BDD-SC-112, BDD-SC-118, PRD-FR-060.
- Estado: implementado en la rama. Sin merge.

### TDD-TC-125 — Alcance y rol

- Cubre: BDD-SC-113, BDD-SC-114, BDD-SC-115, PRD-FR-062.
- Estado: implementado en la rama. Sin merge.

### TDD-TC-126 — Disponible, tamaños y lotes

- Cubre: BDD-SC-108, BDD-SC-109, PRD-FR-061.
- Estado: implementado en la rama. Sin merge.

### TDD-TC-127 — Movimientos sin datos de personas

- Cubre: BDD-SC-110, PRD-NFR-013.
- Estado: implementado en la rama. Sin merge.

### TDD-TC-128 — Límite por clave

- Cubre: BDD-SC-116, PRD-NFR-013.
- Estado: implementado en la rama. Sin merge.

### TDD-TC-129 — Auditoría

- Cubre: BDD-SC-117, PRD-NFR-013.
- Estado: implementado en la rama. Sin merge.

### TDD-TC-130 — Gherkin de aceptación

- Cubre: BDD-SC-107..118.
- Estado: implementado en la rama. Sin merge. Los escenarios de `features/chg027_bot_inventario.feature` se ejecutan.

### TDD-TC-134 — Cursor cuando hay más filas que `limite`

- Cubre: BDD-SC-125, PRD-FR-061.
- Archivo: `test/chg027_bot_paginacion.test.js`.
- Verifica que `GET /api/v1/bot/inventario/productos` y `GET /api/v1/bot/inventario/movimientos` responden 200 con `paginacion.siguiente` no nulo cuando `limite` es menor que el número de filas, y que la consulta con ese cursor devuelve la página siguiente.
- Estado: corrección en la rama. Sin merge. El fallo previo era 500 `ERROR_INTERNO` porque `utils/botInventory.js` usaba `encodeCursor` sin importarlo.

## Casos TDD del Incremento CHG-028

### TDD-TC-131 — Creación HTTP y autorrecuperación de esquema en `POST /api/cotizaciones` para `CREDITO` y `APARTADO`

- Cubre: BDD-SC-119, BDD-SC-120, PRD-FR-054, PRD-FR-056, PRD-FR-057, PRD-FR-063.
- Archivo: `test/chg025_internal_proposals_reservations.test.js`.
- Verifica que `db.ensureQuotationsSchema` asegura las columnas de `cotizaciones` y `cotizacion_detalles` y elimina `NOT NULL` en `temporada_id`, y que `POST /api/cotizaciones` persiste solicitudes `CREDITO` y `APARTADO` con código 201 y autorrecuperación ante errores PostgreSQL `42703` o `23502`.
- Estado: passed-local.

### TDD-TC-132 — Saneamiento de payload y slider en Cotizador al cambiar a `CREDITO` o `APARTADO`

- Cubre: BDD-SC-119, BDD-SC-120, PRD-FR-054, PRD-FR-063.
- Archivo: `test/chg025_internal_proposals_reservations.test.js`.
- Verifica que `getQuotePayload()` en `public/js/app.js` fuerce `descuento_aplicado = 0` y `precio_propuesto = null` cuando `condiciones_pago !== 'CONTADO'`, y que `debouncedLiveCalculation()` restablezca `slider.max = 0` cuando la condición no admite descuento de asesor.
- Estado: passed-local.


## Casos TDD del Incremento CHG-029

### TDD-TC-133 — Movimientos manuales de semilla y filtro de lotes por tamaño para Administrador con exclusividad de Solicitudes en Almacén

- Cubre: BDD-SC-121, PRD-FR-054, PRD-FR-059, PRD-FR-064, SDD-SEC-013.
- Archivo: `test/chg025_internal_proposals_reservations.test.js`.
- Verifica que `Administrador` pueda filtrar `GET /api/almacen/lotes-disponibles` por `tamano` (`200`) y registrar entradas/salidas manuales de semilla con `tamano` en `POST /api/almacen/movimientos` (`201`), que `Coordinador` reciba `403` en ambas operaciones, que `public/js/app.js` habilite `#cat-btn-semilla`, productos `Híbrido`/`Semilla` y selector de calibres en el formulario de movimientos para `['Almacen', 'Administrador']`, y que `GET /api/almacen/solicitudes` y `#tab-solicitudes` permanezcan exclusivos de `Almacen` (`403` para `Administrador`).
- Estado: passed-local.
