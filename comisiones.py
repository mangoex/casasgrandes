import sys
import json

def calculate_item_commission(item_subtotal, cantidad_ordenada, regla_base=None, regla_temporada=None):
    """
    Calcula la comisión para una partida de cotización.
    - regla_base: dict con {'tipo_valor': 'porcentaje'|'monto_fijo', 'valor': float}
    - regla_temporada: dict con {'tipo_valor': 'porcentaje'|'monto_fijo', 'valor': float, 'comportamiento': 'sobrescribir'|'sumar'}
    """
    comision_base = 0.0
    comision_temporada = 0.0

    if regla_base:
        tipo_val = regla_base.get('tipo_valor')
        valor = float(regla_base.get('valor', 0.0))
        if tipo_val == 'porcentaje':
            comision_base = float(item_subtotal) * (valor / 100.0)
        elif tipo_val == 'monto_fijo':
            comision_base = float(cantidad_ordenada) * valor

    if regla_temporada:
        tipo_val_temp = regla_temporada.get('tipo_valor')
        valor_temp = float(regla_temporada.get('valor', 0.0))
        comportamiento = regla_temporada.get('comportamiento', 'sumar')

        if tipo_val_temp == 'porcentaje':
            monto_temp = float(item_subtotal) * (valor_temp / 100.0)
        elif tipo_val_temp == 'monto_fijo':
            monto_temp = float(cantidad_ordenada) * valor_temp
        else:
            monto_temp = 0.0

        if comportamiento == 'sobrescribir':
            comision_base = 0.0
            comision_temporada = monto_temp
        else:  # 'sumar'
            comision_temporada = monto_temp

    comision_base = round(comision_base, 2)
    comision_temporada = round(comision_temporada, 2)
    total_comision = round(comision_base + comision_temporada, 2)

    return {
        "monto_base_aplicado": comision_base,
        "monto_temporada_aplicado": comision_temporada,
        "total_comision_mxn": total_comision
    }


def evaluate_meta_bonus(ventas_acumuladas, meta_ventas, reglas_bonos):
    """
    Evalúa el bono por meta alcanzada en el ciclo agrícola.
    - ventas_acumuladas: float
    - meta_ventas: float
    - reglas_bonos: list of dicts [{'porcentaje_meta_requerido': float, 'bono_mxn': float, 'activo': int}]
    """
    if not meta_ventas or meta_ventas <= 0:
        pct_alcanzado = 0.0
    else:
        pct_alcanzado = (float(ventas_acumuladas) / float(meta_ventas)) * 100.0

    pct_alcanzado = round(pct_alcanzado, 2)
    max_bono = 0.0

    for regla in reglas_bonos:
        if regla.get('activo', 1) == 1:
            req_pct = float(regla.get('porcentaje_meta_requerido', 0.0))
            bono_val = float(regla.get('bono_mxn', 0.0))
            if pct_alcanzado >= req_pct and bono_val > max_bono:
                max_bono = bono_val

    return {
        "porcentaje_meta_alcanzado": pct_alcanzado,
        "bono_proyectado_mxn": round(max_bono, 2)
    }


def run_unit_tests():
    print("=" * 60)
    print("      EJECUTANDO MOTOR DE COMISIONES (PYTHON UNIT TESTS)")
    print("=" * 60)

    # Escenario 1: Comisión Base + Condición de pago
    # 100 Bolsas de Hipopótamo Acceleron de Contado. Regla: $150 MXN por bolsa.
    res1 = calculate_item_commission(
        item_subtotal=621000.0,
        cantidad_ordenada=100,
        regla_base={"tipo_valor": "monto_fijo", "valor": 150.0}
    )
    print(f"Escenario 1 -> Total: ${res1['total_comision_mxn']:,.2f} MXN (Esperado: $15,000.00)")
    assert res1['total_comision_mxn'] == 15000.0, f"Error Escenario 1: {res1}"
    print("Escenario 1 OK!")

    # Escenario 2: Prioridad de la Temporada (Sobrescribir)
    # 50 Bolsas Semilla X. Base: 2.5% ($100k -> $2.5k). Temporada: $100 fijos (sobrescribir) -> $5,000.
    res2 = calculate_item_commission(
        item_subtotal=100000.0,
        cantidad_ordenada=50,
        regla_base={"tipo_valor": "porcentaje", "valor": 2.5},
        regla_temporada={"tipo_valor": "monto_fijo", "valor": 100.0, "comportamiento": "sobrescribir"}
    )
    print(f"Escenario 2 -> Base: ${res2['monto_base_aplicado']:,.2f}, Temp: ${res2['monto_temporada_aplicado']:,.2f}, Total: ${res2['total_comision_mxn']:,.2f} MXN (Esperado: Base $0, Temp $5,000)")
    assert res2['monto_base_aplicado'] == 0.0 and res2['total_comision_mxn'] == 5000.0, f"Error Escenario 2: {res2}"
    print("Escenario 2 OK!")

    # Escenario 3: Base (3%) + Temporada (1% sumar)
    # Venta: $30,000. Base: $900, Temp: $300. Total = $1,200.
    res3 = calculate_item_commission(
        item_subtotal=30000.0,
        cantidad_ordenada=10,
        regla_base={"tipo_valor": "porcentaje", "valor": 3.0},
        regla_temporada={"tipo_valor": "porcentaje", "valor": 1.0, "comportamiento": "sumar"}
    )
    print(f"Escenario 3 -> Base: ${res3['monto_base_aplicado']:,.2f}, Temp: ${res3['monto_temporada_aplicado']:,.2f}, Total: ${res3['total_comision_mxn']:,.2f} MXN (Esperado: Base $900, Temp $300, Total $1,200)")
    assert res3['monto_base_aplicado'] == 900.0 and res3['monto_temporada_aplicado'] == 300.0 and res3['total_comision_mxn'] == 1200.0, f"Error Escenario 3: {res3}"
    print("Escenario 3 OK!")

    # Evaluación de Bono por Meta
    reglas_bonos = [
        {"porcentaje_meta_requerido": 80.0, "bono_mxn": 5000.0, "activo": 1},
        {"porcentaje_meta_requerido": 100.0, "bono_mxn": 15000.0, "activo": 1},
        {"porcentaje_meta_requerido": 120.0, "bono_mxn": 25000.0, "activo": 1}
    ]
    res_bono = evaluate_meta_bonus(1010000.0, 1000000.0, reglas_bonos)
    print(f"Evaluación Bono Meta (101%) -> Progreso: {res_bono['porcentaje_meta_alcanzado']}%, Bono: ${res_bono['bono_proyectado_mxn']:,.2f} MXN (Esperado: $15,000)")
    assert res_bono['bono_proyectado_mxn'] == 15000.0, f"Error Bono Meta: {res_bono}"
    print("Evaluación Bono OK!")

    print("=" * 60)
    print("   TODAS LAS PRUEBAS UNITARIAS DE PYTHON PASARON EXITOSAMENTE")
    print("=" * 60)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        run_unit_tests()
        return

    if len(sys.argv) > 1 and sys.argv[1] == '--calc-item':
        try:
            payload = json.loads(sys.argv[2])
            res = calculate_item_commission(
                item_subtotal=payload.get('item_subtotal', 0.0),
                cantidad_ordenada=payload.get('cantidad_ordenada', 0),
                regla_base=payload.get('regla_base'),
                regla_temporada=payload.get('regla_temporada')
            )
            print(json.dumps(res))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
        return

    if len(sys.argv) > 1 and sys.argv[1] == '--eval-bonus':
        try:
            payload = json.loads(sys.argv[2])
            res = evaluate_meta_bonus(
                ventas_acumuladas=payload.get('ventas_acumuladas', 0.0),
                meta_ventas=payload.get('meta_ventas', 0.0),
                reglas_bonos=payload.get('reglas_bonos', [])
            )
            print(json.dumps(res))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
        return

    print("Uso: python comisiones.py [--test | --calc-item <json> | --eval-bonus <json>]")


if __name__ == '__main__':
    main()
