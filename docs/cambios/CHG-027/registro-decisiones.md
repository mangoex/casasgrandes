# Registro de decisiones — CHG-027

| Fecha | ID | Decisión | Quién | Estado |
|---|---|---|---|---|
| 2026-11-03 | ADR-018 | Clave hasheada con pimienta, alcance `inventario:leer`, límite por clave y auditoría sin datos de personas | agente, como propuesta | propuesta |
| 2026-11-03 | ADR-019 | Disponible = último saldo físico menos reservas activas; lotes solo para Almacén; sin sucursales | agente, como propuesta | propuesta |
| 2026-11-03 | CHG-027 | La fundación de claves y la lectura van en el mismo cambio, en dos cortes de implementación | agente, como propuesta | propuesta |
| 2026-11-03 | CHG-027 | Este pull request no implementa rutas, migraciones ni pruebas de comportamiento | encargo del propietario | vigente para este PR |

## Confirmaciones del propietario antes de implementar

Aprobar este pull request de especificación no autoriza a escribir el código. Hace falta una respuesta, aunque sea «acepto las recomendaciones», sobre esta lista. Cada recomendación ya está escrita en el contrato; cambiarla cambia el OpenAPI antes del corte A o del corte B.

| ID | Pregunta | Recomendación en este paquete | Si se rechaza, cambia |
|---|---|---|---|
| C-01 | ¿La fundación vive en CHG-027? | Sí. Corte A de claves y corte B de lectura, mismo cambio. | El número de cambio y el plan. |
| C-02 | ¿Cómo se ata la clave? | Exactamente una opción: persona (`asesor_id`, rol leído en vivo) o rol de servicio (`rol_visibilidad`). | `NuevaClaveBot` y ADR-018. |
| C-03 | ¿Quién crea y revoca claves? | Solo Administrador, con la sesión ya existente. | La operación administrativa. |
| C-04 | ¿Cuál es el límite? | 60 por minuto, configurable de 1 a 600. Las claves desconocidas tienen un tope aparte de 30 por minuto y por red. | El campo `limite_por_minuto` y BDD-SC-116. |
| C-05 | ¿La salud exige clave? | No. Sigue pública, sin inventario y sin fila de auditoría. | `GET /api/v1/bot/health`. |
| C-06 | ¿Qué se guarda en la auditoría? | Ruta plantilla, códigos, duración y `X-Request-ID`. Sin cuerpo, sin clave y sin dirección de red. Conservar 180 días. Por encima del tope de claves desconocidas no se inserta fila. | SDD-DB-020 y BDD-SC-117. |
| C-07 | ¿La pimienta es obligatoria? | Sí, `BOT_API_KEY_PEPPER`. Si falta, las rutas de este contrato responden 503 y el resto de la aplicación sigue. | El arranque del corte A. |
| C-08 | ¿El rol de cobranza se escribe `Acopio` o `Cobranza`? | `Acopio`, que es el literal que hoy autoriza el servidor. | El enum `rol_visibilidad`. |
| C-09 | ¿Qué ve el Asesor? | Solo `disponible`. No ve el físico ni el reservado, porque las dos cifras revelan el libro de reservas. Tampoco ve lotes, tamaños ni movimientos. | `ProductoAsesor`, `DetalleAsesor` y BDD-SC-114. |
| C-10 | ¿Qué cifra es el disponible de producto? | Último `existencias_resultantes` menos reservas `ACTIVA`, aunque no coincida con la suma de lotes y aunque sea negativo. Los tamaños usan la fórmula de CHG-025 y solo los ve Almacén. El lote es físico y no tiene reservado. | ADR-019 y el ejemplo del detalle. |
| C-11 | ¿Los movimientos entran en este corte? | Sí, para los roles que hoy entran a almacén. El Asesor recibe 403. | La ruta de movimientos. |
| C-12 | ¿Hay sucursales? | No. El desglose que existe es el lote. | No se agrega un recurso nuevo. |

## Aprobaciones que siguen abiertas

- Confirmaciones C-01..C-12: pendientes.
- Implementación: pendiente. Este paquete no la autoriza.
- Merge: pendiente. Hace falta un sí explícito del propietario.
- Despliegue: pendiente. Este paquete no despliega.

## Evidencia

- Comando: `npm run lint:openapi` y `npm run test:bdd`
- Resultado: se completa en el cuerpo del pull request con la salida real.
