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
