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
