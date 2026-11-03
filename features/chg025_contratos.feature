# language: es
Característica: Contratos comerciales CHG-025

  Antecedentes:
    Dado un asesor ficticio autenticado con un híbrido de precio lleno 7000

  Escenario: BDD-SC-100 crédito calcula la cosecha e ignora el descuento manipulado
    Cuando calcula una solicitud "CREDITO" de 1 unidad con descuento 9999
    Entonces la respuesta es 200
    Y el precio final de la partida es 7560
    Y el descuento máximo de la partida es 0

  Escenario: BDD-SC-103 apartado deja los importes en cero
    Cuando calcula una solicitud "APARTADO" de 2 unidades con descuento 9999
    Entonces la respuesta es 200
    Y el total es 0
    Y el precio final de la partida es 0
