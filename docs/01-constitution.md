# Constitución del proyecto

## Misión

Proteger la continuidad y confidencialidad de la operación comercial agrícola mediante cambios explícitos, verificables y reversibles.

## Principios

### PROJECT-PR-001

Toda implementación debe ser trazable a un requisito confirmado.

### PROJECT-PR-002

El arranque y las migraciones nunca eliminarán datos operativos por inferencia.

### PROJECT-PR-003

Todo dato externo, persistido o generado por IA se tratará como no confiable antes de renderizarlo.

### PROJECT-PR-004

Ninguna cuenta nueva o importada tendrá una contraseña conocida, compartida o implícita.

### PROJECT-PR-005

Las sesiones del navegador se transportarán en cookies protegidas contra lectura por JavaScript.

## Fuentes canónicas

| Fuente | Autoridad | Responsable |
|---|---|---|
| Esta Constitución | Reglas de seguridad del proyecto | Responsable del producto |
| `docs/02-PRD.md` | Requisitos del incremento | Responsable del producto |
| `docs/adr/ADR-001.md` | Decisión de sesión web | Responsable técnico |
| PostgreSQL | Datos operativos productivos | Responsable de operación |

## Límites

- Incluye: cambios P0 aprobados bajo `CHG-001`.
- Excluye: despliegue o modificación directa de producción.

## Seguridad y cambios

- Acciones sensibles: borrado de datos, emisión de sesiones, alta de usuarios y renderizado de contenido no confiable.
- Aprobadores: usuario propietario para implementación; responsable operativo para cualquier despliegue posterior.
- Control de cambios: usar `CHG-###`.
