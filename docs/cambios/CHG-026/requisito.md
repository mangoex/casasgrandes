# Requisito — CHG-026

- ID de requisito: HARNESS-REQ-001
- Objetivo: dejar un arnés repetible antes del API de bots
- Cambio: CHG-026
- Decisión: ADR-017
- Estado: propuesta

`HARNESS-REQ-001` no es un requisito de producto. No entra en el PRD comercial.

## Enunciado

Un agente puede ejecutar en local y en CI, sin datos personales, el lint, la suite `node --test`, los `.feature` de muestra, la integración contra PostgreSQL 16 aislado, el piso de cobertura y la validación del OpenAPI 3.1 de bots.

## Reglas

- El arnés no modifica el comportamiento de Express ni el esquema de la base.
- La semilla de integración es ficticia y vive en código de prueba.
- `migrate_pg.js` no forma parte del arnés.
- Merge y despliegue siguen exigiendo aprobación explícita del propietario.

## Fuera de alcance

- Inventario, ventas, cotizaciones, asesores, clientes, catálogo y alertas del bot.
- Claves hasheadas, alcances, límites por clave y tabla de auditoría. Quedan descritos como intención, sin tablas ni rutas.

## Criterios de aceptación

- BDD-SC-034 y BDD-SC-036 ejecutados en `features/chg008_salud.feature`.
- BDD-SC-100 y BDD-SC-103 ejecutados en `features/chg025_contratos.feature`.
- La suma inválida de BDD-SC-105 ejecutada en `features/chg025_reservas.feature`.
- La reserva dividida de BDD-SC-104 ejecutada en PostgreSQL cuando hay URL de prueba (`TDD-TC-123`).
- `docs/api/bot-v1.yaml` válido y el placeholder sin montar (`TDD-TC-121`).
