# Registro de cambios

| ID | Fecha | Cambio observable | Autoridad afectada | Pruebas | Estado |
|---|---|---|---|---|---|
| CHG-001 | 2026-07-26 | El arranque conserva datos, la sesión web no es legible por JavaScript, el contenido no confiable se codifica y las altas requieren contraseña segura | PROJECT-PR-002..005, ADR-001, PRD-FR-001..004 | TDD-TC-018..023; 24/24 suite completa | implemented-local |
| CHG-002 | 2026-07-27 | Las sesiones usan identidad vigente, pueden revocarse y las carteras se aíslan por rol y propiedad | PROJECT-PR-006..008, ADR-002, PRD-FR-005..008 | TDD-TC-024..029; EVD-001 | implemented-local |
| CHG-003 | 2026-07-27 | Inventario, producción y decisiones críticas confirman todos sus efectos o ninguno bajo concurrencia | PROJECT-PR-009..010, ADR-003, PRD-FR-009..011 | TDD-TC-030..034; EVD-002 | implemented-local |

## Reglas

- Registrar especificaciones e IDs afectados.
- Actualizar pruebas antes del prompt o código.
- Adjuntar evidencia real antes de marcar `approved`.
