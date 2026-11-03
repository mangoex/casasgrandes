# ADR-018 y ADR-019 — CHG-027

Las copias canónicas están en `docs/adr/ADR-018.md` y `docs/adr/ADR-019.md`. Si este resumen y esos archivos divergen, mandan los ADR.

## Decisión breve

- La fundación de claves y la lectura de inventario son el mismo cambio, en dos cortes de implementación que este pull request no ejecuta.
- La clave se guarda como SHA-256 con pimienta de entorno. El prefijo sirve para buscarla. La clave completa se muestra una vez.
- El alcance de este corte es `inventario:leer`.
- El rol sale de la persona vinculada, o del literal `rol_visibilidad` si el bot no representa a una persona.
- `disponible = último existencias_resultantes − reservas ACTIVA`.
- Lotes y tamaños solo en el detalle de la vista `almacen`. El lote no tiene reservado.
- El Asesor recibe una sola cifra, `disponible`, y no consulta movimientos.
- No hay sucursales en el modelo. No se agregan en este cambio.
- La salud sigue pública y sin auditoría.

## Aprobación

Pendiente del propietario. No incluye implementación, merge ni despliegue.
