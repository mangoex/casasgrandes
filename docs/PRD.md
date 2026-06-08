# AgriSales Pro - Documento de Requisitos de Producto (PRD)

Este documento describe los requisitos funcionales, objetivos y especificaciones de producto para **AgriSales Pro**, un CRM a la medida diseñado para coordinar, registrar y optimizar las actividades comerciales, planeación de rutas y asignación inteligente de clientes de los asesores agrícolas en campo.

---

## 1. Visión General del Producto

AgriSales Pro centraliza y automatiza el flujo de cotizaciones, la gestión de almacén, el seguimiento de rutas semanales y la asignación inteligente de agricultores sin asesor. La plataforma funciona bajo tres roles de usuario principales:
* **Administrador:** Acceso completo al sistema, reportes globales, asignación inteligente, toma de decisiones en pujas, y mantenimiento de catálogos (asesores, productos, metas).
* **Coordinador:** Supervisa el rendimiento regional, visualiza agendas semanales, y aprueba cotizaciones grandes.
* **Asesor:** Agente de ventas en campo que gestiona a sus agricultores asignados, registra cotizaciones/visitas, realiza check-ins geolocalizados, y postula candidaturas por agricultores disponibles.

---

## 2. Requisitos de las Funcionalidades Principales

### 2.1 Tablero Principal (Dashboard)
* **Resumen de Métricas:** Tarjetas dinámicas con volumen de ventas cobradas (en MXN), cotizaciones activas, y clientes registrados.
* **Gráfico de Ventas Mensuales:** Histograma SVG adaptado a fechas en formato local que agrupa ventas exitosas.
* **Últimas Cotizaciones y Ventas:** Tabla resumida con las transacciones más recientes. La columna "Asesor" se oculta dinámicamente si el usuario logueado es de rol *Asesor*.
* **Seguimiento Regional (Admin/Coord):** Listado y conteo de visitas semanales realizadas por asesor.

### 2.2 Canal de Ventas (Tablero Kanban)
* **Estructura de Fases:** Flujo lineal compuesto por 4 columnas:
  1. `Borrador/Prospecto`
  2. `Cotizado`
  3. `Cobrado`
  4. `Entregado`
* **Mecánica Drag & Drop (Escritorio):** Movimiento libre de cotizaciones entre columnas con actualización automática en la base de datos.
* **Navegación Móvil:** Apilamiento vertical de columnas. Cada tarjeta renderiza botones de dirección inteligentes (`▲ Anterior` / `▼ Siguiente`) con la etiqueta del paso destino para evitar arrastres incómodos en pantallas táctiles.
* **Coloreado Pastel:** Cabecera y fondo de tarjetas con colores HSL translúcidos correspondientes a su etapa para rápida escaneabilidad.

### 2.3 Catálogo de Agricultores
* **Listado de Clientes:** Tabla con datos de contacto, ubicación, superficie de cultivo (hectáreas) y estatus.
* **Búsqueda Avanzada:** Filtros en tiempo real por nombre del agricultor, asesor asignado, o ubicación física.
* **Asignación Manual:** Selector dinámico en la ficha del agricultor para asignar un asesor activo o marcarlo como `-- Sin Asesor --`.

### 2.4 Planificador Semanal (Agenda y Rutas)
* **Calendario de 6 Días (Lunes a Sábado):** Kanban de días de la semana para planificar visitas programadas, presupuestos de bolsas de semilla y montos de venta estimados.
* **Auto-Expiración Nocturna:** Cada medianoche, las visitas no realizadas (`realizada = 0`) del día anterior pasan automáticamente a estado *Expirado* (`realizada = 3`), bloqueando ediciones posteriores para proteger la fidelidad de la agenda en campo.

---

## 3. Asignación Inteligente de Agricultores y Sistema de Pujas (Nuevo)

Esta funcionalidad resuelve el flujo de asignación de agricultores huérfanos (`asesor_id IS NULL`) a través de un panel de control administrativo y un mercado de propuestas de asesores activos.

### 3.1 Vista del Administrador (Mesa de Control de Asignación)
* **Tablero Kanban de Asignación:**
  1. **Columna 1: Agricultores sin Asesor:** Tarjetas de agricultores huérfanos con datos de contacto, historial de compras, y acceso al botón de sugerencias IA.
  2. **Columna 2: Asesores (Drop Zones):** Tarjetas de asesores activos que muestran sus ventas acumuladas, efectividad de visitas y carga de trabajo. Funciona como zona de arrastre para asignación directa.
  3. **Columna 3: Pool "Disponible" (Pujas):** Listado de clientes puestos a subasta.
* **Arrastrar y Habilitar Puja:** El administrador puede arrastrar un agricultor desde la columna 1 y soltarlo en la columna 3 (Pool Disponible) para marcarlo automáticamente como disponible para puja (`disponible_para_puja = 1`).
* **Sugerencia Inteligente de IA:**
  Al hacer clic en el botón `🤖 IA` de un agricultor huérfano, un modal calcula un porcentaje de coincidencia (Match Score) para cada asesor y ordena las recomendaciones:
  - **Algoritmo de Prioridad Premium:** Si el agricultor tiene compras históricas mayores a $1M MXN, prioriza la efectividad en ventas y el cumplimiento de visitas del asesor.
  - **Algoritmo de Cobertura General:** Si el agricultor es regular o nuevo, prioriza la disponibilidad de agenda libre (menor cantidad de visitas pendientes) y el cumplimiento de visitas.
  - **Razonamientos Dinámicos:** Genera una justificación textual descriptiva evaluando el historial del asesor.
* **Mesa de Decisiones de Pujas:**
  Al hacer clic en `👁️ Propuestas` dentro de un cliente del Pool, se abre un modal con el listado de asesores postulados, sus justificaciones, sus estadísticas y botones para **✓ Aceptar** o **✗ Rechazar**. Aprobar una propuesta desactiva la disponibilidad del pool, asigna al asesor y rechaza las candidaturas restantes.

### 3.2 Vista del Asesor (Postulaciones y Notificaciones)
* **Acceso Lateral:** Menú lateral `🔄 Asignación` visible para asesores que los lleva a su panel de gestión.
* **Bandeja de Postulaciones:** Muestra los agricultores disponibles en el pool con su historial de compras. Un botón `✏️ Postularse` abre un modal para ingresar la justificación de por qué considera que él debe atender a este agricultor. El asesor puede editar la justificación mientras la propuesta esté *Pendiente*.
* **Buzón de Notificaciones:** Notificaciones instantáneas en su panel para recibir alertas de cambios en su cartera, tales como:
  - *"Se te ha asignado al agricultor: [Nombre]."*
  - *"Se te ha retirado del agricultor: [Nombre]."*
  - *"Tu propuesta para el agricultor [Nombre] fue Aprobada."*
  - *"Tu propuesta para el agricultor [Nombre] fue rechazada (asignado a otro asesor)."*
