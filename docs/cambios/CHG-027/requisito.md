# Requisito — CHG-027

- ID de requisito: PRD-FR-060, PRD-FR-061, PRD-FR-062, PRD-NFR-013
- Objetivo: OBJ-023
- Cambio: CHG-027
- Decisión: ADR-018, ADR-019
- Estado: especificación aprobada y alineada con CHG-028/029. La implementación sigue en este mismo cambio.

## Enunciado

Un bot con clave vigente y alcance `inventario:leer` consulta el disponible de los productos activos. La cifra de producto es el último saldo físico menos las reservas activas. El detalle y los movimientos respetan el rol resuelto en el momento de la llamada. La clave se guarda solo como hash, el administrador la revoca, cada clave tiene límite propio y cada llamada reconocida queda en una auditoría sin datos de personas.

## Reglas

- `PRD-FR-060`. Alta, listado y revocación de claves son de Administrador y usan la sesión ya existente. La clave en claro sale una sola vez. Hace falta exactamente `asesor_id` o `rol_visibilidad`.
- `PRD-FR-061`. Las tres lecturas son `GET` y no escriben movimientos ni reservas. La salud pública no lleva inventario. El detalle de Almacén trae tamaños y lotes. El detalle de Administrador trae lotes físicos y no el arreglo de tamaños. Los movimientos incluyen los renglones manuales; `tipo` es el `tipo_movimiento` guardado.
- `PRD-FR-062`. Asesor ve solo `disponible`. Almacén ve tamaños y lotes físicos. Administrador ve las tres cifras, los lotes del detalle y movimientos con lote y sin tamaño. Coordinador, Director y Acopio ven las tres cifras y movimientos con lote y sin tamaño. Observador recibe 403.
- `PRD-NFR-013`. Límite por clave, mismo cuerpo de error para clave inválida y revocada, auditoría sin cuerpo ni secreto, y respuestas sin cliente, correo, teléfono, precio, nota, factura ni folio.
- Las cantidades se redondean a tres decimales. Un disponible negativo se devuelve negativo.
- Paginación por cursor opaco, `limite` de 1 a 100 y 50 por defecto.
- Un parámetro de consulta no declarado responde 400.
- `q` y `categoria` no distinguen mayúsculas ni diacríticos. La respuesta devuelve la categoría guardada. `initSchema` deja `Híbrido` como valor canónico de lo que antes se escribió `hibrido`.

## Fuera de alcance

- Transporte WhatsApp, cotizaciones, clientes, precios, alertas y escrituras de almacén.
- Repartir reservas por lote o crear sucursales.
- API de consulta de la auditoría y límite compartido entre réplicas.
- Aceptar el literal `Cobranza` como rol. El servidor autoriza `Acopio`.

## Criterios de aceptación

- BDD-SC-107 a BDD-SC-118, más BDD-SC-122 a BDD-SC-124 de la alineación, en `docs/cambios/CHG-027/aceptacion.feature` y en `features/chg027_bot_inventario.feature`.
- Esos escenarios están etiquetados `@no-implementado` y Cucumber los omite. No son evidencia de que el comportamiento exista.
