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

## Feature: CHG-005 — Dependencias seguras

### BDD-SC-024 — Vulnerabilidad conocida

```gherkin
Given un lockfile con vulnerabilidades críticas o altas conocidas
When se aplican actualizaciones transitivas compatibles
Then la auditoría reporta cero vulnerabilidades y la regresión funcional permanece verde
```

## Feature: CHG-006 — Resistencia a abuso HTTP

### BDD-SC-025 — Fuerza bruta por cuenta

```gherkin
Given intentos fallidos repetidos para el mismo identificador
When se supera el máximo de la ventana
Then login responde 429 sin consultar credenciales nuevamente
```

### BDD-SC-026 — Ventana expirada

```gherkin
Given un actor temporalmente limitado
When vence la ventana configurada
Then puede volver a intentar y el contador inicia de nuevo
```

### BDD-SC-027 — JSON general excesivo

```gherkin
Given una petición JSON general mayor a 1 MiB
When el servidor intenta procesarla
Then responde 413 con JSON y no ejecuta el controlador
```

### BDD-SC-028 — Anexo sin sesión

```gherkin
Given un anexo potencial de hasta 12 MiB sin sesión válida
When llega al endpoint de adjuntos
Then autenticación lo rechaza antes de parsear el cuerpo
```

### BDD-SC-029 — Scripts inline

```gherkin
Given una respuesta HTML
When el navegador aplica CSP
Then solo carga archivos script del mismo origen y bloquea bloques inline
```

## Feature: CHG-007 — Atomicidad comercial

### BDD-SC-030 — Detalle de cotización falla

```gherkin
Given una nueva cotización con varias escrituras
When falla la inserción de un detalle
Then no existen cabecera, transición de prospecto ni reporte parcial
```

### BDD-SC-031 — Conversión repetida

```gherkin
Given dos solicitudes para convertir la misma planificación
When ambas compiten
Then solo se crea un prospecto y la segunda reutiliza el confirmado
```

### BDD-SC-032 — Edición entregada sin saldo

```gherkin
Given una cotización entregada y productos bloqueados
When los nuevos detalles requieren más saldo del disponible tras la reversión
Then toda la edición revierte sin reemplazar detalles ni movimientos
```

### BDD-SC-033 — Edición interrumpida

```gherkin
Given una edición que ya insertó una reversión
When falla el reemplazo de detalles
Then PostgreSQL revierte la reversión y conserva la cotización original
```

## Feature: CHG-008 — Salud operativa y ciclo de vida

### BDD-SC-034 — Proceso vivo

```gherkin
Given el servidor HTTP está aceptando solicitudes
When se consulta /health/live aunque PostgreSQL esté degradado
Then responde 200 con estado alive
```

### BDD-SC-035 — Dependencia disponible

```gherkin
Given PostgreSQL responde dentro del límite
When se consulta /health/ready
Then responde 200 con estado ready
```

### BDD-SC-036 — Dependencia degradada

```gherkin
Given PostgreSQL falla o excede el límite
When se consulta /health/ready
Then responde 503 con estado degraded y sin detalle interno
```

### BDD-SC-037 — Solicitud correlacionada

```gherkin
Given una solicitud con ID válido o malicioso
When termina la respuesta
Then devuelve un ID seguro y registra solo metadatos operativos sin query ni PII
```

### BDD-SC-038 — Terminación ordenada

```gherkin
Given servidor, scheduler y pool activos
When el proceso recibe una señal de terminación
Then deja de aceptar, espera actividad y cierra cada recurso
```

### BDD-SC-039 — Señal repetida

```gherkin
Given un apagado ya iniciado
When llega otra solicitud de apagado
Then reutiliza el mismo resultado sin cerrar recursos por segunda vez
```

## Feature: CHG-009 — Precio mensual y presupuesto total

### BDD-SC-040 — Saldo después de reducción mensual

```gherkin
Given un producto con precio anual 7015, precio mensual 6300 y promoción de 1089 MXN
When el asesor abre una cotización del mes configurado
Then el precio de lista es 6300, la reducción incluida es 715 y el saldo adicional es 374
```

### BDD-SC-041 — Promoción porcentual y beneficios separados

```gherkin
Given una promoción porcentual y beneficios de temporada, volumen o Cuenta Clave
When se calcula la partida
Then el tope porcentual usa el precio anual y los otros beneficios no consumen el saldo del asesor
```

### BDD-SC-042 — Programación inconsistente

```gherkin
Given una reducción mensual mayor al tope promocional total
When Administrador o Coordinador intenta guardar Programación
Then el servidor responde 400 y no modifica ninguno de los doce meses
```

### BDD-SC-043 — Descuento cliente manipulado

```gherkin
Given un saldo adicional autorizado de 374 MXN
When el cliente envía un descuento de 375 MXN
Then el servidor responde 400 y no crea ni edita la cotización
```

### BDD-SC-044 — Canales consistentes

```gherkin
Given el mismo producto, fecha y contexto comercial
When se cotiza por previsualización, alta, edición, planificación u Outreach
Then todos usan el mismo precio mensual y presupuesto de descuento
```

### BDD-SC-045 — Histórico inmutable

```gherkin
Given una cotización persistida con snapshot CHG-009
When cambia el catálogo o la Programación
Then sus importes y desglose permanecen sin recalcularse
```

### BDD-SC-046 — Precio mensual superior al catálogo

```gherkin
Given un precio mensual mayor al anual
When se calcula el presupuesto
Then la reducción consumida es cero y el tope completo queda disponible
```

### BDD-SC-047 — Límite de mes contractual

```gherkin
Given una cotización creada o editada cerca de un cambio de mes en America/Mazatlan
When se resuelve Programación
Then se usa el mes de la fecha contractual y no la zona horaria accidental del proceso
```

## Feature: CHG-010 — Precio y descuento vinculados en Programación

### BDD-SC-048 — Editar precio mensual

```gherkin
Given un producto con precio anual conocido
When Administrador o Coordinador cambia el precio mensual
Then la interfaz recalcula el descuento total en MXN y su porcentaje sobre el precio anual
```

### BDD-SC-049 — Editar descuento en dinero

```gherkin
Given un producto con precio anual conocido
When Administrador o Coordinador cambia el descuento total en MXN
Then la interfaz recalcula el precio mensual y el porcentaje equivalente
```

### BDD-SC-050 — Editar descuento porcentual

```gherkin
Given un producto con precio anual conocido
When Administrador o Coordinador cambia el porcentaje de descuento
Then la interfaz recalcula el descuento en MXN y el precio mensual
```

### BDD-SC-051 — Representaciones consistentes

```gherkin
Given una fila mensual con descuento en MXN y porcentaje
When se guarda Programación
Then el servidor acepta ambos valores si equivalen al mismo centavo y rechaza cualquier discrepancia
```

## Feature: CHG-011 — Tope mensual completo en Cotizador

### BDD-SC-052 — Barra desde precio mensual

```gherkin
Given un precio mensual de 6300 y un tope configurado de 1089
When el asesor agrega el producto al Cotizador
Then la barra inicia en cero, muestra máximo 1089 y el precio inicial es 6300
```

### BDD-SC-053 — Aplicar el máximo

```gherkin
Given una barra con precio mensual 6300 y máximo 1089
When el asesor mueve la barra al límite
Then el descuento aplicado es 1089 y el precio final es 5211
```

### BDD-SC-054 — Límite autoritativo

```gherkin
Given un tope mensual de 1089
When un cliente manipulado envía 1089.01
Then el servidor responde 400 y no persiste la cotización
```

## Feature: CHG-012 — Barra acumulada desde Programación

### BDD-SC-055 — Descuento mensual agotado

```gherkin
Given catálogo 7015, precio mensual 5926, descuento incorporado 1089 y tope 1089
When el asesor agrega el producto al Cotizador
Then el precio inicial es 5926 y la barra aparece completa en 1089 sin descuento adicional disponible
```

### BDD-SC-056 — Descuento mensual parcial

```gherkin
Given catálogo 7015, precio mensual 6926, descuento incorporado 89 y tope 1089
When el asesor agrega el producto al Cotizador
Then la barra inicia visualmente en 89 y permite desplazarse hasta 1089
```

### BDD-SC-057 — Diferencia adicional sin duplicar el piso

```gherkin
Given una barra acumulada que inicia en 89 y termina en 1089 sobre precio mensual 6926
When el asesor mueve la barra a 1089
Then el servidor recibe 1000 de descuento adicional y el precio final es 5926
```

## Feature: CHG-013 — Precio base y margen Asesor explícito

### BDD-SC-058 — Programación muestra el precio base fijo

```gherkin
Given un producto con precio base 7015 configurado en Productos
When el coordinador lo selecciona en Programación
Then ve 7015 junto al nombre y no puede modificarlo desde la tabla mensual
```

### BDD-SC-059 — Precio del mes y Asesor forman el rango

```gherkin
Given precio base 7015
When se guarda precio del mes 6926 y Asesor 1000
Then el servidor deriva descuento incorporado 89 y tope acumulado 1089
```

### BDD-SC-060 — Cotizador explica el contrato

```gherkin
Given la programación del escenario anterior
When el asesor selecciona el producto en Cotizador
Then ve Precio base 7015 y una barra que inicia en 89 y termina en 1089
```

## Feature: CHG-014 — Nucle mensual

### BDD-SC-061 — Configurar doce meses

```gherkin
Given un Administrador en el catálogo Nucle
When guarda un porcentaje válido para cada mes de enero a diciembre
Then los doce porcentajes quedan disponibles para cotizaciones de su mes contractual
```

### BDD-SC-062 — Acumular Nucle con descuento del asesor

```gherkin
Given un Híbrido con precio mensual 900, descuento asesor 100 y Nucle de 10 por ciento
When el usuario marca Nucle
Then el descuento Nucle es 90 y el precio final unitario es 710
```

### BDD-SC-063 — Excluir Agroquímicos

```gherkin
Given una cotización mixta con Híbridos y Agroquímicos
When se aplica Nucle
Then solo las partidas Híbrido o Semilla reciben el descuento
```

### BDD-SC-064 — Conservar histórico

```gherkin
Given una cotización creada con Nucle
When cambia posteriormente el catálogo mensual
Then la cotización conserva la bandera, porcentaje e importes Nucle originales
```

<<<<<<< HEAD
## Feature: CHG-016 — Precisión y sincronización bidireccional en Cotizador

### BDD-SC-065 — Barra de descuento avanza en enteros de 1 en 1 peso

```gherkin
Given una partida en Cotizador con rango de descuento disponible
When el asesor desplaza la barra de descuento
Then la barra se mueve en incrementos enteros de 1 en 1 peso sin centavos arbitrarios
```

### BDD-SC-066 — Edición directa de Precio Final sincroniza descuento y barra

```gherkin
Given un producto con precio base neto 7015, piso de descuento 89 y tope acumulado 1089 (descuento asesor disponible 1000)
When el asesor teclea 6000 en el campo de Precio Final
Then el descuento aplicado se ajusta a 1015 (89 incorporado + 926 adicional)
And la barra de descuento se posiciona en 1015
And los totales de la cotización reflejan el precio final de 6000
When el asesor teclea un precio menor a 5926 (precio mínimo con tope de 1000 pesos de asesor)
Then el campo se acota automáticamente a 5926 y el descuento no excede el tope autorizado
```

## Feature: CHG-017 — Descuento de Cuenta Clave exclusivo para semillas

### BDD-SC-067 — Semillas e híbridos reciben beneficio de Cuenta Clave

```gherkin
Given un cliente con nivel de Cuenta Clave Retener GOLD (descuento 100 MXN)
And un producto Semilla o Híbrido como Hipopótamo o Calamar con precio base 7015
When se cotiza el producto para ese cliente
Then el sistema aplica el descuento de Cuenta Clave de 100 MXN
And el precio base neto antes de beneficios del asesor es 6915 MXN
And se visualiza el paso Cuenta Clave en Cotizador
```

### BDD-SC-068 — Agroquímicos y Fertilizantes excluyen beneficio de Cuenta Clave

```gherkin
Given un cliente con nivel de Cuenta Clave Retener GOLD (descuento 100 MXN)
And un producto Agroquímico como Clavis con precio de catálogo 897.19 MXN
When se cotiza el producto para ese cliente
Then el sistema asigna 0 MXN de descuento de Cuenta Clave
And el precio base neto de Clavis permanece en 897.19 MXN
And el paso Cuenta Clave permanece oculto en Cotizador para esa partida
```

## Feature: CHG-018 / PRD-FR-039..041 — Notificaciones en tablero por rol

### BDD-SC-069 — Notificaciones para Asesor

```gherkin
Given un Asesor autenticado con visitas programadas para el día de hoy
When visualiza el tablero general y hace clic en la campana de notificaciones
Then el popover presenta la lista de visitas de hoy y permite iniciar o consultar cada visita
```

### BDD-SC-070 — Notificaciones para Administrador

```gherkin
Given un Administrador autenticado con cotizaciones en estado Borrador o Pendiente
When abre el popover de notificaciones desde el encabezado del tablero
Then el popover presenta las cotizaciones pendientes de revisión y autorizar con enlace a su detalle
```

### BDD-SC-071 — Comportamiento y tabs del Popover

```gherkin
Given el centro de notificaciones abierto en la interfaz
When el usuario navega entre las pestañas Todas, No leídas y Archivadas
Then filtra correctamente los elementos y se cierra limpiamente al hacer clic fuera o presionar Escape
```
