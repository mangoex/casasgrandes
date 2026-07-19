# Especificación: edición de productos y precios efectivos por mes

## Objetivo

Convertir el Catálogo de Productos en la fuente del precio base anual y a Programación en la fuente única del precio y promoción efectivos para una cotización. El Cotizador debe usar siempre la programación del producto para el mes de la cotización; nunca debe tomar como precio de venta el precio base del catálogo.

## Alcance y roles

- `Administrador`: puede editar productos, su precio base y su programación mensual.
- `Coordinador`: conserva el acceso actual a Programación y puede modificar precios/promociones mensuales. No puede editar el catálogo si la política actual mantiene esa operación solo para Administrador.
- `Asesor`: consulta catálogo y cotiza; no puede cambiar precios ni promociones.
- No se modifica el histórico de cotizaciones ya guardadas.

## Historia de usuario 1: editar un producto importado

Como Administrador, quiero hacer clic en cualquier tarjeta del Catálogo de Productos para abrir un diálogo de edición, con el fin de corregir los datos importados y establecer su precio base anual.

### Comportamiento

1. En el Catálogo de Productos, para Administrador, toda la tarjeta es activable con clic o teclado. El botón `Agregar a Cotización` debe conservar su acción actual y no abrir el editor.
2. El diálogo reutiliza el formulario existente de producto y carga los datos del artículo seleccionado.
3. Deben poder editarse los campos que existen en la importación y en el modelo: nombre, clave, descripción, categoría, precio base MXN, base USD, descuento fijo, objetivo, escala de descuento y estatus.
4. Si `clave` y/o `descripción` no existen como columnas persistentes, agregar una migración aditiva y devolverlos desde `GET /api/productos`; no reemplazar ni volver a importar el catálogo.
5. Nombre y clave no se pueden duplicar. El precio base debe ser un número mayor o igual a cero.
6. El modal debe identificar claramente que el importe es `Precio base anual (MXN)`.

### Regla de cascada del precio base

Al guardar un cambio de precio base para un producto existente:

1. Actualizar `productos.list_price_mxn`.
2. En la misma transacción, crear o actualizar los 12 registros de `crm_precios_mensuales` de ese producto, de enero a diciembre, con ese importe en `precio`.
3. Conservar `promo_dinero` y `promo_porcentaje` existentes por mes. Solo cambia el precio base mensual.
4. Si el producto se crea por primera vez, generar los 12 meses con el precio base y promociones en cero.
5. Si el precio base no cambió, no modificar la programación mensual.

Ejemplo: cambiar Hipopótamo Acceleron de `6,210` a `6,500` desde el catálogo deja enero-diciembre en `6,500`, sin borrar las promociones ya configuradas.

## Historia de usuario 2: actualización progresiva en Programación

Como Administrador o Coordinador, quiero cambiar el precio de un mes y que se replique hacia los meses posteriores del mismo producto, para reflejar una lista vigente desde esa fecha.

### Comportamiento

1. Al seleccionar un producto en Programación se muestran siempre los 12 meses. Los meses sin registro usan el precio base como valor inicial.
2. Cuando se modifica el campo `Precio base` de un mes, la interfaz replica de inmediato ese valor desde el mes modificado hasta diciembre para ese producto. El usuario guarda una sola vez.
3. La operación de guardado debe persistir esa propagación en el servidor de forma atómica. No debe depender únicamente de valores modificados en el navegador.
4. La propagación afecta únicamente el campo `precio`; no cambia promociones de otros meses.
5. Las promociones de dinero y porcentaje se editan únicamente en el mes elegido, salvo que en el futuro se solicite expresamente una propagación equivalente.

Ejemplo: si Hipopótamo tiene `6,210` de enero a julio y se cambia agosto a `2,500`, agosto-diciembre quedan en `2,500`; enero-julio conservan `6,210`.

## Historia de usuario 3: precio efectivo en Cotizador

Como Asesor, quiero que el Cotizador use el precio y la promoción configurados para el mes vigente, para emitir cotizaciones consistentes con Programación.

### Fuente de verdad y cálculo

1. Para cada producto de una cotización, el servidor consulta `crm_precios_mensuales` usando el mes local de la fecha de creación de la cotización.
2. `precio` de ese registro es el precio de lista efectivo que debe mostrarse y guardarse en `cotizacion_detalles.precio_lista_unitario`.
3. Las reglas actuales de temporada, escala de volumen, cuenta clave y descuento fijo siguen existiendo, pero deben calcularse a partir del precio mensual efectivo cuando corresponda. No se crea un segundo motor de precios: se adapta y reutiliza `utils/pricing.js`.
4. La promoción mensual limita el descuento comercial que el asesor puede aplicar:
   - `promo_dinero`: tope en MXN por unidad.
   - `promo_porcentaje`: tope porcentual del precio mensual efectivo.
   - Para evitar descuentos ambiguos, si ambos son mayores a cero en un mismo mes, el servidor rechaza la configuración y la interfaz marca el conflicto. No se suman.
5. El descuento aplicado por el asesor no puede exceder el tope mensual configurado.
6. Si no existe programación mensual por un producto de legado, el servidor usa temporalmente `list_price_mxn` como compatibilidad y crea los doce registros al siguiente guardado administrativo. El camino normal no debe usar este fallback.
7. Previsualización, alta de cotización, edición de cotización y conversión de una planificación a cotización deben compartir la misma consulta y cálculo de precio mensual.
8. Las cotizaciones anteriores no se recalculan cuando cambie el catálogo o Programación.

## Contratos de API

### Productos

- Mantener `PUT /api/productos/:id` restringido a Administrador.
- Extender payload y respuesta con `clave` y `descripcion` si se agregan al modelo.
- El `PUT` debe ejecutar la actualización de producto y la cascada de 12 meses en una transacción de base de datos.

### Programación de precios

- Mantener `GET /api/programacion/precios?producto_id=:id` devolviendo 12 filas completas.
- Reemplazar el guardado de arreglo ciego por una operación validada en servidor: cada mes 1-12 aparece una sola vez, importes no negativos y no se permiten `promo_dinero > 0` y `promo_porcentaje > 0` simultáneamente.
- El servidor detecta el primer mes cuyo `precio` cambió respecto a lo almacenado y aplica su precio hasta diciembre. Si hay varios cambios, el último cambio por orden de mes define los meses posteriores.
- Alternativamente, se puede exponer un endpoint explícito `PATCH /api/programacion/precios` con `producto_id`, `mes_inicio`, `precio` y promociones del mes. Debe conservar los mismos resultados y ser transaccional.

### Cálculo de cotización

- Centralizar la resolución mensual en un helper del servidor, por ejemplo `getMonthlyProductPricing(productId, month)`.
- Usar ese helper en todos los endpoints que hoy leen `prod.list_price_mxn` para calcular o persistir una cotización.
- Nunca confiar en precio o descuento enviados por el navegador.

## Criterios de aceptación

1. Un Administrador puede abrir la tarjeta Hipopótamo Acceleron desde Catálogo, cambiar su precio base a `6,210` y guardarlo.
2. Después de guardar, Programación muestra `6,210` de enero a diciembre para Hipopótamo; las promociones previas siguen intactas.
3. Al cambiar agosto a `2,500` y guardar, Programación muestra enero-julio en `6,210` y agosto-diciembre en `2,500`.
4. Al cotizar Hipopótamo en julio, el precio de lista persistido en la cotización es el valor de julio; al cotizarlo en agosto, es `2,500`.
5. Una promoción en agosto no altera los topes de descuento de julio o septiembre.
6. Un Asesor recibe `403` al intentar editar producto o guardar Programación directamente por API.
7. Un precio negativo, mes fuera de 1-12, producto inexistente o ambas promociones activas devuelve `400` con un mensaje claro.
8. Cambiar un producto hoy no modifica `precio_lista_unitario`, `precio_neto_unitario` ni `subtotal_mxn` de cotizaciones existentes.
9. El catálogo sigue permitiendo `Agregar a Cotización` sin abrir el modal de edición.
10. La experiencia funciona con productos importados que no tengan clave o descripción, sin eliminar información existente.

## Pruebas obligatorias

### Backend

- Prueba de transacción: editar precio base actualiza 12 precios mensuales y conserva promociones.
- Prueba de propagación: agosto cambia agosto-diciembre y deja enero-julio intacto.
- Pruebas de validación de promociones exclusivas, importes negativos, roles y producto inexistente.
- Prueba de cálculo: la previsualización y la creación de cotización toman el precio mensual, no `productos.list_price_mxn`.
- Prueba de histórico: cotización existente no cambia después de modificar catálogo o Programación.
- Prueba para cada entrada de cotización: crear, editar y convertir planificación a cotización.

### Frontend

- Clic y teclado en tarjeta de catálogo como Administrador abren el diálogo correcto.
- Clic en `Agregar a Cotización` no abre el diálogo.
- Al editar agosto, la tabla refleja el nuevo precio hasta diciembre antes del guardado.
- El Cotizador muestra el precio efectivo y no permite exceder el descuento configurado.

## Fuera de alcance

- Cambios masivos de varios productos en una sola acción.
- Recalcular cotizaciones históricas.
- Conversión automática de divisas distinta a las reglas actuales.
- Propagación automática de promociones a meses posteriores.

## Entregables para auditoría

Kimi debe entregar: migraciones aditivas, cambios de API, cambios de interfaz, pruebas automatizadas, resultado de pruebas y una lista de los endpoints de cotización modificados. No debe hacer push ni modificar datos de producción sin autorización explícita.
