# Contexto de producto

## Identidad

- Producto: AgriSales Pro para Casas Grandes.
- Problema: la operación comercial agrícola necesita coordinar agricultores, asesores, cotizaciones, inventario, visitas, asignaciones y agentes de IA sin perder datos ni exponer información sensible.
- Usuarios: administradores, coordinadores, asesores, almacén y acopio.
- Resultado: operación comercial confiable, autorizada por rol, trazable y recuperable.

## Objetivos

- `OBJ-001`: impedir que el arranque del servidor elimine planeación operativa.
- `OBJ-002`: impedir ejecución de contenido no confiable en el navegador y proteger la sesión.
- `OBJ-003`: eliminar credenciales iniciales conocidas o compartidas.

## Alcance

### Incluye

- Backend Express, frontend estático y migraciones PostgreSQL/SQLite.
- Arranque, autenticación, gestión de asesores y renderizado de contenido de IA.
- Pruebas de regresión y evidencia del incremento `CHG-001`.

### Excluye

- Despliegue, cambios directos en producción y restauración de datos.
- Correcciones P1/P2 de autorización horizontal, transacciones, privacidad y scheduler, que permanecen en el roadmap.

## Fuentes y decisiones

| Fuente | Autoridad | Estado |
|---|---|---|
| Solicitud del usuario del 2026-07-26 | Aprobación del incremento P0 | confirmado |
| `docs/PROJECT_CONTEXT.md`, `docs/PRD.md`, `docs/SDD.md` | Contexto consultivo existente | confirmado |
| Auditoría Humanio del 2026-07-26 | Riesgos y evidencia técnica | confirmado |
| Código y pruebas ejecutadas | Comportamiento implementado | confirmado |

## Restricciones

- Negocio: no interrumpir flujos de cotización y planeación existentes.
- Técnicas: Node.js, Express, PostgreSQL y frontend sin framework.
- Seguridad: datos personales, credenciales, sesiones y contenido generado por terceros.
- Operación: no desplegar ni modificar datos productivos en este incremento.

## Perfil y riesgo

- Perfil: software.
- Nivel: R3.
- Justificación: procesa datos personales, inventario, precios, pedidos y decisiones comerciales con exposición web e IA externa.

## Criterio del primer incremento

- Capacidad: cerrar los tres bloqueantes P0 de pérdida de datos, XSS/sesión y contraseña predeterminada.
- Gate: Gate 4 para el incremento local; Gate 5 de producción permanece bloqueado.
- Evidencia: pruebas automatizadas, validación Humanio, comprobación sintáctica y revisión de diferencias.
