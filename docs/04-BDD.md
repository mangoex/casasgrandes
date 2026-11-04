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
Then el descuento Nucle es 80 y el precio final unitario es 720
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
When el asesor pulsa Enter o desenfoca para confirmar el precio
Then el sistema fija el precio en la partida sin disparar el envío automático de la cotización
And el sistema solicita el recálculo en vivo al servidor y actualiza la tabla de cotización y hoja virtual
When el asesor intenta teclear un precio menor a 5926 (límite inferior según condición mensual autorizada)
Then el control restringe la entrada impidiendo valores inferiores a 5926 y acota el campo al mínimo autorizado
When el asesor modifica la cantidad de bolsas tras fijar un precio final manual
Then la cotización conserva el precio unitario fijado y recalcula el subtotal por las nuevas bolsas
```

## Feature: CHG-017 — Descuento de Cuenta Clave exclusivo para Calamar e Hipopótamo

### BDD-SC-067 — Semillas Calamar e Hipopótamo reciben beneficio de Cuenta Clave

```gherkin
Given un cliente con nivel de Cuenta Clave Retener GOLD (descuento 100 MXN)
And un producto Semilla Calamar o Hipopótamo con precio base 7015
When se cotiza el producto para ese cliente
Then el sistema aplica el descuento de Cuenta Clave de 100 MXN
And el precio base neto antes de beneficios del asesor es 6915 MXN
And se visualiza el paso Cuenta Clave en Cotizador
```

### BDD-SC-068 — Otras semillas, Agroquímicos y Fertilizantes excluyen beneficio de Cuenta Clave

```gherkin
Given un cliente con nivel de Cuenta Clave Retener GOLD (descuento 100 MXN)
And un producto Semilla distinto como Rinoceronte o Armadillo, o un Agroquímico como Clavis
When se cotiza el producto para ese cliente
Then el sistema asigna 0 MXN de descuento de Cuenta Clave
And el precio base neto permanece íntegro sin deducción de Cuenta Clave
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

## Feature: CHG-019 — Disponibilidad y resiliencia en Tablero y Comisiones

### BDD-SC-072 — Tablero General despliega datos sin errores de scope

```gherkin
Given un usuario con sesión activa en el sistema
When ingresa a la aplicación o navega a la sección Tablero General
Then el sistema resuelve el ciclo agrícola seleccionado sin lanzar ReferenceError
And renderiza los indicadores de ventas, metas y pedidos recientes
And ningún contenedor permanece con el texto "Cargando..."
```

### BDD-SC-073 — Reporte de Comisiones ejecuta consulta compatible

```gherkin
Given un usuario autenticado con permisos comerciales o directivos
When consulta el reporte de comisiones en /api/comisiones/reporte
Then la base de datos ejecuta la consulta mapeando fecha_creacion sin error 42703
And el servidor responde HTTP 200 con la colección de comisiones
And la interfaz renderiza el listado o mensaje sin bloquearse en "Cargando reporte de comisiones..."
```

## Feature: CHG-020 — Acceso a Seguimiento para Asesores y Aislamiento de Cartera

### BDD-SC-074 — Asesor accede a la pestaña Mi Seguimiento

```gherkin
Given un usuario autenticado con rol Asesor
When visualiza el menú de navegación principal
Then el elemento "Seguimiento" está visible
And al seleccionarlo la vista cambia a "Mi Seguimiento"
And el selector de filtro por asesor permanece oculto
```

### BDD-SC-075 — Aislamiento estricto de cartera para Asesor en endpoint

```gherkin
Given un asesor autenticado con ID 2
When envía una solicitud a /api/seguimiento/dashboard con o sin parámetros de otro asesor o ALL
Then el backend procesa la solicitud forzando el filtro exclusivamente al asesor ID 2
And la respuesta contiene únicamente cotizaciones, clientes, metas y visitas del asesor 2
```

### BDD-SC-076 — Supervisión global para Administrador, Coordinador y Director

```gherkin
Given un usuario autenticado con rol Administrador, Coordinador o Director
When consulta /api/seguimiento/dashboard con o sin filtro de asesor
Then el backend autoriza la consulta y permite visualizar métricas globales o filtrar por cualquier asesor
And la interfaz despliega el selector con la lista completa de asesores
```

## Escenarios BDD del Incremento CHG-021

### BDD-SC-077 â€” Consulta exitosa de existencias fÃ­sicas por un Asesor
- **Dado** un usuario autenticado con rol "Asesor"
- **Cuando** realiza una peticiÃ³n GET a `/api/almacen/existencias`
- **Entonces** el servidor responde HTTP 200 con el arreglo de productos y sus existencias actuales sin error de acceso.

### BDD-SC-078 â€” DenegaciÃ³n de mutaciones de almacÃ©n para rol Asesor
- **Dado** un usuario autenticado con rol "Asesor"
- **Cuando** intenta realizar una peticiÃ³n POST a `/api/almacen/existencias/:id/ajuste` o a `/api/almacen/movimientos`
- **Entonces** el servidor responde HTTP 403 Forbidden impidiendo modificaciones no autorizadas al inventario.

### BDD-SC-079 — Filtrado y paginación rápida del pool de pujas
- **Dado** que existen más de 3,000 agricultores en el pool de pujas
- **Cuando** el asesor abre la sección de pujas
- **Entonces** el sistema consulta `/api/asignacion/sin-asesor?puja=1` trayendo solo agricultores en puja
- **Y** renderiza una página de 50 registros con controles de paginación y buscador rápido sin bloquear el navegador.

## Escenarios BDD del Incremento CHG-022

### BDD-SC-080 — Ocultamiento del elemento de menú Almacén para el rol Asesor
> Acotado por ADR-016/CHG-025: se restaura la consulta de existencias generales sin lotes ni tamaños; las operaciones continúan ocultas.
- **Dado** un usuario autenticado con rol "Asesor"
- **Cuando** carga la aplicación web y se evalúan los permisos de interfaz
- **Entonces** el ítem de navegación "Almacén" (`li[data-target="almacen-view"]`) permanece oculto (`display: none`)
- **Y** no aparece ninguna opción de inventario en el menú lateral del vendedor.

### BDD-SC-081 — Redirección y bloqueo en conmutación directa a Almacén para rol Asesor
> Acotado por ADR-016/CHG-025: el Asesor puede abrir exclusivamente el panel de existencias generales.
- **Dado** un usuario autenticado con rol "Asesor"
- **Cuando** se ejecuta la función `switchView('almacen-view')`
- **Entonces** el sistema detecta que el usuario carece de perfil de almacén
- **Y** cancela la carga de existencias redirigiéndolo de forma segura al Tablero General (`dashboard-view`).

### BDD-SC-082 — Denegación perimetral HTTP 403 a rutas /api/almacen para rol Asesor
> Acotado por ADR-016/CHG-025: `GET /api/almacen/existencias` es la única excepción y omite tamaños/lotes.
- **Dado** un usuario autenticado con rol "Asesor"
- **Cuando** intenta realizar cualquier petición HTTP GET o POST a los endpoints de `/api/almacen`
- **Entonces** el middleware `requireRoles(INVENTORY_ROLES)` rechaza la petición con estado HTTP 403 Forbidden.

### BDD-SC-083 — Conservación de acceso a Almacén para Administrador y Encargado de Almacén
- **Dado** un usuario autenticado con rol "Administrador", "Almacen", "Cobranza", "Coordinador" o "Director"
- **Cuando** inicia sesión en la aplicación
- **Entonces** el ítem "Almacén" se visualiza en el menú lateral
- **Y** puede consultar las existencias físicas de los productos e insumos sin restricción.

## Escenarios BDD del Incremento CHG-023

### BDD-SC-084 — Observador visualiza la planificación con selector de todos los asesores
- **Dado** un usuario autenticado con rol "Observador"
- **Cuando** ingresa a la aplicación
- **Entonces** es ubicado de forma predeterminada en la vista de Planificación (`planeacion-view`)
- **Y** el selector de asesores (`#plan-advisor-filter`) está visible y contiene la opción "Todos los Asesores".

### BDD-SC-085 — Observador filtra actividades por un asesor específico
- **Dado** un usuario autenticado con rol "Observador" en la vista de Planificación
- **Cuando** selecciona un asesor particular en el dropdown `#plan-advisor-filter`
- **Entonces** el sistema actualiza el cronograma semanal y las métricas de avance mostrando únicamente las actividades correspondientes a dicho asesor.

### BDD-SC-086 — Ocultamiento de controles de agendar, cerrar y eliminar visitas para Observador
- **Dado** un usuario autenticado con rol "Observador"
- **Cuando** consulta el cronograma semanal
- **Entonces** el botón "Agendar Visita" (`#btn-open-plan-modal`) está oculto
- **Y** las tarjetas de visita no presentan botones para cerrar visita, pasar a prospecto o eliminar
- **Y** al hacer clic en una tarjeta, el modal se abre en modo solo lectura con botones de guardado ocultos.

### BDD-SC-087 — Rechazo en backend HTTP 403 para mutaciones de planificación por Observador
- **Dado** un usuario autenticado con rol "Observador"
- **Cuando** envía una solicitud HTTP POST o PUT a `/api/planificacion` o `/api/planificacion/:id`
- **Entonces** el servidor rechaza la solicitud respondiendo con código HTTP 403 Forbidden impidiendo cualquier modificación.

### BDD-SC-088 — Creación y asignación del rol Observador desde el panel de Administración
- **Dado** un usuario autenticado con rol "Administrador" en el módulo de usuarios
- **Cuando** abre el formulario para dar de alta o editar un asesor
- **Entonces** el selector de rol (`#asesor-role`) incluye la opción "Observador"
- **Y** al guardar, el usuario queda registrado en la base de datos con `nivel_rol = 'Observador'`.

## Escenarios BDD del Incremento CHG-019

### BDD-SC-089 — Recálculo reactivo inmediato de total y subtotales en Cotizador al modificar precio o cantidad
- **Dado** una cotización abierta con uno o más productos en el Cotizador
- **Cuando** el usuario modifica el precio final manual en `item-final-price-input` o la cantidad de bolsas en `item-qty-input` (mediante teclado o botones de incremento/decremento `+`/`-`)
- **Entonces** el sistema recalcula de inmediato y reactivamente el subtotal de la partida (`.mobile-item-subtotal`) multiplicando el precio unitario activo por la nueva cantidad
- **Y** actualiza de forma síncrona el costo total de la cotización (`#preview-total-val` y `#mobile-quote-total`), así como los beneficios de puntos (`#preview-puntos-val` y `#mobile-quote-points`) y cupón (`#preview-cupon-val` y `#mobile-quote-coupon`)
- **Y** la tarjeta de resumen del total (`.mobile-quote-summary`) permanece visible en el formulario para cualquier tamaño de pantalla (móvil, tableta o escritorio) y rol de usuario
- **Y** al resolverse el cálculo del backend, la hoja virtual y la tabla de cotización se consolidan con los valores autorizados del servidor.

## Escenarios BDD del Incremento CHG-020

### BDD-SC-090 — Autorización de eliminación de salidas de almacén por Administrador en UI sin bloqueo de seguridad
- **Dado** un usuario autenticado con rol "Administrador" consultando el Kardex de Almacén
- **Cuando** hace clic en el botón de eliminar movimiento (`.btn-icon` con icono 🗑️)
- **Entonces** el sanitizador de seguridad (`SecurityUtils`) preserva intacto el atributo `onclick` y permite ejecutar `deleteWarehouseMovement`
- **Y** el navegador solicita confirmación al usuario antes de proceder
- **Y** al confirmar, el cliente envía `DELETE /api/almacen/movimientos/:id` al servidor, eliminando el movimiento y recalculando los saldos posteriores.

### BDD-SC-091 — Reactividad de captura manual de precio final y cantidad sin despojo de eventos por sanitizador
- **Dado** una cotización activa en el Cotizador con una partida de producto
- **Cuando** el usuario teclea un precio en el campo `item-final-price-input`
- **Entonces** el sanitizador de seguridad preserva los manejadores de eventos (`onFinalPriceInputChange` y `onFinalPriceInputBlur`) y los listeners directos capturan la entrada en tiempo real
- **Y** el sistema recalcula instantáneamente el slider de descuento, el subtotal de la partida y el total general de la cotización
- **Y** al modificar la cantidad mediante teclado o botones `+`/`-`, el total refleja fielmente el producto del precio final capturado por la nueva cantidad.

### BDD-SC-092 — Integridad y estandarización de calibres oficiales de semilla y reclasificación de agroquímicos
- **Dado** el catálogo de productos y el cotizador
- **Cuando** se consultan los híbridos de semilla (`HIPOPÓTAMO ACCELERON`, `CALAMAR - VITALA`, `A-7573 ACCELERON`, `A-7573 PONCHO`)
- **Entonces** todos los híbridos cuentan con el catálogo completo de 10 calibres oficiales (`BT1, BT2, BT3, BW1, BW2, PT1, PT2, PT3, PW1, PW2`)
- **Y** el producto `MURALLA MAX 250ML` está clasificado correctamente como `Agroquímicos`, impidiendo que el sistema exija calibres de semilla para este insumo.

## Escenarios BDD del Incremento CHG-024

### BDD-SC-093 — Captura manual de Ciclo por partida en entrada y persistencia en base de datos
- **Dado** un usuario con rol autorizado de almacén en el formulario de registro de Entradas
- **Cuando** registra una entrada de producto capturando lote, cantidad y el campo manual `Ciclo` en la partida correspondiente (`.move-item-ciclo`) sin campo redundante en la cabecera
- **Entonces** la solicitud se envía y procesa atómicamente por el backend asignando a cada partida su respectivo `ciclo_agricola`
- **Y** la fila insertada en `almacen_movimientos` contiene el valor de `ciclo_agricola` correspondiente
- **Y** el formulario conserva el modo de operación "Entrada" tras completarse el registro exitoso
- **Y** en las Salidas dicho campo no se solicita ni se exhibe.

### BDD-SC-094 — Proyección del Ciclo en Kardex y Exportación Excel (CSV) / PDF
- **Dado** movimientos de almacén registrados con su respectivo ciclo agrícola
- **Cuando** el usuario consulta el Kardex de Movimientos o hace clic en "Excel (CSV)" o "PDF"
- **Entonces** la tabla de Kardex muestra el ciclo asociado al movimiento
- **Y** el archivo CSV descargado contiene la columna "Ciclo" con su valor para cada partida.

### BDD-SC-095 — Desglose de existencias físicas por lote en la vista de Almacén
- **Dado** un inventario donde un producto ("Hipopótamo") tiene saldo total de 150.000 conformado por múltiples lotes (Lote X: 90.000, Lote Y: 20.000, Lote Z: 40.000)
- **Cuando** el usuario consulta la pestaña "Existencias Físicas"
- **Entonces** la tabla de inventario muestra el total consolidado del producto (150.000)
- **Y** presenta directamente el desglose de cada uno de sus lotes activos con sus respectivas existencias.

### BDD-SC-096 — Resiliencia de esquema y autorrecuperación de columna `ciclo_agricola` en entradas y salidas de Almacén
- **Dado** un entorno de base de datos donde `almacen_movimientos` aún no tiene creada la columna `ciclo_agricola` (por ejemplo, si el conteo parcial de tablas base o el orden de inicialización omitió la migración previa)
- **Cuando** el servidor ejecuta `initSchema()` o recibe un registro de Entrada o Salida en `POST /api/almacen/movimientos`
- **Entonces** `initSchema()` crea previamente cualquier tabla base faltante (como `metas_ventas`) y aplica sin bloqueos `ALTER TABLE almacen_movimientos ADD COLUMN IF NOT EXISTS ciclo_agricola TEXT`
- **Y** si durante `POST /api/almacen/movimientos` ocurre un error de columna inexistente (`42703` / `column "ciclo_agricola" of relation "almacen_movimientos" does not exist`), el backend asegura la columna y reintenta la transacción automáticamente sin devolver error al usuario.

## Escenarios BDD del Incremento CHG-025

### BDD-SC-097 — Cotizador interno sin resumen ni tamaños
- **Dado** un Asesor autenticado
- **Cuando** abre el Cotizador y alterna entre Contado, Crédito y Apartado
- **Entonces** no ve hoja imprimible, resumen, compartir, imprimir ni selección de tamaño
- **Y** conserva la selección de producto y cantidad
- **Y** puede consultar existencias generales, sin lotes ni tamaños.
- **Y** el catálogo de productos y los detalles de propuestas tampoco exponen tamaños a Asesor, Administrador o Coordinador.
- **Y** las lecturas de Kardex/lotes omiten tamaños para cualquier rol distinto de Almacén
- **Y** solo Almacén y Administrador pueden filtrar lotes por tamaño o registrar movimientos manuales de semilla con tamaño en Almacén, mientras que las solicitudes de reserva permanecen exclusivas de Almacén.

### BDD-SC-098 — Precio propuesto opcional por partida de Contado
- **Dado** una propuesta Contado con dos productos
- **Cuando** captura precio propuesto solo en una partida y explica la solicitud en Notas
- **Entonces** se persiste el precio propuesto en esa partida
- **Y** el total autorizado no cambia por ese valor informativo.

### BDD-SC-099 — Contado requiere venta y cobro
- **Dado** una propuesta Contado
- **Cuando** Administrador o Coordinador confirma únicamente venta o únicamente cobro
- **Entonces** no se crea solicitud de Almacén
- **Y** al confirmar el segundo estado se crea exactamente una solicitud aunque se repita la petición.

### BDD-SC-100 — Crédito usa cosecha fija sin beneficios
- **Dado** un producto con precio lleno de `$7,000.00`
- **Cuando** el Asesor crea una solicitud Crédito
- **Entonces** el servidor calcula `$7,560.00` por unidad
- **Y** ignora o rechaza descuentos, Nucle y cupones manipulados.

### BDD-SC-101 — PDF institucional de requisitos
- **Dado** un Administrador que publica un PDF válido de hasta 8 MiB
- **Cuando** un Asesor consulta `Solicitud de crédito y requisitos`
- **Entonces** obtiene el documento activo para visualizar o imprimir
- **Y** un Asesor no puede reemplazarlo.

### BDD-SC-102 — Autorización de Crédito/Apartado y filtro
- **Dado** solicitudes pendientes de las tres condiciones
- **Cuando** Administrador o Coordinador filtra Crédito o Apartado y decide una solicitud
- **Entonces** autorizar crea una solicitud de Almacén y rechazar no la crea
- **Y** un Asesor recibe 403 si intenta decidir.

### BDD-SC-103 — Apartado sin importes
- **Dado** una solicitud Apartado con productos y cantidades
- **Cuando** se guarda
- **Entonces** total, precios y anticipo son cero
- **Y** no se muestran Nucle, cupones, descuentos ni tabulador.

### BDD-SC-104 — Reserva dividida entre tamaños
- **Dado** una solicitud de 100 bolsas del mismo híbrido
- **Cuando** Almacén asigna 60 BT1 y 40 BT2 con disponibilidad suficiente
- **Entonces** se crean dos reservas activas cuya suma es 100
- **Y** la existencia física no cambia y la disponibilidad disminuye en 100.

### BDD-SC-105 — Insuficiencia, suma inválida y concurrencia
- **Dado** dos solicitudes concurrentes sobre la misma disponibilidad
- **Cuando** una asignación excede un tamaño o la suma no coincide con lo solicitado
- **Entonces** se rechaza completa sin reservas parciales
- **Y** dos confirmaciones concurrentes no sobreasignan ni duplican reservas.

### BDD-SC-106 — Entrega, cancelación y reversión
- **Dado** una solicitud completamente reservada
- **Cuando** se entrega, cancela o revierte
- **Entonces** entrega consume reserva y descuenta físico, cancelación previa libera reserva y reversión repone físico
- **Y** repetir cualquier transición no duplica el efecto.

## Feature: PRD-FR-060 — Clave de bot y lectura de inventario

Estado: implementado en la rama, sin merge. El texto ejecutable está en `features/chg027_bot_inventario.feature`.

### BDD-SC-107 — Salud sin clave

- **Dado** el proceso del API de bots
- **Cuando** se consulta la salud sin clave
- **Entonces** responde 200 con estado `ok` y sin cifras de inventario

### BDD-SC-108 — Disponible de producto

- **Dado** un bot de Almacén y un híbrido de demostración con saldo 140 y reserva activa 40
- **Cuando** lista el inventario
- **Entonces** el disponible es 100

### BDD-SC-109 — Detalle de Almacén

- **Dado** el mismo híbrido con lote `LOTE-DEMO-1` y tamaño `BT1`
- **Cuando** Almacén pide el detalle
- **Entonces** el detalle incluye ese lote y ese tamaño

### BDD-SC-110 — Movimientos sin datos de personas

- **Dado** un movimiento de demostración ligado a un cliente ficticio
- **Cuando** Almacén consulta los movimientos
- **Entonces** la respuesta no trae nombre, correo, teléfono ni precio

### BDD-SC-111 — Clave ausente

- **Cuando** se consulta el inventario sin clave
- **Entonces** responde 401 y la auditoría no guarda el valor presentado

### BDD-SC-112 — Clave revocada

- **Dado** una clave revocada
- **Cuando** consulta el inventario
- **Entonces** responde 401 con el mismo código `NO_AUTENTICADO` de una clave desconocida

### BDD-SC-113 — Alcance denegado

- **Dado** una clave vigente sin `inventario:leer`
- **Cuando** consulta el inventario
- **Entonces** responde 403 `ALCANCE_DENEGADO`

### BDD-SC-114 — Vista de Asesor

- **Dado** una clave de Asesor con el alcance
- **Cuando** pide el detalle y luego los movimientos
- **Entonces** el detalle no trae lote, tamaño, existencia física ni reservado, y los movimientos responden 403

### BDD-SC-115 — Rol sin inventario

- **Dado** una clave de Observador con el alcance
- **Cuando** consulta el inventario
- **Entonces** responde 403 `ROL_SIN_VISIBILIDAD`

### BDD-SC-116 — Límite

- **Dado** una clave con límite de 2 por minuto
- **Cuando** consulta tres veces en la misma ventana
- **Entonces** la tercera responde 429 `LIMITE_EXCEDIDO`

### BDD-SC-117 — Auditoría

- **Dado** una clave vigente de Almacén
- **Cuando** consulta el inventario
- **Entonces** queda una fila sin cuerpo, sin clave y sin datos de cliente

### BDD-SC-122 — Lotes del Administrador

- **Dado** un bot de Administrador y el híbrido con lote `LOTE-DEMO-1`
- **Cuando** pide el detalle
- **Entonces** ve el lote y el tamaño del lote, y no el libro de tamaños con reserva

### BDD-SC-123 — Movimiento manual

- **Dado** un movimiento manual de tipo `Entrada` con lote
- **Cuando** el Administrador consulta los movimientos
- **Entonces** el tipo y el lote aparecen, y el campo `tamano` no

### BDD-SC-124 — Búsqueda sin diacríticos

- **Dado** el híbrido de demostración
- **Cuando** el bot busca `Hibrido`
- **Entonces** el disponible es 100

### BDD-SC-125 — Página siguiente de productos y movimientos

- **Dado** un bot de Almacén con más productos y movimientos que el `limite` pedido
- **Cuando** lista productos y movimientos con ese `limite`
- **Entonces** responde 200, `paginacion.siguiente` no es nulo, y repetir la consulta con ese cursor responde 200 con la fila restante

### BDD-SC-118 — Alta y revocación

- **Dado** un administrador ficticio con sesión
- **Cuando** crea una clave, lista las claves y la revoca
- **Entonces** la clave en claro aparece solo en el alta y la clave revocada recibe 401

## Ejecución

CHG-026 deja ejecutable una muestra, no el archivo completo. Los escenarios vivos están en `features/` y se corren con `npm run test:bdd`:

- BDD-SC-034 y BDD-SC-036 en `features/chg008_salud.feature`
- BDD-SC-100 y BDD-SC-103 en `features/chg025_contratos.feature`
- la suma inválida de BDD-SC-105 en `features/chg025_reservas.feature`

BDD-SC-104 se ejercita contra PostgreSQL aislado con `npm run test:integration` cuando existe `TEST_POSTGRES_URL`. El resto de este documento sigue siendo la especificación.

BDD-SC-107..118 y BDD-SC-122..124 se ejecutan desde `features/chg027_bot_inventario.feature`. BDD-SC-125 se ejecuta en `test/chg027_bot_paginacion.test.js`.

## Escenarios BDD del Incremento CHG-028

### BDD-SC-119 — Creación exitosa de solicitud de Crédito a precio de cosecha

- **Dado** un asesor autenticado con un híbrido activo
- **Cuando** crea una solicitud `CREDITO` en `POST /api/cotizaciones` aun con residuo de descuento en el payload
- **Entonces** responde 201 con condición `CREDITO`, estatus `Pendiente`, `flujo_version = 'CHG-025'` y total calculado a precio de cosecha (`precio_lleno * 1.08`).

### BDD-SC-120 — Creación exitosa de solicitud de Apartado sin importes y con autorrecuperación de esquema

- **Dado** un asesor autenticado y un esquema donde `cotizacion_detalles` requiere aseguramiento de columnas o de nulabilidad en `temporada_id`
- **Cuando** crea una solicitud `APARTADO` en `POST /api/cotizaciones`
- **Entonces** el servidor ejecuta `ensureQuotationsSchema()`, completa la transacción y responde 201 con condición `APARTADO`, estatus `Pendiente` y total `0`.


## Escenarios BDD del Incremento CHG-029

### BDD-SC-121 — Administrador consulta lotes por tamaño y registra salida manual de semilla mientras Solicitudes permanece exclusivo de Almacén

- **Dado** un usuario autenticado con rol `Administrador` en el módulo de Almacén
- **Cuando** filtra lotes disponibles por tamaño (`GET /api/almacen/lotes-disponibles?producto_id=7&tamano=BT1`) y registra un movimiento manual de semilla con tamaño en `POST /api/almacen/movimientos`
- **Entonces** la consulta de lotes responde `200` y el movimiento manual responde `201`
- **Y** si el `Administrador` intenta consultar `GET /api/almacen/solicitudes` o asignar tamaños a un pedido en `POST /api/almacen/solicitudes/:id/asignaciones`, el servidor responde `403`.
