# language: es
Característica: Reservas CHG-025

  Escenario: BDD-SC-105 rechaza una suma de tamaños distinta de lo solicitado
    Dado un operador de almacén ficticio autenticado
    Y una solicitud CHG-025 de 100 bolsas pendiente de reserva
    Cuando asigna 60 bolsas "BT1" y 30 bolsas "BT2"
    Entonces la respuesta es 400
    Y no se escribe ninguna reserva
