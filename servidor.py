#!/usr/bin/env python3
"""Servidor local para el Sistema de Gestión y Punto de Venta de Ferretería.

Permite ejecutar el sistema localmente, guardando automáticamente los datos
en datos.json (productos, inventario, ventas, clientes y configuración).

Uso:
    python servidor.py         -> http://localhost:8000
    python servidor.py 8080    -> http://localhost:8080
"""

import json
import os
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

CARPETA = os.path.dirname(os.path.abspath(__file__))
ARCHIVO = os.path.join(CARPETA, "datos.json")
LIMITE = 25 * 1024 * 1024  # 25 MB

VACIO = {
    "configuracion": {
        "empresa": "Ferretería Sullcairi",
        "ruc": "",
        "direccion": "",
        "telefono": "",
        "moneda": "S/",
        "igv": 18,
        "aplicarIgv": False,
        "pieTicket": "¡Gracias por su compra! Vuelva pronto."
    },
    "categorias": [
        "Herramientas Manuales",
        "Herramientas Eléctricas",
        "Materiales de Construcción",
        "Gasfitería y Tuberías",
        "Electricidad e Iluminación",
        "Pinturas y Adhesivos",
        "Tornillería y Fijaciones",
        "Cerrajería y Candados",
        "Seguridad Industrial (EPP)",
        "Otros"
    ],
    "unidades": [
        "Unidad",
        "Bolsa",
        "Kg",
        "Metro",
        "Galón",
        "Caja",
        "Rollo",
        "Paquete",
        "Plancha",
        "Litro",
        "Par"
    ],
    "productos": [],
    "ventas": [],
    "clientes": []
}


def leer_datos():
    if not os.path.exists(ARCHIVO):
        escribir_datos(VACIO)
        return dict(VACIO)
    try:
        with open(ARCHIVO, "r", encoding="utf-8") as f:
            datos = json.load(f)
        if not isinstance(datos, dict):
            return dict(VACIO)
        # Combinar estructura base con datos leídos
        base = dict(VACIO)
        base.update(datos)
        return base
    except (ValueError, OSError) as e:
        print(f"Aviso al leer datos.json ({e}). Se inicializa estructura base.")
        return dict(VACIO)


def escribir_datos(datos):
    """Graba en un archivo temporal y luego reemplaza de forma atómica para máxima seguridad."""
    temporal = ARCHIVO + ".tmp"
    with open(temporal, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    os.replace(temporal, ARCHIVO)


class ManejadorFerreteria(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=CARPETA, **kwargs)

    def log_message(self, formato, *args):
        # Log silencioso o conciso
        if "/api/datos" in self.path and self.command == "POST":
            print(f"[{self.log_date_time_string()}] Datos actualizados correctamente en datos.json")

    def responder_json(self, codigo, cuerpo):
        crudo = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(crudo)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(crudo)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        ruta = self.path.split("?")[0].rstrip("/")
        if ruta in ("/api/datos", "api/datos"):
            self.responder_json(200, leer_datos())
            return
        if ruta in ("/api/ping", "api/ping"):
            self.responder_json(200, {"ok": True, "servidor": "Ferretería POS"})
            return
        super().do_GET()

    def do_POST(self):
        ruta = self.path.split("?")[0].rstrip("/")
        if ruta not in ("/api/datos", "api/datos"):
            self.send_error(404, "Endpoint no encontrado")
            return
        try:
            largo = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            largo = 0

        if largo <= 0 or largo > LIMITE:
            self.responder_json(400, {"ok": False, "error": "Tamaño de datos inválido"})
            return

        try:
            datos = json.loads(self.rfile.read(largo).decode("utf-8"))
            if not isinstance(datos, dict):
                raise ValueError("Se esperaba un objeto JSON")
        except (ValueError, UnicodeDecodeError) as e:
            self.responder_json(400, {"ok": False, "error": f"JSON inválido: {e}"})
            return

        try:
            escribir_datos(datos)
        except OSError as error:
            self.responder_json(500, {"ok": False, "error": str(error)})
            return

        self.responder_json(200, {"ok": True, "mensaje": "Guardado exitosamente"})


def main():
    puerto = 8000
    if len(sys.argv) > 1:
        try:
            puerto = int(sys.argv[1])
        except ValueError:
            print("El puerto debe ser numérico. Ejemplo: python servidor.py 8080")
            return

    direccion = f"http://localhost:{puerto}"
    try:
        servidor = ThreadingHTTPServer(("0.0.0.0", puerto), ManejadorFerreteria)
    except OSError:
        servidor = ThreadingHTTPServer(("127.0.0.1", puerto), ManejadorFerreteria)

    # Verificar datos.json al iniciar
    datos_actuales = leer_datos()
    total_prod = len(datos_actuales.get("productos", []))
    total_ventas = len(datos_actuales.get("ventas", []))

    print("\n" + "=" * 68)
    print("  🔨 SISTEMA DE GESTIÓN Y PUNTO DE VENTA - FERRETERÍA")
    print(f"  🌐 Abrir en el navegador: {direccion}")
    print(f"  📁 Base de datos local:    {ARCHIVO}")
    print(f"  📦 Productos registrados:  {total_prod} (Sin datos demo)")
    print(f"  💰 Ventas registradas:     {total_ventas}")
    print("  ⚡ Cada venta descuenta stock automáticamente y actualiza el resumen")
    print("  💡 Presiona Ctrl+C en esta consola para detener el servidor")
    print("=" * 68 + "\n")

    try:
        webbrowser.open(direccion)
    except Exception:
        pass

    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor cerrado correctamente.")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
