# Historia de usuario — CHG-027

- ID: CHG-027
- Fecha: 2026-11-03
- Actor: bot de inventario, administrador y propietario
- Estado: propuesta

## Bot

Como bot de inventario, quiero consultar el disponible de los productos activos, el detalle que mi rol ya puede ver y los movimientos recientes que mi rol ya puede ver, para responder una pregunta de stock sin modificar existencias ni reservas.

## Administrador

Como administrador, quiero crear una clave propia para cada bot, verla en claro una sola vez, limitar sus llamadas por minuto y revocarla, para encender o apagar ese bot sin compartir la sesión de una persona.

## Propietario

Como propietario, quiero leer el contrato, las reglas de visibilidad y la lista de confirmaciones antes de que exista código de aplicación, para aprobar o corregir el corte sin descubrir el alcance en un pull request de implementación.

## Fuera de alcance

- Enviar o recibir mensajes de WhatsApp.
- Cotizaciones, clientes, precios, asesores, alertas y mutaciones de almacén.
- Sucursales o bodegas.
- Consultar la tabla de auditoría desde el API.
- Implementar rutas, migraciones o pruebas de comportamiento en este pull request.

## Notas

- Los ejemplos usan «Híbrido Demostración», el lote `LOTE-DEMO-1` y la clave de muestra `EJEMPLO-NO-ES-SECRETO`. Esa cadena no es una clave válida.
