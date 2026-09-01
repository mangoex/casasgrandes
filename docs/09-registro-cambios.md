# Registro de cambios

| ID | Fecha | Cambio observable | Autoridad afectada | Pruebas | Estado |
|---|---|---|---|---|---|
| CHG-001 | 2026-07-26 | El arranque conserva datos, la sesión web no es legible por JavaScript, el contenido no confiable se codifica y las altas requieren contraseña segura | PROJECT-PR-002..005, ADR-001, PRD-FR-001..004 | TDD-TC-018..023; 24/24 suite completa | implemented-local |
| CHG-002 | 2026-07-27 | Las sesiones usan identidad vigente, pueden revocarse y las carteras se aíslan por rol y propiedad | PROJECT-PR-006..008, ADR-002, PRD-FR-005..008 | TDD-TC-024..029; EVD-001 | implemented-local |
| CHG-003 | 2026-07-27 | Inventario, producción y decisiones críticas confirman todos sus efectos o ninguno bajo concurrencia | PROJECT-PR-009..010, ADR-003, PRD-FR-009..011 | TDD-TC-030..034; EVD-002 | implemented-local |
| CHG-004 | 2026-07-27 | IA externa es opt-in, usa contexto minimizado, secretos por entorno y logs redactados | PROJECT-PR-011..013, ADR-004, PRD-FR-012..016 | TDD-TC-035..040; EVD-003 | implemented-local |
| CHG-005 | 2026-07-27 | Eliminar vulnerabilidades conocidas críticas y altas del árbol npm sin salto mayor | PROJECT-PR-014, ADR-005, PRD-FR-017 | TDD-TC-041; EVD-004 | implemented-local |
| CHG-006 | 2026-07-27 | Limitar fuerza bruta, payloads y confianza HTTP con aislamiento de navegador | PROJECT-PR-015, ADR-006, PRD-FR-018..020 | TDD-TC-042..045; EVD-005 | implemented-local |
| CHG-007 | 2026-07-27 | Confirmar creación, edición y conversión comercial como unidades atómicas | PROJECT-PR-016, ADR-007, PRD-FR-021..023 | TDD-TC-046..049; EVD-006 | implemented-local |
| CHG-008 | 2026-07-27 | Exponer salud, correlacionar solicitudes y cerrar recursos de forma ordenada | PROJECT-PR-017, ADR-008, PRD-FR-024..027 | TDD-TC-050..054; EVD-007 | implemented-local |
| CHG-009 | 2026-08-27 | Usar precio mensual como base y restar su reducción del presupuesto total disponible al asesor | PROJECT-PR-018, ADR-009, PRD-FR-028..031 | TDD-TC-055..062; EVD-008 | implemented-local |
| CHG-010 | 2026-09-01 | Vincular precio mensual, descuento en MXN y porcentaje contra el precio anual | ADR-010, PRD-FR-032 | TDD-TC-063..066; EVD-009 | implemented-local |
| CHG-011 | 2026-09-01 | Usar el tope mensual completo como rango de descuento desde el precio de Programación | ADR-011, PRD-FR-033 | TDD-TC-067..070; EVD-010 | implemented-local |
| CHG-012 | 2026-09-01 | Iniciar Cotizador en el precio efectivo y representar en la barra el descuento acumulado hasta un tope independiente | ADR-012, PRD-FR-034 | TDD-TC-071..074; EVD-011 | implemented-local |
| CHG-013 | 2026-09-01 | Mostrar el precio base fijo, capturar precio del mes y saldo Asesor en dinero, y reflejar ese contrato en Cotizador | ADR-013, PRD-FR-035 | TDD-TC-075..078; EVD-012 | implemented-local |
| CHG-014 | 2026-09-01 | Configurar Nucle por mes y aplicarlo opcionalmente a Híbridos y Semillas además del descuento del asesor | ADR-014, PRD-FR-036 | TDD-TC-079..085; EVD-013 | implemented-local |
| CHG-015 | 2026-09-01 | Corregir el guardado PostgreSQL de Nucle y normalizar sus porcentajes a dos decimales | PRD-FR-036 | TDD-TC-079, TDD-TC-084..086; EVD-014 | implemented-local |

## Reglas

- Registrar especificaciones e IDs afectados.
- Actualizar pruebas antes del prompt o código.
- Adjuntar evidencia real antes de marcar `approved`.
