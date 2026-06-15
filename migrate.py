import os
import csv
import sqlite3

db_path = "database.sqlite"
if os.path.exists(db_path):
    os.remove(db_path)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create tables
cursor.execute("""
CREATE TABLE IF NOT EXISTS asesores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    usuario TEXT NOT NULL,
    nivel_rol TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    telefono TEXT,
    cumpleanos TEXT,
    password_hash TEXT NOT NULL,
    activo INTEGER DEFAULT 1,
    calificacion REAL DEFAULT 5.0
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS cuentas_clave (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier_name TEXT UNIQUE NOT NULL,
    descuento_mxn REAL NOT NULL
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL,
    asesor_id INTEGER,
    cuenta_clave_id INTEGER,
    contacto TEXT,
    telefono TEXT,
    correo TEXT,
    cumpleanos TEXT,
    estado_status TEXT DEFAULT 'Nuevo',
    ubicacion TEXT,
    superficie_text TEXT,
    activo INTEGER DEFAULT 1,
    FOREIGN KEY (asesor_id) REFERENCES asesores(id),
    FOREIGN KEY (cuenta_clave_id) REFERENCES cuentas_clave(id)
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto TEXT UNIQUE NOT NULL,
    tipo_categoria TEXT NOT NULL,
    list_price_mxn REAL NOT NULL,
    base_usd REAL DEFAULT 0.0,
    descuento_fijo_quimicos REAL DEFAULT 0.0,
    objetivo_anual INTEGER DEFAULT 0,
    descontar INTEGER DEFAULT 0, -- boolean
    activo INTEGER DEFAULT 1
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS temporadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actividad TEXT UNIQUE NOT NULL,
    fecha_inicio TEXT,
    fecha_fin TEXT,
    descuento_porcentaje REAL NOT NULL,
    estado_operacion TEXT NOT NULL,
    notas TEXT
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS cotizaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_creacion TEXT NOT NULL,
    cliente_id INTEGER NOT NULL,
    asesor_id INTEGER NOT NULL,
    ciclo_agricola TEXT NOT NULL,
    condiciones_pago TEXT NOT NULL,
    folio_cotizacion TEXT UNIQUE NOT NULL,
    mes TEXT,
    estatus TEXT NOT NULL DEFAULT 'Borrador',
    total_mxn REAL DEFAULT 0.0,
    anticipo_apartado REAL DEFAULT 0.0,
    notas TEXT,
    autorizado_por_id INTEGER,
    financiera TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (asesor_id) REFERENCES asesores(id),
    FOREIGN KEY (autorizado_por_id) REFERENCES asesores(id)
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS cotizacion_detalles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cotizacion_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    temporada_id INTEGER,
    cantidad_ordenada INTEGER NOT NULL,
    cantidad_entregada INTEGER DEFAULT 0,
    precio_lista_unitario REAL NOT NULL,
    precio_neto_unitario REAL NOT NULL,
    subtotal_mxn REAL NOT NULL,
    FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (temporada_id) REFERENCES temporadas(id)
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS almacen_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_movimiento TEXT NOT NULL,
    tipo_movimiento TEXT NOT NULL,
    producto_id INTEGER NOT NULL,
    cantidad_entrante REAL DEFAULT 0.0,
    cantidad_saliente REAL DEFAULT 0.0,
    existencias_resultantes REAL NOT NULL,
    cotizacion_id INTEGER,
    asesor_id INTEGER,
    referencia_factura TEXT,
    notas TEXT,
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id),
    FOREIGN KEY (asesor_id) REFERENCES asesores(id)
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS crm_visitas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_visita TEXT NOT NULL,
    cliente_id INTEGER NOT NULL,
    asesor_id INTEGER NOT NULL,
    comentarios_bitacora TEXT,
    proxima_cita TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (asesor_id) REFERENCES asesores(id)
)
""")

conn.commit()

# Default bcrypt hash for 'password123'
default_password_hash = "$2b$10$Ly0wcxrAZmfzIOSLPRzwdO3YxJQ2dPT6osFpn0j0hlAT9uK7ojTKm"

# 1. Populate Cuentas Clave
cursor.execute("INSERT INTO cuentas_clave (tier_name, descuento_mxn) VALUES ('Ninguno / General', 0.0)")
with open("Cuenta clave.csv", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader) # skip header
    for row in reader:
        if len(row) >= 2:
            tier = row[0].strip()
            desc = float(row[1].strip())
            cursor.execute("INSERT OR IGNORE INTO cuentas_clave (tier_name, descuento_mxn) VALUES (?, ?)", (tier, desc))
conn.commit()

# 2. Populate Asesores
with open("Asesores.csv", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)
    for row in reader:
        if len(row) >= 5:
            nombre = row[0].strip()
            usuario = row[1].strip()
            nivel = row[2].strip()
            telefono = row[3].strip()
            email = row[4].strip()
            cumpleanos = row[5].strip() if len(row) > 5 else ""
            cursor.execute("""
            INSERT OR IGNORE INTO asesores (nombre, usuario, nivel_rol, email, telefono, cumpleanos, password_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (nombre, usuario, nivel, email, telefono, cumpleanos, default_password_hash))
conn.commit()

# 3. Populate Temporadas
# Add a default season (Precio Lleno)
cursor.execute("INSERT INTO temporadas (actividad, descuento_porcentaje, estado_operacion) VALUES ('Temporada (Precio Lleno)', 0.0, 'Sumar')")
with open("Temporadas.csv", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)
    for row in reader:
        if len(row) >= 6:
            actividad = row[0].strip()
            # Parse dates
            inicio = row[1].strip()
            fin = row[2].strip()
            desc = float(row[3].strip()) if row[3].strip() else 0.0
            notas = row[4].strip()
            estado = row[5].strip()
            cursor.execute("""
            INSERT OR IGNORE INTO temporadas (actividad, fecha_inicio, fecha_fin, descuento_porcentaje, estado_operacion, notas)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (actividad, inicio, fin, desc, estado, notas))
conn.commit()

# 4. Populate Productos (Consolidating Producto.csv and Productos.csv)
# We will use dictionary to merge them
products_dict = {}

# Read Producto.csv (seeds and chemicals)
with open("Producto.csv", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)
    for row in reader:
        if len(row) >= 10:
            nombre = row[0].strip().replace("\n", " ").replace("\r", "")
            tipo = row[1].strip()
            list_price_str = row[2].strip().replace("$", "").replace(",", "")
            list_price = float(list_price_str) if list_price_str else 0.0
            
            # Map type to categories
            cat = "Híbrido" if tipo == "Híbrido" else "Agroquímico"
            
            descontar = 1 if (row[3].strip().lower() == "true" or nombre.startswith("Hipopótamo")) else 0
            
            flat_desc_str = row[5].strip().replace("$", "").replace(",", "") if len(row) > 5 else ""
            flat_desc = float(flat_desc_str) if flat_desc_str else 0.0
            
            obj_str = row[6].strip() if len(row) > 6 else ""
            obj = int(obj_str) if obj_str else 0
            
            base_usd = 0.0
            if descontar == 1:
                # seeds Asgrow: base_usd is base list price divided by 100
                base_usd = round(list_price / 100.0, 2)
                
            products_dict[nombre] = {
                "producto": nombre,
                "tipo_categoria": cat,
                "list_price_mxn": list_price,
                "base_usd": base_usd,
                "descuento_fijo_quimicos": flat_desc,
                "objetivo_anual": obj,
                "descontar": descontar
            }

# Read Productos.csv (fertilizers and others)
with open("Productos.csv", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)
    for row in reader:
        if len(row) >= 4:
            prov = row[0].strip()
            nombre = row[1].strip().replace("\n", " ").replace("\r", "")
            unidad = row[2].strip()
            cost_str = row[3].strip().replace("$", "").replace(",", "")
            cost = float(cost_str) if cost_str else 0.0
            
            if nombre not in products_dict and nombre:
                products_dict[nombre] = {
                    "producto": nombre,
                    "tipo_categoria": "Fertilizante",
                    "list_price_mxn": cost,
                    "base_usd": 0.0,
                    "descuento_fijo_quimicos": 0.0,
                    "objetivo_anual": 0,
                    "descontar": 0
                }

# Insert products
for prod_data in products_dict.values():
    cursor.execute("""
    INSERT OR IGNORE INTO productos (producto, tipo_categoria, list_price_mxn, base_usd, descuento_fijo_quimicos, objetivo_anual, descontar)
    VALUES (:producto, :tipo_categoria, :list_price_mxn, :base_usd, :descuento_fijo_quimicos, :objetivo_anual, :descontar)
    """, prod_data)
conn.commit()

# Helper dicts for quick lookup in step 5 and 6
asesores_lookup = {}
cursor.execute("SELECT id, nombre FROM asesores")
for r in cursor.fetchall():
    asesores_lookup[r[1].lower()] = r[0]
# Homologate adviser names (nicknames / full names)
asesores_homologation = {
    "juan": asesores_lookup.get("juan francisco lopez valdez"),
    "bon": asesores_lookup.get("osvaldo bon lópez"),
    "christian": asesores_lookup.get("christian alcantar nieblas"),
    "eduardo": asesores_lookup.get("eduardo leyva"),
    "casa": asesores_lookup.get("casas grandes"),
    "sigala": asesores_lookup.get("casa (jose sigala)"),
    "jiova": asesores_lookup.get("jiovani lópez"),
    "wil": asesores_lookup.get("wilfredo carrasco flores")
}

def resolve_asesor_id(name_str):
    if not name_str:
        return asesores_lookup.get("casas grandes")
    name_lower = name_str.lower().strip()
    if name_lower in asesores_lookup:
        return asesores_lookup[name_lower]
    # Check parts or abbreviations
    for k, v in asesores_homologation.items():
        if k in name_lower:
            return v
    # Try fuzzy match in dict
    for k, v in asesores_lookup.items():
        if name_lower in k or k in name_lower:
            return v
    return asesores_lookup.get("casas grandes")

cuenta_clave_lookup = {}
cursor.execute("SELECT id, tier_name FROM cuentas_clave")
for r in cursor.fetchall():
    cuenta_clave_lookup[r[1].lower()] = r[0]

def resolve_cuenta_clave_id(tier_str):
    if not tier_str:
        return cuenta_clave_lookup.get("ninguno / general")
    tier_lower = tier_str.lower().strip()
    if tier_lower in cuenta_clave_lookup:
        return cuenta_clave_lookup[tier_lower]
    # Match fuzzy
    for k, v in cuenta_clave_lookup.items():
        if tier_lower in k:
            return v
    return cuenta_clave_lookup.get("ninguno / general")

# 5. Populate Clientes (Agricultores)
with open("Agricultores.csv", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)
    for row in reader:
        if len(row) >= 1:
            nombre = row[0].strip()
            if not nombre:
                continue
            asesor_str = row[1].strip() if len(row) > 1 else ""
            cc_str = row[2].strip() if len(row) > 2 else ""
            clave = row[3].strip() if len(row) > 3 else ""
            contacto = row[4].strip() if len(row) > 4 else ""
            telefono = row[5].strip() if len(row) > 5 else ""
            correo = row[6].strip() if len(row) > 6 else ""
            cumpleanos = row[7].strip() if len(row) > 7 else ""
            estado = row[8].strip() if len(row) > 8 else "Cliente"
            ubicacion = row[9].strip() if len(row) > 9 else ""
            superficie = row[10].strip() if len(row) > 10 else ""
            
            asesor_id = resolve_asesor_id(asesor_str)
            cc_id = resolve_cuenta_clave_id(cc_str)
            
            cursor.execute("""
            INSERT OR REPLACE INTO clientes (nombre, asesor_id, cuenta_clave_id, contacto, telefono, correo, cumpleanos, estado_status, ubicacion, superficie_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (nombre, asesor_id, cc_id, contacto, telefono, correo, cumpleanos, estado, ubicacion, superficie))
conn.commit()

# Helper dicts for transactions
clientes_lookup = {}
cursor.execute("SELECT id, nombre FROM clientes")
for r in cursor.fetchall():
    clientes_lookup[r[1].lower()] = r[0]

def resolve_cliente_id(name_str):
    if not name_str:
        return None
    name_lower = name_str.lower().strip()
    if name_lower in clientes_lookup:
        return clientes_lookup[name_lower]
    # Fuzzy match
    for k, v in clientes_lookup.items():
        if name_lower in k or k in name_lower:
            return v
    return None

productos_lookup = {}
cursor.execute("SELECT id, producto FROM productos")
for r in cursor.fetchall():
    productos_lookup[r[1].lower()] = r[0]

def resolve_producto_id(prod_str):
    if not prod_str:
        return None
    prod_lower = prod_str.lower().strip()
    # Direct match
    if prod_lower in productos_lookup:
        return productos_lookup[prod_lower]
    # Homologation mapping for seeds or shortnames in control.csv
    homol = {
        "hipopotamo acc": "hipopótamo acceleron",
        "rinoceronte acc": "rinoceronte acceleron",
        "armadillo acc": "armadillo acceleron",
        "armadillo p": "armadillo poncho",
        "a7573 p": "a-7573 poncho",
        "delfin acc": "delfin",
        "faena fuerte 1l": "faena fuerte 1l",
        "faena clásica 1l": "faena clásica 1l",
        "urea": "urea",
        "amoniaco": "amoniaco",
        "sulfato de amonio": "sulfato de amonio",
        "map (11-52-00)": "map (11-52-00)",
        "triple 16": "triple 16",
        "uan-32": "uan-32"
    }
    for k, v in homol.items():
        if k in prod_lower:
            return productos_lookup.get(v)
    # Fuzzy
    for k, v in productos_lookup.items():
        if prod_lower in k or k in prod_lower:
            return v
    return None

temporadas_lookup = {}
cursor.execute("SELECT id, actividad FROM temporadas")
for r in cursor.fetchall():
    temporadas_lookup[r[1].lower()] = r[0]

def resolve_temporada_id(temp_str):
    if not temp_str:
        return temporadas_lookup.get("temporada (precio lleno)")
    temp_lower = temp_str.lower().strip()
    # Match short Month names to seasons
    months_map = {
        "jul": "precio jul-sep15",
        "sep": "precio 16 sep-oct",
        "oct": "precio 16 sep-oct",
        "nov": "precio nov-dic",
        "dic": "precio nov-dic",
        "ene": "precio pv ene-feb",
        "feb": "precio pv ene-feb",
        "mzo": "precio pv hasta 16 mzo"
    }
    for k, v in months_map.items():
        if k in temp_lower:
            return temporadas_lookup.get(v)
    for k, v in temporadas_lookup.items():
        if temp_lower in k:
            return v
    return temporadas_lookup.get("temporada (precio lleno)")

# 6. Populate Cotizaciones & Detalles (Control.csv)
# We will read Control.csv and group items by Folio/Receipt ID
quotes_cache = {}

def safe_float(val_str, default=0.0):
    if not val_str:
        return default
    val_clean = val_str.replace("$", "").replace(",", "").replace(" ", "").strip()
    if not val_clean or val_clean in ["-", "$-", "$-   "]:
        return default
    try:
        return float(val_clean)
    except ValueError:
        return default

with open("Control.csv", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)
    for row_idx, row in enumerate(reader):
        if len(row) < 20 or not row[0].strip():
            continue
        fecha = row[0].strip()
        cliente_str = row[1].strip()
        ciclo = row[3].strip()
        asesor_str = row[4].strip()
        cond_pago = row[5].strip()
        folio = row[6].strip()
        mes = row[7].strip()
        prod_str = row[8].strip()
        
        qty_ord = int(row[9].strip()) if row[9].strip() else 0
        qty_ent = int(row[10].strip()) if row[10].strip() else 0
        
        price_unit = safe_float(row[12])
        price_list = safe_float(row[14], default=price_unit)
        price_net = safe_float(row[17], default=price_unit)
        total = safe_float(row[18], default=(qty_ord * price_net))
        
        status = row[19].strip()
        
        anticipo = safe_float(row[20]) if len(row) > 20 else 0.0
        
        finan = row[32].strip() if len(row) > 32 else ""
        notes = row[29].strip() if len(row) > 29 else ""
        auth_by_str = row[30].strip() if len(row) > 30 else ""
        
        # Keys mapping
        cliente_id = resolve_cliente_id(cliente_str)
        if not cliente_id:
            # If client not found, we create a public client or force insert
            cursor.execute("INSERT OR IGNORE INTO clientes (nombre, estado_status) VALUES (?, 'Cliente')", (cliente_str, ))
            conn.commit()
            cliente_id = resolve_cliente_id(cliente_str)
            
        asesor_id = resolve_asesor_id(asesor_str)
        prod_id = resolve_producto_id(prod_str)
        temp_id = resolve_temporada_id(mes)
        auth_id = resolve_asesor_id(auth_by_str) if auth_by_str else None
        
        if not prod_id:
            # Skip if product doesn't exist
            continue
            
        # Determine unique key for quote: folio. If empty, generate a dummy folio
        if not folio:
            folio = f"TEMP-F-{row_idx}"
            
        if folio not in quotes_cache:
            quotes_cache[folio] = {
                "fecha_creacion": fecha,
                "cliente_id": cliente_id,
                "asesor_id": asesor_id,
                "ciclo_agricola": ciclo,
                "condiciones_pago": cond_pago,
                "folio_cotizacion": folio,
                "mes": mes,
                "estatus": "Vendido" if status in ["CONTADO", "CREDITO", "PAGADO"] else "Borrador",
                "total_mxn": 0.0,
                "anticipo_apartado": 0.0,
                "notas": notes,
                "autorizado_por_id": auth_id,
                "financiera": finan,
                "items": []
            }
            
        quotes_cache[folio]["total_mxn"] += total
        quotes_cache[folio]["anticipo_apartado"] += anticipo * qty_ord
        if notes and notes not in quotes_cache[folio]["notas"]:
            quotes_cache[folio]["notas"] += " | " + notes
            
        quotes_cache[folio]["items"].append({
            "producto_id": prod_id,
            "temporada_id": temp_id,
            "cantidad_ordenada": qty_ord,
            "cantidad_entregada": qty_ent,
            "precio_lista_unitario": price_list,
            "precio_neto_unitario": price_net,
            "subtotal_mxn": total
        })

# Insert grouped quotes and details
for q in quotes_cache.values():
    cursor.execute("""
    INSERT OR IGNORE INTO cotizaciones (fecha_creacion, cliente_id, asesor_id, ciclo_agricola, condiciones_pago, folio_cotizacion, mes, estatus, total_mxn, anticipo_apartado, notas, autorizado_por_id, financiera)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (q["fecha_creacion"], q["cliente_id"], q["asesor_id"], q["ciclo_agricola"], q["condiciones_pago"], q["folio_cotizacion"], q["mes"], q["estatus"], q["total_mxn"], q["anticipo_apartado"], q["notas"], q["autorizado_por_id"], q["financiera"]))
    
    cot_id = cursor.lastrowid
    
    for item in q["items"]:
        cursor.execute("""
        INSERT INTO cotizacion_detalles (cotizacion_id, producto_id, temporada_id, cantidad_ordenada, cantidad_entregada, precio_lista_unitario, precio_neto_unitario, subtotal_mxn)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (cot_id, item["producto_id"], item["temporada_id"], item["cantidad_ordenada"], item["cantidad_entregada"], item["precio_lista_unitario"], item["precio_neto_unitario"], item["subtotal_mxn"]))
conn.commit()

# Helper mapping for cotizaciones folios to DB IDs
cot_folio_to_id = {}
cursor.execute("SELECT id, folio_cotizacion FROM cotizaciones")
for r in cursor.fetchall():
    cot_folio_to_id[r[1]] = r[0]

# 7. Populate Almacén Movimientos (Almacen.csv)
with open("Almacen.csv", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)
    for row in reader:
        if len(row) < 13:
            continue
        cliente_str = row[0].strip()
        asesor_str = row[1].strip()
        orden_folio = row[3].strip()
        precio_str = row[4].strip().replace("$", "").replace(",", "")
        tipo_venta = row[5].strip()
        prod_str = row[6].strip()
        fecha = row[7].strip()
        
        compras = float(row[8].strip()) if row[8].strip() else 0.0
        entradas = float(row[9].strip()) if row[9].strip() else 0.0
        salidas = float(row[10].strip()) if row[10].strip() else 0.0
        entregadas = float(row[11].strip()) if row[11].strip() else 0.0
        existencias = float(row[12].strip()) if row[12].strip() else 0.0
        
        notas = row[13].strip() if len(row) > 13 else ""
        
        prod_id = resolve_producto_id(prod_str)
        if not prod_id:
            continue
            
        cot_id = cot_folio_to_id.get(orden_folio)
        asesor_id = resolve_asesor_id(asesor_str)
        
        # Mapeo de Tipo de Movimiento
        if tipo_venta.lower() == "compra":
            tipo_mov = "Entrada de Compra"
        elif tipo_venta.lower() == "contado":
            tipo_mov = "Salida por Contado"
        elif tipo_venta.lower() == "crédito":
            tipo_mov = "Salida por Crédito"
        else:
            if compras > 0 or entradas > 0:
                tipo_mov = "Entrada de Compra"
            else:
                tipo_mov = "Salida por Entrega"
                
        cant_ent = max(compras, entradas)
        cant_sal = max(salidas, entregadas)
        
        cursor.execute("""
        INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, cotizacion_id, asesor_id, referencia_factura, notas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (fecha, tipo_mov, prod_id, cant_ent, cant_sal, existencias, cot_id, asesor_id, orden_folio, notas))
conn.commit()

# Print diagnostics
cursor.execute("SELECT count(*) FROM asesores")
print(f"Migrated Asesores: {cursor.fetchone()[0]}")
cursor.execute("SELECT count(*) FROM clientes")
print(f"Migrated Clientes: {cursor.fetchone()[0]}")
cursor.execute("SELECT count(*) FROM productos")
print(f"Migrated Productos: {cursor.fetchone()[0]}")
cursor.execute("SELECT count(*) FROM temporadas")
print(f"Migrated Temporadas: {cursor.fetchone()[0]}")
cursor.execute("SELECT count(*) FROM cotizaciones")
print(f"Migrated Cotizaciones (Headers): {cursor.fetchone()[0]}")
cursor.execute("SELECT count(*) FROM cotizacion_detalles")
print(f"Migrated Cotizacion Detalles (Items): {cursor.fetchone()[0]}")
cursor.execute("SELECT count(*) FROM almacen_movimientos")
print(f"Migrated Almacen Movimientos: {cursor.fetchone()[0]}")

conn.close()
print("Migration completed successfully!")
