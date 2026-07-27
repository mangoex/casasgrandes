# Threat model R3

## Alcance

Modelo vigente para CHG-001 y CHG-002. Activos principales: sesiones, PII de agricultores y asesores, cotizaciones, planeación, reportes, precios e inventario.

## Límites de confianza

- Navegador ↔ Express: toda entrada y todo identificador son no confiables.
- Express ↔ PostgreSQL: PostgreSQL es autoridad de identidad, propiedad y datos operativos.
- Express ↔ proveedores IA: frontera externa pendiente de gobierno de privacidad.
- Scripts internos ↔ Express: Bearer explícito, sujeto a la misma identidad vigente y políticas.

## Amenazas y controles

| ID | Categoría | Amenaza | Control actual | Riesgo residual |
|---|---|---|---|---|
| THR-001 | Suplantación | Reutilizar JWT de cuenta desactivada o con rol anterior | `session_version`, cuenta activa y rol desde DB | Disponibilidad de DB condiciona autenticación |
| THR-002 | Elevación | Asesor cambia ID para consultar cartera ajena | políticas por propiedad y pruebas IDOR | revisar cada nuevo endpoint |
| THR-003 | Divulgación | Almacén/Acopio consulta PII comercial | listas explícitas por prefijo de ruta | rutas compartidas deben revisarse al crecer |
| THR-004 | Manipulación | Desasociar, disolver o reactivar cartera ajena | autorización previa a mutación | transacciones globales quedan para CHG-003 |
| THR-005 | Repudio | Acciones sensibles sin auditoría durable | logs de aplicación existentes | pendiente auditoría estructurada y retención |
| THR-006 | DoS | Fuerza bruta o saturación de autenticación | credenciales robustas | pendiente rate limiting distribuido |
| THR-007 | Divulgación | XSS obtiene sesión o PII | HttpOnly, codificación, CSP P0 | retirar `unsafe-inline` en incremento frontend |
| THR-008 | Manipulación | Condición de carrera en inventario o pujas | transacciones y locks en operaciones CHG-003 | alcance residual documentado en RSK-005 |
| THR-009 | Privacidad | PII enviada a proveedor IA o expuesta en logs | CHG-004: opt-in, pseudonimización, claves por entorno y redacción | política legal/retención pendiente |

## Casos de abuso obligatorios

- Token válido con cuenta inexistente, inactiva o versión anterior.
- Asesor consulta, modifica, agrupa, desasocia o reactiva agricultor ajeno.
- Almacén/Acopio solicita rutas comerciales.
- Asesor intenta ejecutar rutas administrativas.
- Cliente manipula `asesor_id` en cuerpo o query.

## Condiciones de revisión

Actualizar este documento al introducir un rol, recurso con propietario, integración externa, operación irreversible o nueva frontera de confianza.
