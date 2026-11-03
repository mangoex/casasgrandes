# language: es
Característica: Salud operativa CHG-008

  Escenario: BDD-SC-034 el proceso responde vivo sin usar la base
    Dado que el servidor HTTP acepta solicitudes
    Cuando se consulta "/health/live"
    Entonces la respuesta es 200
    Y el cuerpo JSON es:
      """
      {"status":"alive"}
      """

  Escenario: BDD-SC-036 readiness degradada no revela el fallo interno
    Dado que PostgreSQL de readiness falla con un detalle interno
    Cuando se consulta "/health/ready"
    Entonces la respuesta es 503
    Y el cuerpo JSON es:
      """
      {"status":"degraded"}
      """
    Y la respuesta no contiene "secret"
