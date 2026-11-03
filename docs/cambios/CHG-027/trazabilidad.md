# Trazabilidad — CHG-027

| Objetivo | Requisito | Diseño | Escenario | Prueba | Implementación | Evidencia | Estado |
|---|---|---|---|---|---|---|---|
| OBJ-023 | PRD-FR-060 | ADR-018, SDD-CMP-052, SDD-DB-020 | BDD-SC-111, BDD-SC-112, BDD-SC-118 | TDD-TC-124 | pendiente: `bot_claves` y rutas administrativas | especificación | propuesta |
| OBJ-023 | PRD-FR-060, PRD-FR-062 | ADR-018, ADR-019, SDD-SEC-014 | BDD-SC-113, BDD-SC-114, BDD-SC-115 | TDD-TC-125 | pendiente: middleware de alcance y rol | especificación | propuesta |
| OBJ-023 | PRD-FR-061 | ADR-019, SDD-CMP-053 | BDD-SC-107, BDD-SC-108, BDD-SC-109 | TDD-TC-126 | pendiente: lecturas de inventario | especificación | propuesta |
| OBJ-023 | PRD-FR-061, PRD-NFR-013 | ADR-019, SDD-SEC-014 | BDD-SC-110 | TDD-TC-127 | pendiente: proyección de movimientos | especificación | propuesta |
| OBJ-023 | PRD-NFR-013 | ADR-018, ADR-006 | BDD-SC-116 | TDD-TC-128 | pendiente: límite por clave | especificación | propuesta |
| OBJ-023 | PRD-NFR-013 | ADR-018, SDD-DB-020 | BDD-SC-117 | TDD-TC-129 | pendiente: `bot_llamadas` | especificación | propuesta |
| OBJ-023 | PRD-FR-060..062, PRD-NFR-013 | ADR-017, ADR-018, ADR-019 | BDD-SC-107..118 | TDD-TC-121, TDD-TC-130 | `docs/api/bot-v1.yaml`; rutas sin montar | `npm run lint:openapi` | propuesta |

## Huecos

- TDD-TC-124..130 no existen como pruebas. El Gherkin de `features/chg027_bot_inventario.feature` está omitido.
- El propietario no ha confirmado la lista de `registro-decisiones.md`.
- No hay migración, ruta ni semilla. La semilla futura es ficticia y no lee los CSV de la raíz.
- El límite entre réplicas y la consulta de auditoría quedan fuera del cambio.
