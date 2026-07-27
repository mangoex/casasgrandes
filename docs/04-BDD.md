# Behavior-Driven Development

## Feature: PRD-FR-001 — Arranque no destructivo

### BDD-SC-001 — Base sin cotizaciones

```gherkin
Given una base con planeación y cero cotizaciones
When el servidor inicializa el esquema
Then conserva toda la planeación
```

## Feature: PRD-FR-002 — Sesión protegida

### BDD-SC-002 — Login web

```gherkin
Given credenciales válidas de un usuario activo
When inicia sesión desde el navegador
Then recibe una cookie HttpOnly y el cuerpo no expone el JWT
```

### BDD-SC-003 — Restauración y cierre

```gherkin
Given una cookie de sesión válida
When el navegador carga o solicita cerrar sesión
Then restaura el usuario con /api/auth/me o elimina la cookie respectivamente
```

## Feature: PRD-FR-003 — Renderizado seguro

### BDD-SC-004 — Contenido hostil

```gherkin
Given contenido persistido o generado por IA con etiquetas HTML
When la interfaz lo presenta
Then las etiquetas se muestran como texto y no se ejecutan
```

## Feature: PRD-FR-004 — Credenciales explícitas

### BDD-SC-005 — Alta sin contraseña

```gherkin
Given un administrador autenticado
When intenta crear un asesor sin una contraseña de al menos 12 caracteres
Then la API rechaza la solicitud sin crear la cuenta
```

### BDD-SC-006 — Importación sin credencial

```gherkin
Given una importación que no puede conservar una credencial previa
When INITIAL_ADVISOR_PASSWORD_HASH no contiene un hash bcrypt válido
Then la migración se detiene antes de crear usuarios
```

## Escenarios diferidos

- Revocación inmediata de sesiones al desactivar usuarios.
- Autorización horizontal completa.
- Fallos concurrentes de inventario y pujas.

## Feature: PRD-FR-005 — Identidad vigente

### BDD-SC-007 — Cuenta desactivada

```gherkin
Given un token válido de una cuenta posteriormente desactivada
When intenta usar una ruta protegida
Then recibe 403 y el controlador no se ejecuta
```

### BDD-SC-008 — Rol actualizado

```gherkin
Given un token emitido antes de un cambio de rol
When intenta reutilizarlo
Then recibe 403 por versión revocada
```

## Feature: PRD-FR-006 — Propiedad comercial

### BDD-SC-009 — Lectura horizontal

```gherkin
Given un Asesor autenticado
When solicita por ID un agricultor de otro Asesor
Then recibe 403 sin datos personales
```

### BDD-SC-010 — Mutación horizontal

```gherkin
Given un Asesor autenticado
When intenta desasociar o disolver un grupo ajeno
Then recibe 403 y ninguna fila cambia
```

## Feature: PRD-FR-007 — Roles explícitos

### BDD-SC-011 — Rol de almacén en cartera

```gherkin
Given una cuenta con rol Almacen o Acopio
When solicita una ruta de clientes
Then recibe 403
```

## Feature: PRD-FR-008 — Logout revocable

### BDD-SC-012 — Reutilización posterior al logout

```gherkin
Given una sesión válida
When ejecuta logout y reutiliza el token anterior
Then recibe 403
```

## Feature: CHG-003 — Integridad transaccional

### BDD-SC-013 — Fallo intermedio

```gherkin
Given una operación con dos escrituras
When la segunda falla
Then PostgreSQL ejecuta ROLLBACK y no confirma la primera
```

### BDD-SC-014 — Salidas concurrentes

```gherkin
Given dos salidas sobre el mismo producto
When se procesan simultáneamente
Then ambas bloquean el producto y ninguna calcula desde un saldo obsoleto
```

### BDD-SC-015 — Producción atómica

```gherkin
Given una conversión UAN-32
When falla la entrada del producto terminado
Then tampoco se descuenta la materia prima
```

### BDD-SC-016 — Puja concurrente

```gherkin
Given dos decisiones sobre el mismo cliente
When compiten por aprobar una puja
Then solo la primera asignación confirmada produce efectos
```

### BDD-SC-017 — Entrega repetida

```gherkin
Given una cotización ya entregada
When otra petición intenta aplicar la misma transición
Then no genera una segunda salida de inventario
```

## Feature: CHG-004 — Privacidad IA

### BDD-SC-018 — IA sin opt-in

```gherkin
Given una instalación sin consentimiento externo
When CEO u Outreach intenta invocar el modelo
Then falla antes de realizar la solicitud
```

### BDD-SC-019 — Contexto CEO

```gherkin
Given asesores y agricultores productivos
When se construye el contexto CEO
Then incluye métricas por ID y excluye nombres, correos y detalle de agricultores
```

### BDD-SC-020 — Contexto Outreach

```gherkin
Given un agricultor con historial
When se construye la recomendación externa
Then usa alias interno y no incluye nombre ni contacto
```

### BDD-SC-021 — Coordinador local

```gherkin
Given una agenda pendiente
When se genera un recordatorio
Then no se llama a proveedor IA
```

### BDD-SC-022 — Clave en interfaz

```gherkin
Given una solicitud para guardar una clave IA
When llega a la API de configuración
Then se rechaza y PostgreSQL no recibe la clave
```

### BDD-SC-023 — Log sensible

```gherkin
Given un error o resultado con email, teléfono o token
When se registra
Then el detalle persistido contiene marcadores redactados
```
