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

## Incremento CHG-007 — Atomicidad comercial completa

### OBJ-009 — Evitar cotizaciones y prospectos parciales

### PRD-FR-021 — Creación unitaria

Cabecera, detalles, vínculo con prospecto o planeación, reporte de etapa y transición comercial se confirman en una transacción.

### PRD-FR-022 — Edición unitaria

Reversión de inventario, reemplazo de detalles, cabecera y nueva salida de una cotización entregada se confirman juntos.

### PRD-FR-023 — Conversión serializada

Planificación→prospecto bloquea la planificación, revalida elegibilidad y reutiliza el prospecto existente ante repetición.

### PRD-NFR-008 — Fallo cerrado

Cantidades inválidas o saldo insuficiente abortan antes de confirmar; una carrera responde conflicto sin dejar efectos parciales.

## Incremento CHG-008 — Salud operativa y ciclo de vida

### OBJ-010 — Detectar degradación y cerrar sin pérdida evitable

### PRD-FR-024 — Sonda de vida

`GET /health/live` responde `200` mientras el proceso HTTP está activo y no depende de PostgreSQL.

### PRD-FR-025 — Sonda de disponibilidad

`GET /health/ready` ejecuta una consulta acotada a PostgreSQL y responde `200 ready` o `503 degraded` sin divulgar el error interno.

### PRD-FR-026 — Correlación segura

Cada solicitud recibe un `X-Request-ID` validado o generado, lo devuelve en la respuesta y emite un evento de cierre sin query string, cuerpos, identidad o PII.

### PRD-FR-027 — Apagado ordenado

Ante `SIGTERM` o `SIGINT`, el proceso deja de aceptar conexiones, detiene nuevas ejecuciones del scheduler, espera el trabajo activo y cierra el pool una sola vez.

### PRD-NFR-009 — Degradación acotada

La disponibilidad falla cerrada dentro del timeout configurado y el apagado tiene un límite explícito para evitar procesos colgados.

## Incremento CHG-009 — Precio mensual y presupuesto de descuento

### OBJ-011 — Evitar que la reducción mensual duplique la facultad de descuento

### PRD-FR-028 — Precio mensual operativo

El Cotizador usa `crm_precios_mensuales.precio` del mes contractual como precio base operativo, visible y persistido. El catálogo anual permanece como referencia para medir la reducción mensual.

Criterio de aceptación: para catálogo `7,015` y agosto `6,300`, Cotizador y PDF muestran `6,300` como precio de lista antes de beneficios automáticos.

### PRD-FR-029 — Presupuesto total y saldo del asesor

La promoción mensual es el presupuesto total desde el precio anual. La reducción mensual lo consume y solo la diferencia no negativa queda disponible al asesor. Una promoción porcentual se calcula sobre el precio anual; volumen, temporada y Cuenta Clave no consumen este saldo.

Criterio de aceptación: catálogo `7,015`, mensual `6,300` y tope `1,089` producen reducción `715` y saldo adicional `374`.

### PRD-FR-030 — Autoridad única del servidor

Previsualización, creación, edición, conversión desde planificación y Outreach usan el mismo contrato. El servidor rechaza descuentos superiores al saldo y configuraciones donde la reducción mensual exceda el tope.

Criterio de aceptación: alterar el payload del navegador no incrementa el descuento permitido y responde `400` sin persistir.

### PRD-FR-031 — Histórico auditable

Las nuevas partidas conservan los importes que explican su precio: catálogo, mensual, reducción mensual, tope total y descuento del asesor. Cambios posteriores de catálogo o Programación no recalculan cotizaciones existentes.

### PRD-NFR-010 — Aritmética monetaria determinista

El runtime calcula importes en centavos y redondea mitades hacia arriba. Casos dorados generados con Python `Decimal` deben coincidir con JavaScript.

### PRD-NFR-011 — Compatibilidad gobernada

Partidas anteriores permanecen legibles como contrato legado y no se infieren desgloses imposibles desde la diferencia entre lista y neto.

## Incremento CHG-010 — Representaciones vinculadas en Programación

### OBJ-012 — Evitar discrepancias al capturar precio y descuento

### PRD-FR-032 — Vinculación bidireccional

En Programación, `precio`, `promo_dinero` y `promo_porcentaje` se calculan contra `productos.list_price_mxn`. Editar cualquiera recalcula los otros dos; el precio se propaga desde el mes editado y los descuentos directos afectan solo su mes.

Criterio de aceptación: con catálogo `7,015`, capturar descuento `1,089` produce precio mensual `5,926` y porcentaje `15.5239`; las tres representaciones guardadas equivalen al mismo centavo.

## Incremento CHG-011 — Tope mensual completo en Cotizador

### OBJ-013 — Cotizar desde el precio mensual hasta el límite configurado

### PRD-FR-033 — Barra con tope mensual completo

El Cotizador inicia en `crm_precios_mensuales.precio` y permite aplicar de cero hasta el tope promocional completo del mismo mes. La diferencia entre catálogo y precio mensual es informativa y no reduce el rango de la barra.

Criterio de aceptación: con precio mensual `6,300` y tope `1,089`, la barra muestra máximo `1,089`, acepta ese importe y produce precio final `5,211`; rechaza `1,089.01`.

## Incremento CHG-012 — Barra acumulada desde Programación

### OBJ-014 — Representar sin duplicación el descuento mensual ya incorporado

### PRD-FR-034 — Precio efectivo, piso acumulado y tope independiente

El precio inicial del Cotizador es el precio efectivo mostrado en Programación. La barra representa el descuento total acumulado contra catálogo: inicia en la reducción ya incorporada al precio mensual y termina en el tope autorizado independiente. Solo la diferencia entre el valor elegido y el descuento incorporado reduce nuevamente el precio mensual.

Si el descuento incorporado ya equivale al tope, la barra aparece al cien por ciento y queda sin recorrido adicional. El servidor conserva por separado `precio`, descuento incorporado y tope autorizado, y rechaza cualquier descuento adicional que exceda el saldo.

Criterios de aceptación:
- catálogo `7,015`, precio mensual `5,926`, descuento incorporado `1,089` y tope `1,089`: la barra inicia y termina en `1,089`, el precio inicial/final es `5,926` y el saldo adicional es cero;
- catálogo `7,015`, precio mensual `6,926`, descuento incorporado `89` y tope `1,089`: la barra inicia visualmente en `89`, puede llegar a `1,089` y en el extremo descuenta únicamente `1,000` adicionales del precio mensual.

## Incremento CHG-013 — Precio base, precio del mes y saldo Asesor

### OBJ-015 — Capturar el margen comercial con términos operativos

### PRD-FR-035 — Contrato visible de Programación y Cotizador

Programación muestra junto al producto su precio base inmutable, tomado de `productos.list_price_mxn`. Por mes permite capturar `Precio del mes`, su `Descuento del mes ($)` vinculado y `Asesor ($)`, donde Asesor es el dinero adicional que todavía puede otorgarse. El descuento incorporado se deriva como precio base menos precio del mes y el tope acumulado se deriva como descuento incorporado más Asesor.

Cotizador etiqueta y muestra el precio base. Su barra inicia en el descuento incorporado del precio del mes y termina después de agregar el saldo Asesor configurado; al servidor solo se envía la parte adicional elegida.

Criterio de aceptación: con precio base `7,015`, precio del mes `6,926` y Asesor `1,000`, Programación deriva descuento incorporado `89` y tope acumulado `1,089`; Cotizador muestra precio base `7,015`, inicia la barra en `89` y permite llevarla hasta `1,089`.

## Incremento CHG-014 — Catálogo y beneficio Nucle

### OBJ-016 — Aplicar un beneficio mensual exclusivo para semillas

### PRD-FR-036 — Nucle mensual opcional

Administración incluye un catálogo Nucle con exactamente los meses de enero a diciembre y un porcentaje entre 0 y 100 para cada mes. Cotizador incluye una casilla Nucle desmarcada por defecto.

Al marcarla, el servidor toma el porcentaje del mes contractual y calcula el descuento por unidad sobre el Precio del mes de cada producto cuya categoría sea `Híbrido` o `Semilla`. Nucle no aplica a Agroquímicos ni otras categorías y se acumula independientemente después del descuento del asesor. El total nunca puede ser negativo.

La cotización guarda si Nucle fue aplicado, el porcentaje usado, el descuento total y el descuento unitario de cada partida para conservar el histórico.

Criterio de aceptación: con Híbrido mensual `900`, descuento asesor `100` y Nucle `10%`, el precio final unitario es `710`; un Agroquímico de `500` incluido en la misma cotización permanece en `500`.

- catálogo `7,015`, precio mensual `5,926`, descuento incorporado `1,089` y tope `1,089`: la barra inicia y termina en `1,089`, el precio inicial/final es `5,926` y el saldo adicional es cero;
- catálogo `7,015`, precio mensual `6,926`, descuento incorporado `89` y tope `1,089`: la barra inicia visualmente en `89`, puede llegar a `1,089` y en el extremo descuenta únicamente `1,000` adicionales del precio mensual.

## Incremento CHG-016 — Precisión en Cotizador con paso entero y captura directa de precio final

### OBJ-017 — Ajuste de precisión y agilidad en cotizaciones comerciales

### PRD-FR-037 — Control bidireccional y de precisión de precio y descuento en Cotizador

El Cotizador permite establecer precios con total exactitud de dos formas complementarias y sincronizadas:
1. La barra de descuento del asesor avanza en pasos enteros de 1 en 1 peso (`step="1"`), evitando brincos erráticos y centavos aleatorios en dispositivos móviles, tablets táctiles y pantallas de escritorio.
2. El campo `Precio Final (con descuento)` es un control editable directamente por el usuario. Al escribir un precio objetivo, el sistema calcula automáticamente el descuento requerido, mueve la barra a la posición equivalente y actualiza el descuento aplicado y los totales generales.

Reglas comerciales:
- Si el usuario ingresa un precio inferior al mínimo permitido (que requeriría un descuento superior al tope autorizado para el mes), el sistema acota el valor al precio mínimo permitido sin rebasar el tope autorizado del servidor (PROJECT-PR-018).
- Si el usuario ingresa un precio superior al precio base neto (descuento negativo), el sistema acota el valor al precio base neto (descuento adicional 0).
- Al mover la barra de desplazamiento, el campo de precio final se actualiza de forma inmediata y continua.
- Al modificar el precio final o la barra, los subtotales de la partida y el total global de la cotización se recalculan en tiempo real.

## Incremento CHG-017 — Descuento de Cuenta Clave exclusivo para semillas

### OBJ-018 — Aplicación estricta y determinista del beneficio de Cuenta Clave

### PRD-FR-038 — Exclusión de Cuenta Clave en Agroquímicos y restricción a semillas

El beneficio monetario por nivel de Cuenta Clave (ej. Adquirir, Desarrollar, Retener, Retener GOLD) es un incentivo exclusivo para la adquisición de semillas:
1. Aplica únicamente a productos cuya categoría sea `Híbrido` o `Semilla` (ej. Hipopótamo, Calamar, Rinoceronte, Armadillo, Vitala, A-7573).
2. Queda expresamente excluido de productos con categoría `Agroquímico` o `Fertilizante` (ej. Clavis, Faena, Muralla Max, Provivi, Urea).
3. Para partidas no elegibles, el descuento por cuenta clave es $0.00 MXN, el precio neto no sufre deducción por cuenta clave y el bloque visual `🔑 Cuenta Clave` permanece oculto en Cotizador.
4. Los cálculos deterministas en Python (`pricing_reference.py`, `cotizador.py`) y el runtime Node.js (`utils/pricing.js`, `server.js`) deben producir resultados idénticos y reproducibles.

## Incremento CHG-018 — Centro de notificaciones contextuales y popover en tablero

### OBJ-019 — Notificaciones contextuales según el rol y soporte shadcn

Proveer alertas operativas oportunas y contextuales en el encabezado del tablero (campana interactiva), segmentadas por rol de usuario, y compatibilidad con el ecosistema de componentes React shadcn UI.

### PRD-FR-039 — Icono y disparador de notificaciones

El encabezado del tablero general debe mostrar un icono de campana arriba a la derecha con un indicador animado de pulso cuando existan elementos sin atender.

Criterio de aceptación: el icono es visible en escritorio y móvil, indicando el número o presencia de pendientes no leídos.

### PRD-FR-040 — Notificaciones contextuales por rol

- **Asesor**: Notifica visitas programadas para hoy que estén pendientes (`realizada = 0`), así como alertas de asignación de cartera.
- **Administrador**: Notifica cotizaciones pendientes de revisión y aprobación (`Borrador`, `Pendiente`, `Pendiente Autorización`), así como avisos del sistema.
- **Otros roles**: Notificaciones operativas y de almacén.

Criterio de aceptación: al iniciar sesión como Asesor se muestran las visitas de hoy; como Administrador se muestran las cotizaciones por autorizar.

### PRD-FR-041 — Popover estructurado y responsivo

El centro de notificaciones debe abrirse como un Popover flotante en escritorio y como Bottom Sheet en móvil, con pestañas ("Todas", "No leídas", "Archivadas"), buscador y enlace de acción rápida a cada elemento.

Criterio de aceptación: hacer clic en una notificación navega al recurso (visita o cotización) y permite marcar como leída.

### PRD-FR-042 — Componentes base shadcn / React / TypeScript

Se proveen los componentes `/components/ui/vercel-notification-popover.tsx` y `demo.tsx` compatibles con shadcn UI, Tailwind CSS y TypeScript.
