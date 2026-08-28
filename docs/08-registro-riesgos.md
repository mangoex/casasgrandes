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
| RSK-005 | Inconsistencia de inventario y pujas | media | crítico | CHG-003 cubre movimientos, producción, entrega y decisiones; CHG-007 cierra edición y conversiones comerciales | responsable técnico | mitigated-local |
| RSK-006 | Tratamiento de PII y proveedores IA no gobernado | alta | alto | CHG-004: opt-in, minimización, claves por entorno y logs redactados; falta aprobación legal/productiva del proveedor | propietario | partially-mitigated |
| RSK-008 | DoS y manipulación por dependencias vulnerables | alta | crítico | CHG-005 actualiza transitivas compatibles y exige auditoría reproducible | responsable técnico | mitigated-local |
| RSK-009 | Fuerza bruta y consumo HTTP no acotado | alta | alto | CHG-006 limita login, payloads, proxy y scripts inline; store distribuido pendiente para múltiples réplicas | responsable técnico | partially-mitigated |
| RSK-010 | Fallos de dependencia invisibles o apagado abrupto deja trabajo incompleto | media | alto | CHG-008 añade sondas, correlación y cierre ordenado; falta validar orquestador real | responsable técnico | partially-mitigated |
| RSK-011 | Precio mensual consume presupuesto pero el asesor recibe nuevamente el tope completo | alta | alto | CHG-009 centraliza saldo, rechaza configuración/payload inválidos y prueba todos los canales | responsable técnico | mitigated-local |
| RSK-012 | Flotantes o motores divergentes producen diferencias de centavos | media | alto | centavos en runtime, oráculo Python Decimal y fixtures compartidos; falta PostgreSQL real | responsable técnico | partially-mitigated |

## Riesgo residual

- Riesgos aceptados: ninguno en este incremento.
- Aprobador: pendiente del gate de producción; no bloquea implementación local.
- Condiciones: no desplegar hasta resetear cuentas existentes, probar transacciones y cierre con PostgreSQL/staging, validar configuraciones mensuales heredadas, aprobar privacidad IA y ensayar rollback.

## Readiness CHG-002

- Gate 4 local: aprobado.
- Gate 5 producción: `NOT READY`.
- Motivos: sin PostgreSQL aislado, prueba visual, auditoría durable, drenado del orquestador, rollback productivo ni resolución completa de RSK-003, RSK-006, RSK-009 y RSK-010.
