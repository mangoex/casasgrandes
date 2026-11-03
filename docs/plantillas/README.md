# Plantillas de un paquete CHG

Copiar esta carpeta a `docs/cambios/CHG-###/` y sustituir cada marcador `{{...}}` antes de escribir código de producción. Los identificadores (`CHG`, `ADR`, `PRD-FR`, `BDD-SC`, `TDD-TC`) siguen la numeración ya usada en `docs/`.

| Plantilla | Se integra además en |
|---|---|
| `historia-usuario.md` | Contexto del cambio. No sustituye la Constitución. |
| `requisito.md` | `docs/02-PRD.md` cuando el cambio altera comportamiento observable. |
| `adr.md` | `docs/adr/ADR-###.md` si hay decisión de diseño. Si no hay decisión, escribir «no aplica» y no crear ADR. |
| `fragmento-openapi.yaml` | `docs/api/` del contrato que se esté abriendo. |
| `aceptacion.feature` | `docs/04-BDD.md` y, si habla con HTTP, `features/`. |
| `casos-tdd.md` | `docs/05-TDD.md` y archivos `test/`. |
| `plan.md` | `docs/07-roadmap-entregas.md`. |
| `trazabilidad.md` | `docs/06-matriz-trazabilidad.md`. |
| `registro-decisiones.md` | Evidencia de aprobación. La fila corta va a `docs/09-registro-cambios.md`. |

Orden: historia, requisito, contrato y ADR, Gherkin, casos TDD y plan, pruebas en rojo, implementación, CI, PR. Merge y despliegue quedan fuera del paquete hasta un sí explícito del propietario.

No pegar datos personales, filas de los CSV de la raíz, ni secretos en ningún archivo del paquete.
