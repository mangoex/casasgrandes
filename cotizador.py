import sys

PRODUCTS = {
    "1": {
        "name": "Hipopótamo Acceleron",
        "type": "seed_discount",
        "list_price": 6210.00,
        "base_usd": 62.10,
        "descuento_val": 0.0
    },
    "2": {
        "name": "Rinoceronte Acceleron",
        "type": "seed_discount",
        "list_price": 5300.00,
        "base_usd": 53.00,
        "descuento_val": 0.0
    },
    "3": {
        "name": "Armadillo Acceleron",
        "type": "seed_discount",
        "list_price": 5235.00,
        "base_usd": 52.35,
        "descuento_val": 0.0
    },
    "4": {
        "name": "Armadillo Poncho",
        "type": "seed_discount",
        "list_price": 4925.00,
        "base_usd": 49.25,
        "descuento_val": 0.0
    },
    "5": {
        "name": "A-7573 Acceleron",
        "type": "seed_no_discount",
        "list_price": 3467.00,
        "base_usd": 0.0,
        "descuento_val": 0.0
    },
    "6": {
        "name": "A-7573 Poncho",
        "type": "seed_no_discount",
        "list_price": 3208.00,
        "base_usd": 0.0,
        "descuento_val": 0.0
    },
    "7": {
        "name": "Vitala",
        "type": "seed_no_discount",
        "list_price": 8950.00,
        "base_usd": 0.0,
        "descuento_val": 0.0
    },
    "8": {
        "name": "Faena Clásica 1L",
        "type": "chemical",
        "list_price": 219.00,
        "base_usd": 0.0,
        "descuento_val": 3.0
    },
    "9": {
        "name": "Faena Fuerte 1L",
        "type": "chemical",
        "list_price": 260.00,
        "base_usd": 0.0,
        "descuento_val": 3.0
    },
    "10": {
        "name": "Faena Fuerte Garrafa 10L",
        "type": "chemical",
        "list_price": 245.00,
        "base_usd": 0.0,
        "descuento_val": 3.0
    },
    "11": {
        "name": "Provivi (Bolsa 2.5 Hectáreas)",
        "type": "chemical",
        "list_price": 2190.00,
        "base_usd": 0.0,
        "descuento_val": 90.0
    },
    "12": {
        "name": "Clavis",
        "type": "chemical",
        "list_price": 897.19,
        "base_usd": 0.0,
        "descuento_val": 0.0
    },
    "13": {
        "name": "Action Buffer (Coadyuvante)",
        "type": "chemical",
        "list_price": 145.00,
        "base_usd": 0.0,
        "descuento_val": 0.0
    },
    "14": {
        "name": "Surfacid",
        "type": "chemical",
        "list_price": 154.00,
        "base_usd": 0.0,
        "descuento_val": 0.0
    },
    "15": {
        "name": "Muralla Max 500 ml.",
        "type": "chemical",
        "list_price": 636.00,
        "base_usd": 0.0,
        "descuento_val": 0.0
    },
    "16": {
        "name": "Lider 100 ml.",
        "type": "chemical",
        "list_price": 131.00,
        "base_usd": 0.0,
        "descuento_val": 0.0
    },
    "17": {
        "name": "Bayfolan Forte Solido 1 Kg.",
        "type": "chemical",
        "list_price": 126.00,
        "base_usd": 0.0,
        "descuento_val": 0.0
    },
    "18": {
        "name": "Bayfolan Forte Garrafa 4 Lt.",
        "type": "chemical",
        "list_price": 95.00,
        "base_usd": 0.0,
        "descuento_val": 0.0
    },
    "19": {
        "name": "Agrosuelo Garrafa 18 Lt.",
        "type": "chemical",
        "list_price": 1818.00,
        "base_usd": 0.0,
        "descuento_val": 0.0
    }
}

SEASONS = {
    "1": {"name": "Precio JUL-SEP15", "discount": 12.0, "action": "Restar"},
    "2": {"name": "Apartado", "discount": 9.0, "action": "Restar"},
    "3": {"name": "Precio 16 SEP-OCT", "discount": 7.0, "action": "Restar"},
    "4": {"name": "Precio NOV-DIC", "discount": 4.0, "action": "Restar"},
    "5": {"name": "Precio PV ENE-FEB", "discount": 11.0, "action": "Restar"},
    "6": {"name": "Precio PV hasta 16 MZO", "discount": 7.0, "action": "Restar"},
    "7": {"name": "Precio PV 17 al 31 MZO", "discount": 4.0, "action": "Restar"},
    "8": {"name": "Precio Cosecha", "discount": 8.0, "action": "Sumar"},
    "9": {"name": "Temporada (Precio Lleno)", "discount": 0.0, "action": "Sumar"}
}

CLIENT_TIERS = {
    "1": {"name": "Ninguno / General", "discount": 0.0},
    "2": {"name": "Adquirir", "discount": 40.0},
    "3": {"name": "Desarrollar", "discount": 60.0},
    "4": {"name": "Retener", "discount": 95.0},
    "5": {"name": "Retener GOLD", "discount": 115.0}
}

def get_volume_multiplier(qty):
    if qty < 40:
        return 1.00
    elif qty < 60:
        return 0.95
    elif qty < 80:
        return 0.90
    elif qty < 90:
        return 0.85
    else:
        return 0.80

def calculate_prices(product_key, quantity, season_key, client_key):
    prod = PRODUCTS[product_key]
    season = SEASONS[season_key]
    client = CLIENT_TIERS[client_key]
    
    list_price = prod["list_price"]
    
    if prod["type"] == "chemical":
        season_price = list_price
    else:
        discount = season["discount"]
        if season["action"] == "Restar":
            season_price = list_price * (1 - discount / 100.0)
        else:
            season_price = list_price * (1 + discount / 100.0)
            
    if prod["type"] == "seed_discount":
        base_usd = prod["base_usd"]
        vol_multiplier = get_volume_multiplier(quantity)
        usd_price_for_tier = round(base_usd * vol_multiplier, 2)
        exchange_rate = 18.70
        mxn_volume_price = round(usd_price_for_tier * 4.00 * exchange_rate)
        net_price = mxn_volume_price - client["discount"]
    elif prod["type"] == "seed_no_discount":
        net_price = max(round(season_price) - client["discount"], 0)
    else:
        net_price = max(season_price - prod["descuento_val"], 0)
        
    total_price = net_price * quantity
    
    return {
        "product_name": prod["name"],
        "list_price": list_price,
        "season_price": season_price,
        "net_price": net_price,
        "total_price": total_price,
        "type": prod["type"],
        "vol_tier": f"{int(round((1 - get_volume_multiplier(quantity))*100))}% discount" if prod["type"] == "seed_discount" else "N/A"
    }

def main():
    print("=" * 60)
    print("      CALCULADORA DE COTIZACIONES - CASAS GRANDES")
    print("=" * 60)
    
    print("\nProductos Disponibles:")
    for k, v in PRODUCTS.items():
        print(f"  [{k}] {v['name']} (Precio Lista: ${v['list_price']:,.2f} MXN)")
        
    product_choice = input("\nSeleccione el número de producto: ").strip()
    if product_choice not in PRODUCTS:
        print("Opción inválida.")
        return
        
    try:
        qty = int(input("Ingrese la cantidad (bolsas o piezas): ").strip())
        if qty <= 0:
            print("La cantidad debe ser mayor que 0.")
            return
    except ValueError:
        print("Cantidad inválida.")
        return
        
    prod = PRODUCTS[product_choice]
    if prod["type"] != "chemical":
        print("\nTemporadas Disponibles:")
        for k, v in SEASONS.items():
            sign = "-" if v["action"] == "Restar" else "+"
            print(f"  [{k}] {v['name']} ({sign}{v['discount']}%)")
        season_choice = input("\nSeleccione el número de temporada: ").strip()
        if season_choice not in SEASONS:
            print("Opción inválida.")
            return
    else:
        season_choice = "9"
        
    if prod["type"] == "seed_discount":
        print("\nNiveles de Cuenta Clave:")
        for k, v in CLIENT_TIERS.items():
            print(f"  [{k}] {v['name']} (-${v['discount']:.2f} MXN por bolsa)")
        client_choice = input("\nSeleccione el nivel del cliente: ").strip()
        if client_choice not in CLIENT_TIERS:
            print("Opción inválida.")
            return
    else:
        client_choice = "1"
        
    res = calculate_prices(product_choice, qty, season_choice, client_choice)
    
    print("\n" + "=" * 60)
    print("                    RESUMEN DE COTIZACIÓN")
    print("=" * 60)
    print(f"  Producto:            {res['product_name']}")
    print(f"  Cantidad:            {qty} unidades")
    print(f"  Precio de Lista:     ${res['list_price']:,.2f} MXN")
    
    if res["type"] != "chemical":
        season_name = SEASONS[season_choice]["name"]
        season_desc = SEASONS[season_choice]["discount"]
        season_act = SEASONS[season_choice]["action"]
        sign = "-" if season_act == "Restar" else "+"
        print(f"  Temporada:           {season_name} ({sign}{season_desc}%)")
        print(f"  Precio de Temporada: ${res['season_price']:,.2f} MXN")
        
    if res["type"] == "seed_discount":
        client_name = CLIENT_TIERS[client_choice]["name"]
        client_desc = CLIENT_TIERS[client_choice]["discount"]
        print(f"  Cuenta Clave:        {client_name} (-${client_desc:,.2f} MXN/bolsa)")
        print(f"  Descuento Volumen:   {res['vol_tier']}")
        
    print(f"  Precio Neto Unitario: ${res['net_price']:,.2f} MXN")
    print("-" * 60)
    print(f"  COSTO TOTAL COTIZADO: ${res['total_price']:,.2f} MXN")
    print("=" * 60)

if __name__ == "__main__":
    main()
