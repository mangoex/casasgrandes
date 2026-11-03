# AgriSales Pro — instrucciones para agentes

## Autoridad

1. Constitución.
2. Decisiones confirmadas y ADR vigentes.
3. PRD y reglas de negocio.
4. SDD.
5. BDD y TDD.
6. Plan y tareas.
7. Código.

## Reglas

- No programar antes de identificar requisitos e IDs afectados.
- Actualizar BDD y TDD antes de cambios de comportamiento.
- Implementar el cambio mínimo.
- Ejecutar pruebas y reportar evidencia real.
- No introducir secretos ni datos personales innecesarios.

## Qué es este repositorio

AgriSales Pro (Casas Grandes) es la operación comercial agrícola: cotizaciones, planeación, inventario y asesores. El perfil Humanio está en `humanio.yaml` (software, riesgo R3). El código de producto es Node.js 20, Express 5 en CommonJS, PostgreSQL mediante `pg` y SQL directo, y un frontend en JavaScript vainilla. Las pruebas de unidad usan `node --test`.

CHG-026 no agrega funcionalidad de negocio. Instala el arnés para que el trabajo siguiente —en particular un API de bots bajo `/api/v1/bot`— recorra especificación, criterios de aceptación, pruebas primero, implementación, CI y revisión humana.

## Organización del código

| Ruta | Rol |
|---|---|
| `server.js` | Aplicación Express y la mayoría de las rutas. Exporta `app` sin escuchar si no es el módulo principal. |
| `db.js` | Pool de `pg`, SQL directo e `initSchema`. No es un ORM. |
| `migrate_pg.js` | Carga CSV al esquema. No ejecutarlo contra una base real. |
| `routes/` | Routers ya extraídos (`auth`, `clientes`). |
| `middleware/` | Sesión JWT y autorización por rol. |
| `utils/` | Reglas de precio, inventario, reservas y seguridad. |
| `public/` | Interfaz vainilla (`index.html`, `js/`, `css/`). |
| `test/*.test.js` | Suite `node --test` ya existente. |
| `test/integration/` | PostgreSQL 16 aislado, solo con datos ficticios. |
| `test/contract/` | Contrato OpenAPI del API de bots. |
| `test/support/` | Utilidades de prueba. No son pruebas. |
| `features/` | Gherkin ejecutable con Cucumber y Supertest. |
| `docs/` | Constitución, PRD, SDD, BDD, TDD, trazabilidad, riesgos, ADR y registro de cambios. |
| `docs/plantillas/` | Paquete reutilizable de un CHG. |
| `docs/cambios/CHG-###/` | Paquete lleno de un cambio. CHG-026 es el primero con esta carpeta. |
| `docs/api/bot-v1.yaml` | Contrato OpenAPI 3.1 del futuro `/api/v1/bot`. Hoy no tiene operaciones de negocio. |
| `docs/adr/ADR-###.md` | Decisiones de diseño vigentes. |
| `.github/workflows/ci.yml` | CI de cada pull request. |
| `Agricultores.csv`, `Asesores.csv` y el resto de CSV en la raíz | Datos ya comprometidos. No usarlos como semilla, no editarlos en un cambio de arnés y no copiar sus filas a pruebas, logs ni documentación. |

## Flujo obligatorio por CHG

Ningún cambio de comportamiento se implementa antes de dejar el paquete trazable. Copiar `docs/plantillas/` a `docs/cambios/CHG-###/` y registrar la fila en `docs/09-registro-cambios.md`. Los ADR nuevos viven en `docs/adr/`.

1. Historia de usuario, con el rol y el resultado observable.
2. Requisito, con IDs (`PRD-FR`, `PRD-NFR`, `OBJ`) y el alcance que queda fuera.
3. Contrato OpenAPI del API que se toque y un ADR cuando haya una decisión de diseño. Si no hay decisión, el paquete lo dice y no inventa un ADR.
4. Criterios de aceptación en Gherkin. Los que cubran rutas HTTP se agregan también como `.feature` ejecutables.
5. Lista de casos TDD y plan de tareas, antes del código de producción.
6. Pruebas que fallan primero, por la ausencia del comportamiento pedido.
7. Implementación mínima hasta poner esas pruebas en verde, sin ampliar el alcance.
8. CI completo en verde: lint, suite, BDD, cobertura, contrato OpenAPI, secretos y dependencias.
9. Pull request con el diff, la evidencia y revisión de código y de seguridad. No se hace merge desde el agente.
10. Merge y despliegue solo con la aprobación explícita del propietario. Un PR abierto no es esa aprobación.

CHG-026 es infraestructura de prueba y documentación. No autoriza endpoints, columnas ni cambios de contrato comercial.

## Comandos locales

Node 20 es la versión de CI. El árbol es CommonJS (`"type": "commonjs"`). `@cucumber/cucumber` queda en 11.3 porque la serie 13 ya no arranca en Node 20.

```bash
npm ci
npm run lint
npm test
npm run test:unit
npm run test:bdd
npm run test:contract
npm run lint:openapi
npm run test:coverage
npm run audit:deps
```

PostgreSQL 16 aislado, en otra terminal o como servicio:

```bash
# Ejemplo local. La base debe incluir "test", "ci" o "local" en el nombre.
# No apuntar esto a una base operativa.
export TEST_POSTGRES_URL='postgres://postgres@127.0.0.1:5432/casas_grandes_test?sslmode=disable'
export CHG025_TEST_POSTGRES_URL="$TEST_POSTGRES_URL"
npm run test:integration
npm run test:chg025:postgres
```

Sin `TEST_POSTGRES_URL` ni `CHG025_TEST_POSTGRES_URL`, la integración y `TDD-TC-118` se omiten con un mensaje explícito y la suite termina en cero. Eso no es un fallo escondido: el caso no se ejecutó. CI sí levanta PostgreSQL 16 y no omite esos casos.

`npm run test:coverage` aplica el piso de `c8` definido en `.c8rc.json`: 35 % de líneas, 35 % de sentencias, 55 % de ramas y 70 % de funciones. La medición de partida, sin PostgreSQL, fue 37.82 % de líneas y sentencias, 61.3 % de ramas y 76.36 % de funciones. El piso está unos puntos debajo para detectar una caída real. `server.js` concentra rutas que esta suite no ejecuta; el porcentaje no describe calidad de negocio.

## Reglas duras

- No commitear datos personales reales, CSV de clientes o asesores, ni secretos. Las pruebas usan dominios `@example.test` y nombres ficticios.
- No ejecutar `migrate_pg.js` contra una base real ni contra la base de otro entorno. El arnés crea un esquema efímero y lo borra; no llama a esa migración.
- No leer los CSV de la raíz para fabricar semillas, ejemplos ni logs.
- Trabajar en una rama y abrir pull request. No hacer merge, no desplegar y no reescribir historia.
- Merge y despliegue requieren un sí explícito del propietario en el PR o en el canal que él use. Una instrucción de implementación no es esa aprobación.
- `JWT_SECRET` sale del entorno. No agregar otro secreto de respaldo en el código.
- No cambiar comportamiento, rutas ni esquema de la base dentro de un cambio que solo diga ser de arnés.
- Si una prueba ya falla, no se borra ni se salta para pintar CI de verde. Se corrige si el fallo es del arnés, o se documenta en el PR si es un fallo de producto.
- El escaneo de secretos conoce dos hallazgos ya presentes, listados en `.gitleaksignore`. Un hallazgo nuevo rompe CI. No ampliar esa lista para callar un secreto introducido por el cambio.

## API de bots

`docs/api/bot-v1.yaml` reserva el estilo del contrato: OpenAPI 3.1, clave por bot en el encabezado `X-Api-Key`, sin inventario, ventas, cotizaciones, asesores, clientes, catálogo ni alertas. `GET /api/v1/bot/health` es un placeholder para el validador de respuestas y no está montado en Express. El diseño previsto, todavía sin implementar, es clave hasheada por bot, alcances, límite de uso por clave y tabla de auditoría.
