# Constitución del proyecto

## Misión

Proteger la continuidad y confidencialidad de la operación comercial agrícola mediante cambios explícitos, verificables y reversibles.

## Principios

### PROJECT-PR-001

Toda implementación debe ser trazable a un requisito confirmado.

### PROJECT-PR-002

El arranque y las migraciones nunca eliminarán datos operativos por inferencia.

### PROJECT-PR-003

Todo dato externo, persistido o generado por IA se tratará como no confiable antes de renderizarlo.

### PROJECT-PR-004

Ninguna cuenta nueva o importada tendrá una contraseña conocida, compartida o implícita.

### PROJECT-PR-005

Las sesiones del navegador se transportarán en cookies protegidas contra lectura por JavaScript.

### PROJECT-PR-006

Toda autorización se decidirá en el servidor con la identidad activa y el rol vigente almacenados en PostgreSQL; los datos del JWT no serán autoridad suficiente.

### PROJECT-PR-007

Un Asesor solo podrá leer o mutar clientes, cotizaciones, planeaciones, prospectos y reportes cuyo `asesor_id` corresponda a su identidad vigente.

### PROJECT-PR-008

Las rutas sensibles aplicarán denegación por defecto y una lista explícita de roles permitidos.

### PROJECT-PR-009

Toda operación que cambie más de una fila financiera, de inventario o de asignación será atómica y bloqueará su recurso canónico antes de calcular el nuevo estado.

### PROJECT-PR-010

Una transición repetida o concurrente no podrá duplicar efectos de inventario, asignación ni notificaciones.

### PROJECT-PR-011

La IA externa permanecerá desactivada salvo consentimiento operativo explícito mediante configuración de entorno.

### PROJECT-PR-012

Nombres, correos, teléfonos, direcciones, URLs de contacto, credenciales y texto libre de clientes no se enviarán a proveedores IA.

### PROJECT-PR-013

Las claves de proveedores solo residirán en el gestor de secretos o variables de entorno; PostgreSQL y logs no serán almacenes autorizados.

### PROJECT-PR-014

Ningún incremento podrá cerrarse con vulnerabilidades críticas o altas conocidas en dependencias de producción.

## Fuentes canónicas

| Fuente | Autoridad | Responsable |
|---|---|---|
| Esta Constitución | Reglas de seguridad del proyecto | Responsable del producto |
| `docs/02-PRD.md` | Requisitos del incremento | Responsable del producto |
| `docs/adr/ADR-001.md` | Decisión de sesión web | Responsable técnico |
| `docs/adr/ADR-002.md` | Autorización central y revocación | Responsable técnico |
| `docs/adr/ADR-003.md` | Transacciones y bloqueos pesimistas | Responsable técnico |
| `docs/adr/ADR-004.md` | Frontera de privacidad para IA | Responsable de producto y técnico |
| `docs/adr/ADR-005.md` | Política de dependencias vulnerables | Responsable técnico |
| PostgreSQL | Datos operativos productivos | Responsable de operación |

## Límites

- Incluye: CHG-001..005; CHG-005 gobierna vulnerabilidades conocidas en dependencias.
- Excluye: despliegue o modificación directa de producción.

## Seguridad y cambios

- Acciones sensibles: borrado de datos, emisión de sesiones, alta de usuarios y renderizado de contenido no confiable.
- Aprobadores: usuario propietario para implementación; responsable operativo para cualquier despliegue posterior.
- Control de cambios: usar `CHG-###`.
