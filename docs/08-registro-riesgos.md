# Registro de riesgos

## Clasificación

- Nivel: R3
- Justificación: datos personales, inventario, precios, pedidos, usuarios productivos y proveedores IA.
- Responsable: propietario del producto; operación debe aprobar despliegues.

## Riesgos

| ID | Riesgo | Probabilidad | Impacto | Mitigación | Dueño | Estado |
|---|---|---|---|---|---|---|
| RSK-001 | Pérdida de planeación durante arranque | media | crítico | limpieza inferida eliminada y regresión verde | responsable técnico | mitigated-local |
| RSK-002 | Robo de sesión por XSS almacenado | alta | crítico | cookie HttpOnly, codificación, guardián dinámico y CSP | responsable técnico | mitigated-local |
| RSK-003 | Acceso mediante contraseña conocida | alta | crítico | contraseña explícita de 12 caracteres y defaults retirados | administrador | partially-mitigated |
| RSK-004 | Acceso horizontal a carteras ajenas | alta | alto | CHG-002: identidad vigente, middleware central y pruebas por rol/propiedad | responsable técnico | mitigated-local |
| RSK-007 | Coordinador conserva acceso comercial global sin modelo de equipos | media | alto | EXC-001 visible; diseñar relación coordinador-equipo con producto | propietario | accepted-temporary-local |
| RSK-005 | Inconsistencia de inventario y pujas | media | crítico | transacciones, locks e idempotencia | responsable técnico | open |
| RSK-006 | Tratamiento de PII y proveedores IA no gobernado | alta | alto | minimización, política y control de proveedores | propietario | open |

## Riesgo residual

- Riesgos aceptados: ninguno en este incremento.
- Aprobador: pendiente del gate de producción; no bloquea implementación local.
- Condiciones: no desplegar hasta resetear cuentas existentes, probar CHG-002 con PostgreSQL/staging y resolver RSK-005..006.

## Readiness CHG-002

- Gate 4 local: aprobado.
- Gate 5 producción: `NOT READY`.
- Motivos: sin PostgreSQL aislado, prueba visual, auditoría durable, rollback probado ni resolución de RSK-005 y RSK-006.
