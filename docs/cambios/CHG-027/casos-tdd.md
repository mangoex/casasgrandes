# Casos TDD — CHG-027

Los casos de comportamiento están pendientes. Este pull request no los implementa y no agrega archivos en `test/` que llamen a inventario, claves o migraciones.

`TDD-TC-121` sí se ajusta en este cambio: el contrato deja de ser un documento vacío y la prueba sigue exigiendo que Express responda 404 en todas las rutas del documento. Ese ajuste no monta comportamiento.

## TDD-TC-124 — Hash, alta y revocación

- Cubre: BDD-SC-111, BDD-SC-112, BDD-SC-118, PRD-FR-060
- Nivel: PostgreSQL aislado
- Archivo futuro: `test/chg027_bot_claves.test.js`
- Fixture: administrador ficticio `admin.ficticio@example.test`. Prohibido leer CSV de la raíz.
- Acción: crear una clave, leer el listado, revocarla y repetir la revocación.
- Aserciones: la base guarda prefijo y hash, no la clave; el listado no trae el secreto; la segunda revocación conserva la primera fecha; sin pimienta el alta responde 503.
- Rojo esperado antes de implementar: la ruta administrativa responde 404.
- Estado: implementado en la rama. Sin merge.

## TDD-TC-125 — Alcance y rol

- Cubre: BDD-SC-113, BDD-SC-114, BDD-SC-115, PRD-FR-060, PRD-FR-062
- Nivel: HTTP
- Archivo futuro: `test/chg027_bot_acceso.test.js`
- Fixture: claves ficticias ligadas a Almacen, Asesor y Observador.
- Acción: llamar al listado y al detalle con alcance ajeno, con Asesor y con Observador.
- Aserciones: 403 `ALCANCE_DENEGADO` o `ROL_SIN_VISIBILIDAD` según el caso; el Asesor no recibe `lote`, `tamano`, `existencia_fisica` ni `reservado`; sus movimientos responden 403.
- Rojo esperado antes de implementar: 404.
- Estado: implementado en la rama. Sin merge.

## TDD-TC-126 — Disponible, tamaños y lotes

- Cubre: BDD-SC-108, BDD-SC-109, PRD-FR-061
- Nivel: unitario y PostgreSQL aislado
- Archivo futuro: `test/chg027_bot_inventario.test.js`
- Fixture: híbrido de demostración, último saldo 140, reserva activa 40, lote `LOTE-DEMO-1`, tamaño `BT1`.
- Acción: calcular el disponible y pedir el detalle con vista de almacén.
- Aserciones: disponible 100; el tamaño resta su reserva; el lote trae físico y no trae reservado; un descuadre entre saldo y lotes no se reescribe; el Administrador recibe el lote y no el arreglo `tamanos`; buscar `Hibrido` encuentra `Híbrido`.
- Rojo esperado antes de implementar: no existe la función de lectura.
- Estado: implementado en la rama. Sin merge.

## TDD-TC-127 — Movimientos sin datos de personas

- Cubre: BDD-SC-110, PRD-FR-061, PRD-NFR-013
- Nivel: HTTP
- Archivo futuro: `test/chg027_bot_inventario.test.js`
- Fixture: movimiento de demostración con cliente y precio ficticios en la fila de origen.
- Acción: consultar movimientos con rol Almacen y con rol Administrador.
- Aserciones: la respuesta no contiene nombre, correo, teléfono, precio, nota, factura ni folio; Administrador recibe `lote` y no recibe `tamano`; un movimiento manual de tipo `Entrada` aparece con ese tipo; un parámetro `cliente_id` responde 400.
- Rojo esperado antes de implementar: 404.
- Estado: implementado en la rama. Sin merge.

## TDD-TC-128 — Límite por clave

- Cubre: BDD-SC-116, PRD-NFR-013
- Nivel: unitario
- Archivo futuro: `test/chg027_bot_limite.test.js`
- Fixture: clave con límite 2 por minuto y reloj inyectado.
- Acción: consumir tres lecturas dentro de la misma ventana.
- Aserciones: la tercera responde 429 con `Retry-After`; un 403 también consume la ventana; la clave no reconocida se cuenta por otro cubo.
- Rojo esperado antes de implementar: no existe el contador por clave.
- Estado: implementado en la rama. Sin merge.

## TDD-TC-129 — Auditoría

- Cubre: BDD-SC-111, BDD-SC-117, PRD-NFR-013
- Nivel: PostgreSQL aislado
- Archivo futuro: `test/chg027_bot_auditoria.test.js`
- Fixture: la misma clave ficticia del alta.
- Acción: una lectura autenticada y una clave desconocida.
- Aserciones: la fila reconocida guarda ruta plantilla, código y `X-Request-ID`; no guarda cuerpo, consulta ni clave; la clave desconocida no persiste el valor presentado; la salud no inserta fila.
- Rojo esperado antes de implementar: no existe `bot_llamadas`.
- Estado: implementado en la rama. Sin merge.

## TDD-TC-130 — Gherkin de aceptación

- Cubre: BDD-SC-107 a BDD-SC-118
- Nivel: HTTP con Supertest, cuando deje de estar omitido
- Archivo futuro: `features/chg027_bot_inventario.feature` sin la etiqueta `@no-implementado`
- Fixture: los datos ficticios de los escenarios.
- Acción: `npm run test:bdd`
- Aserciones: los doce escenarios pasan contra Express.
- Rojo esperado antes de implementar: hoy están omitidos a propósito. Quitar la etiqueta antes de tiempo deja los pasos sin comportamiento y la suite falla.
- Estado: implementado en la rama. Sin merge.

## TDD-TC-134 — Cursor cuando hay más filas que `limite`

- Cubre: BDD-SC-125, PRD-FR-061, ADR-019
- Nivel: HTTP
- Archivo: `test/chg027_bot_paginacion.test.js`
- Fixture: cuatro productos y cuatro movimientos ficticios. Prohibido leer CSV de la raíz.
- Acción: listar productos y movimientos con `limite=3` y repetir cada consulta con `paginacion.siguiente`.
- Aserciones: la primera página responde 200 con `siguiente` no nulo; la segunda responde 200 con la fila restante y `siguiente` nulo.
- Rojo esperado antes de implementar: 500 `ERROR_INTERNO`, porque `page()` llama a `encodeCursor` sin importarlo.
- Estado: corrección del defecto en la rama. Sin merge.

## Ajuste ya hecho en este pull request

`test/contract/bot_v1_openapi.test.js` acepta el documento CHG-027, valida los ejemplos y los contraejemplos, y comprueba que Express sigue respondiendo 404. No sustituye a TDD-TC-124..130.

## Comandos

```bash
npm run lint:openapi
npm run test:bdd
npm test
```
