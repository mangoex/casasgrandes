# Casos TDD — {{CHG-###}}

## TDD-TC-{{###}} — {{nombre}}

- Cubre: {{BDD-SC-###}}, {{PRD-FR-###}}
- Nivel: unitario | HTTP | PostgreSQL aislado | contrato
- Archivo: `test/{{archivo}}.test.js`
- Fixture: datos ficticios. Prohibido leer CSV de la raíz.
- Acción: {{qué hace la prueba}}
- Aserciones: {{qué debe cumplirse}}
- Rojo esperado antes de implementar: {{fallo que demuestra la ausencia}}
- Estado: pendiente

## Comandos

```bash
node --test test/{{archivo}}.test.js
npm test
```
