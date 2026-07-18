# Contexto del proyecto - AgriSales Pro

## Resumen ejecutivo
AgriSales Pro es un CRM orientado a operaciones comerciales agrícolas para coordinar cotizaciones, clientes, visitas, asignación de asesores y seguimiento de ventas. El sistema combina un frontend estático en la carpeta public con un backend Express que expone APIs REST y se integra con PostgreSQL.

## Origen y alcance
- Repositorio local: /Users/renatavictoriagonzalez/Documents/miguelgespino/CasasGrandes
- Repositorio remoto: https://github.com/mangoex/casasgrandes.git
- Rama principal: main
- Último estado visible: el proyecto incluye módulos de CRM, programación semanal, asignación inteligente, agentes IA y manejo de precios y metas.

## Propósito del sistema
La plataforma está pensada para ayudar a:
- gestionar agricultores/clientes y asesores,
- registrar y seguir cotizaciones,
- planear visitas semanales,
- asignar clientes sin asesor mediante un flujo de pujas y notificaciones,
- generar propuestas y reportes con apoyo de agentes de IA.

## Stack técnico
- Backend: Node.js + Express
- Base de datos: PostgreSQL (con adaptación para SQLite en algunos scripts legacy)
- Autenticación: JWT + bcrypt
- Frontend: HTML/CSS/JavaScript estático servido desde public/
- Integraciones: Google Gemini / OpenRouter para agentes de IA
- Gestión de dependencias: npm

## Estructura principal del repositorio
- server.js: API principal y endpoints REST del CRM.
- db.js: conexión a PostgreSQL, auto-migraciones y creación de tablas.
- agentsService.js: lógica de agentes IA, generación de texto, logging y orquestación.
- public/: frontend estático (HTML, CSS y JS).
- utils/pricing.js: motor centralizado de precios y descuentos.
- docs/: documentos de producto y diseño, además de este contexto del proyecto.
- scratch/: scripts de verificación y pruebas manuales.
- csv/ y archivos de importación: datos base para clientes, asesores, productos, almacén, temporadas y control.

## Funcionalidades clave
### CRM y ventas
- Gestión de clientes y asesores.
- Registro y consulta de cotizaciones.
- Seguimiento de estado de ventas (Borrador, Cotizado, Cobrado, Entregado).
- Vista tipo dashboard con métricas y tablas recientes.

### Programación semanal
- Planificación de visitas por día.
- Expiración nocturna de visitas no realizadas.
- Visualización de agenda y rutas.

### Asignación inteligente
- Panel administrativo para clientes huérfanos.
- Flujo de pujas entre asesores.
- Notificaciones para asignación, retiro y decisiones de propuesta.
- Recomendaciones basadas en métricas de ventas, cumplimiento y carga de trabajo.

### Agentes IA
- Agentes para CEO, coordinador y outreach.
- generación de propuestas y contexto ejecutivos.
- almacenamiento de logs y configuración en tablas de base de datos.

## Puntos de configuración
- Variables de entorno esperadas: JWT_SECRET, JWT_EXPIRES_IN, CORS_ORIGINS, DATABASE_URL o PGHOST/PGUSER/PGPASSWORD/PGDATABASE.
- Ejemplo de configuración: .env.example.
- Para iniciar el servidor: npm start.

## Notas importantes
- El proyecto está enfocado en operaciones comerciales reales y en una migración hacia PostgreSQL para despliegue.
- La lógica de negocio está muy ligada a la UI estática y a las rutas del backend.
- Los documentos de diseño en docs/PRD.md y docs/SDD.md contienen la especificación funcional y técnica más completa del sistema.
