# Especificación: Asociaciones de agricultores entre páginas

## Historia de usuario

Como administrador, quiero seleccionar agricultores desde distintas páginas del catálogo y asociarlos bajo un agricultor principal, para que la paginación no cambie el resultado ni oculte los integrantes del grupo.

## Causa del defecto

La relación se guarda en `clientes.cliente_principal_id`, pero la tabla construía un arreglo local `asociados` únicamente con los registros presentes en la página visible. Ese arreglo siempre existía, aunque estuviera vacío, y la insignia utilizaba su longitud antes que el conteo total enviado por el servidor. Por eso una asociación entre páginas se mostraba como `0 asociados`.

## Reglas funcionales

1. La selección acumulada se conserva al cambiar de página.
2. El guardado recibe todos los IDs seleccionados y se ejecuta en una sola transacción.
3. La insignia muestra el total registrado en base de datos, aunque los asociados no estén en la página actual.
4. Al expandir un principal, el sistema consulta y muestra todos sus asociados activos sin depender de la página.
5. Un asesor solo puede consultar o asociar agricultores de su propia cartera.
6. Si un agricultor dejó de estar disponible, la operación completa se rechaza; no se permiten asociaciones parciales.

## API

- `GET /api/clientes/:id/asociados`: devuelve los agricultores activos cuyo `cliente_principal_id` corresponde al principal.
- `POST /api/clientes/asociar`: conserva la operación transaccional y devuelve los IDs asociados.

## Criterios de aceptación

1. Seleccionar A en la página 1 y B en la página 2 permite guardar a A como principal y B como asociado.
2. Al volver a la página de A, la insignia indica `1 asociado`.
3. Al expandir A, B aparece aunque originalmente estuviera en otra página.
4. Una asociación con dos secundarios ubicados en páginas diferentes muestra `2 asociados`.
5. Una asociación formada completamente dentro de la misma página continúa funcionando.
6. El conteo nunca usa `0` si el servidor informa asociados activos.

## Pruebas

- Conteo con arreglo local vacío y conteo remoto mayor que cero.
- Conteo con asociados presentes en la página.
- Conteo con una mezcla de asociados locales y remotos.
- Regresión de agrupación y disolución de asociaciones.
