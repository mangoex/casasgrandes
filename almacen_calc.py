import sys
import json

def calculate_new_stock(current_stock: float, cantidad_entrante: float = 0.0, cantidad_saliente: float = 0.0) -> float:
    """
    Cálculo determinista del saldo resultante de existencias en almacén.
    """
    ent = float(cantidad_entrante or 0.0)
    sal = float(cantidad_saliente or 0.0)
    new_stock = float(current_stock or 0.0) + ent - sal
    return round(new_stock, 3)

def validate_salida_stock(current_stock: float, cantidad_saliente: float) -> dict:
    """
    Valida si hay suficiente existencia disponible para realizar una salida.
    """
    curr = float(current_stock or 0.0)
    req = float(cantidad_saliente or 0.0)
    if req <= 0:
        return {"valido": False, "mensaje": "La cantidad de salida debe ser mayor a cero."}
    if curr < req:
        return {
            "valido": False,
            "mensaje": f"Existencias insuficientes. Disponibles: {curr:.3f}, Requeridas: {req:.3f}"
        }
    return {"valido": True, "mensaje": "Existencias suficientes."}

def calculate_uan32_yield(solub_tons: float) -> float:
    """
    Calcula el rendimiento determinista en litros de UAN-32 a partir de Novatec Solub 45 (Toneladas).
    Regla estándar: 1 Tonelada de Solub 45 -> 2,000 Litros de UAN-32.
    """
    tons = float(solub_tons or 0.0)
    if tons <= 0:
        return 0.0
    return round(tons * 2000.0, 2)

def calculate_salida_total_price(cantidad: float, precio_unitario: float) -> float:
    """
    Calcula el valor total de una salida comercial en MXN.
    """
    qty = float(cantidad or 0.0)
    price = float(precio_unitario or 0.0)
    return round(qty * price, 2)

def run_unit_tests():
    print("=" * 60)
    print("   EJECUTANDO MOTOR DETERMINISTA DE ALMACÉN (PYTHON UNIT TESTS)")
    print("=" * 60)

    # Test 1: Registro de entrada
    s1 = calculate_new_stock(current_stock=100.0, cantidad_entrante=50.0, cantidad_saliente=0.0)
    print(f"Test 1 -> Saldo entrada: {s1} (Esperado: 150.0)")
    assert s1 == 150.0, f"Error Test 1: {s1}"

    # Test 2: Registro de salida válida
    s2 = calculate_new_stock(current_stock=150.0, cantidad_entrante=0.0, cantidad_saliente=30.5)
    print(f"Test 2 -> Saldo salida: {s2} (Esperado: 119.5)")
    assert s2 == 119.5, f"Error Test 2: {s2}"

    # Test 3: Validación de stock suficiente vs insuficiente
    v_ok = validate_salida_stock(current_stock=50.0, cantidad_saliente=40.0)
    assert v_ok["valido"] is True, f"Error Test 3a: {v_ok}"
    
    v_fail = validate_salida_stock(current_stock=10.0, cantidad_saliente=25.0)
    assert v_fail["valido"] is False, f"Error Test 3b: {v_fail}"
    print("Test 3 -> Validación de existencias OK!")

    # Test 4: Conversión UAN-32
    uan = calculate_uan32_yield(solub_tons=1.5)
    print(f"Test 4 -> Rendimiento UAN-32: {uan} Litros (Esperado: 3000.0)")
    assert uan == 3000.0, f"Error Test 4: {uan}"

    # Test 5: Precio total salida
    total_val = calculate_salida_total_price(cantidad=5.0, precio_unitario=16000.0)
    print(f"Test 5 -> Precio total salida: ${total_val:,.2f} MXN (Esperado: $80,000.00)")
    assert total_val == 80000.0, f"Error Test 5: {total_val}"

    print("=" * 60)
    print("   TODAS LAS PRUEBAS DETERMINISTAS PASARON EXITOSAMENTE! OK")
    print("=" * 60)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--json":
        input_data = json.loads(sys.stdin.read())
        action = input_data.get("action")
        if action == "calculate_stock":
            res = {
                "new_stock": calculate_new_stock(
                    input_data.get("current_stock", 0.0),
                    input_data.get("cantidad_entrante", 0.0),
                    input_data.get("cantidad_saliente", 0.0)
                )
            }
        elif action == "validate_salida":
            res = validate_salida_stock(
                input_data.get("current_stock", 0.0),
                input_data.get("cantidad_saliente", 0.0)
            )
        elif action == "uan32_yield":
            res = {"liters": calculate_uan32_yield(input_data.get("solub_tons", 0.0))}
        else:
            res = {"error": "Acción no reconocida"}
        print(json.dumps(res))
    else:
        run_unit_tests()
