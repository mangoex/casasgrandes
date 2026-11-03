# language: es
# CHG-027. Propuesta sin implementar.
# Cucumber carga features/chg027_bot_inventario.feature, que es esta misma
# especificación, y omite los escenarios por la etiqueta @no-implementado.
# Un escenario omitido no demuestra que el comportamiento exista.

@no-implementado
Característica: PRD-FR-060 — clave de bot y lectura de inventario

  Escenario: BDD-SC-107 la salud del bot no exige clave ni muestra inventario
    Cuando el bot CHG-027 consulta la salud sin clave
    Entonces el bot CHG-027 recibe estado 200
    Y el cuerpo del bot CHG-027 solo indica salud

  Escenario: BDD-SC-108 el disponible resta las reservas activas de la existencia física
    Dado un bot CHG-027 con clave vigente, alcance "inventario:leer" y rol "Almacen"
    Y un híbrido de demostración con existencia física 140 y reserva activa 40
    Cuando el bot CHG-027 consulta el inventario de productos
    Entonces el bot CHG-027 recibe estado 200
    Y el disponible del híbrido de demostración es 100

  Escenario: BDD-SC-109 Almacén ve el detalle por lote y tamaño
    Dado un bot CHG-027 con clave vigente, alcance "inventario:leer" y rol "Almacen"
    Y un híbrido de demostración con lote "LOTE-DEMO-1" y tamaño "BT1"
    Cuando el bot CHG-027 consulta el detalle del híbrido de demostración
    Entonces el bot CHG-027 recibe estado 200
    Y el detalle incluye el lote "LOTE-DEMO-1" y el tamaño "BT1"

  Escenario: BDD-SC-110 los movimientos recientes no llevan datos personales ni precios
    Dado un bot CHG-027 con clave vigente, alcance "inventario:leer" y rol "Almacen"
    Y un movimiento de demostración ligado a un cliente ficticio
    Cuando el bot CHG-027 consulta los movimientos recientes
    Entonces el bot CHG-027 recibe estado 200
    Y el cuerpo del bot CHG-027 no contiene nombre de cliente, correo, teléfono ni precio

  Escenario: BDD-SC-111 una clave ausente o desconocida no entra
    Cuando el bot CHG-027 consulta el inventario sin clave
    Entonces el bot CHG-027 recibe estado 401
    Y la auditoría CHG-027 no guarda la clave presentada

  Escenario: BDD-SC-112 una clave revocada responde como una clave desconocida
    Dado un bot CHG-027 con clave revocada y alcance "inventario:leer"
    Cuando el bot CHG-027 consulta el inventario de productos
    Entonces el bot CHG-027 recibe estado 401
    Y el código de error del bot CHG-027 es "NO_AUTENTICADO"

  Escenario: BDD-SC-113 un alcance distinto de inventario no lee stock
    Dado un bot CHG-027 con clave vigente, alcance "otro:leer" y rol "Almacen"
    Cuando el bot CHG-027 consulta el inventario de productos
    Entonces el bot CHG-027 recibe estado 403
    Y el código de error del bot CHG-027 es "ALCANCE_DENEGADO"

  Escenario: BDD-SC-114 un asesor no recibe lotes, tamaños ni movimientos
    Dado un bot CHG-027 con clave vigente, alcance "inventario:leer" y rol "Asesor"
    Y un híbrido de demostración con lote "LOTE-DEMO-1" y tamaño "BT1"
    Cuando el bot CHG-027 consulta el detalle del híbrido de demostración
    Entonces el bot CHG-027 recibe estado 200
    Y el cuerpo del bot CHG-027 no contiene lote ni tamaño
    Y el cuerpo del bot CHG-027 no contiene existencia física ni reservado
    Cuando el bot CHG-027 consulta los movimientos recientes
    Entonces el bot CHG-027 recibe estado 403
    Y el código de error del bot CHG-027 es "ROL_SIN_VISIBILIDAD"

  Escenario: BDD-SC-115 un rol sin inventario no lee aunque tenga el alcance
    Dado un bot CHG-027 con clave vigente, alcance "inventario:leer" y rol "Observador"
    Cuando el bot CHG-027 consulta el inventario de productos
    Entonces el bot CHG-027 recibe estado 403
    Y el código de error del bot CHG-027 es "ROL_SIN_VISIBILIDAD"

  Escenario: BDD-SC-116 la clave se limita por minuto
    Dado un bot CHG-027 con clave vigente, alcance "inventario:leer", rol "Almacen" y límite 2 por minuto
    Cuando el bot CHG-027 consulta el inventario de productos tres veces
    Entonces el bot CHG-027 recibe estado 429
    Y el código de error del bot CHG-027 es "LIMITE_EXCEDIDO"

  Escenario: BDD-SC-117 cada llamada con clave reconocida queda auditada
    Dado un bot CHG-027 con clave vigente, alcance "inventario:leer" y rol "Almacen"
    Cuando el bot CHG-027 consulta el inventario de productos
    Entonces existe una fila de auditoría CHG-027 sin cuerpo, sin clave y sin datos de cliente

  Escenario: BDD-SC-118 el administrador ve la clave una sola vez y puede revocarla
    Dado un administrador ficticio autenticado en la sesión web
    Cuando crea una clave CHG-027 de alcance "inventario:leer" ligada al rol "Almacen"
    Entonces la respuesta de alta incluye la clave en claro una sola vez
    Cuando consulta el listado de claves CHG-027
    Entonces el listado no incluye la clave en claro
    Cuando revoca esa clave CHG-027
    Entonces la clave revocada recibe estado 401 al consultar el inventario
