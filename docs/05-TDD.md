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
