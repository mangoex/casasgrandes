# Trazabilidad — CHG-027

| Objetivo | Requisito | Diseño | Escenario | Prueba | Implementación | Evidencia | Estado |
|---|---|---|---|---|---|---|---|
| OBJ-023 | PRD-FR-060 | ADR-018, SDD-CMP-052, SDD-DB-020 | BDD-SC-111, BDD-SC-112, BDD-SC-118 | TDD-TC-124 | `bot_claves` y rutas administrativas | pruebas de la rama | implementado, sin merge |
| OBJ-023 | PRD-FR-060, PRD-FR-062 | ADR-018, ADR-019, SDD-SEC-014 | BDD-SC-113, BDD-SC-114, BDD-SC-115 | TDD-TC-125 | middleware de alcance y rol | pruebas de la rama | implementado, sin merge |
| OBJ-023 | PRD-FR-061 | ADR-019, SDD-CMP-053 | BDD-SC-107, BDD-SC-108, BDD-SC-109, BDD-SC-122, BDD-SC-124 | TDD-TC-126 | lecturas de inventario | pruebas de la rama | implementado, sin merge |
| OBJ-023 | PRD-FR-061, PRD-NFR-013 | ADR-019, SDD-SEC-014 | BDD-SC-110, BDD-SC-123 | TDD-TC-127 | proyección de movimientos | pruebas de la rama | implementado, sin merge |
| OBJ-023 | PRD-NFR-013 | ADR-018, ADR-006 | BDD-SC-116 | TDD-TC-128 | límite por clave | pruebas de la rama | implementado, sin merge |
| OBJ-023 | PRD-NFR-013 | ADR-018, SDD-DB-020 | BDD-SC-117 | TDD-TC-129 | `bot_llamadas` | pruebas de la rama | implementado, sin merge |
| OBJ-023 | PRD-FR-060..062, PRD-NFR-013 | ADR-017, ADR-018, ADR-019 | BDD-SC-107..118, BDD-SC-122..124 | TDD-TC-121, TDD-TC-130 | `docs/api/bot-v1.yaml` y rutas montadas | `npm run lint:openapi` y `npm run test:bdd` | implementado, sin merge |

## Huecos

- C-01..C-12 quedaron aceptadas. La implementación está en la rama y no tiene merge ni despliegue.
- La semilla de prueba es ficticia y no lee los CSV de la raíz.
- El límite entre réplicas y la consulta de auditoría quedan fuera del cambio.
- CHG-028 y CHG-029 no dejaron migración versionada: la autorrecuperación vive en `ensureQuotationsSchema` e `initSchema`. Los commits de la interfaz de lotes posteriores a CHG-029 no tienen paquete ni prueba del control de expandir y contraer.
