#!/usr/bin/env python3
"""Servidor local para el Sistema de Gestión y Punto de Venta de Ferretería.

Arquitectura:
- Servidor HTTP con soporte multi-hilo (ThreadingHTTPServer)
- API REST (/api/datos, /api/ping)
- Servidor de archivos estáticos con protección AppSec contra Directory Traversal
- Validación estricta de esquemas JSON y persistencia atómica con rotación de respaldos
- Tipado defensivo y control de errores de nivel de producción

Uso:
    python servidor.py         -> http://localhost:8000
    python servidor.py 8080    -> http://localhost:8080
"""

import json
import os
import sys
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Tuple

CARPETA: str = os.path.dirname(os.path.abspath(__file__))
ARCHIVO: str = os.path.join(CARPETA, "datos.json")
BACKUPS_DIR: str = os.path.join(CARPETA, "backups")
LIMITE_PAYLOAD: int = 25 * 1024 * 1024  # 25 MB
MAX_BACKUPS_ROTACION: int = 20

VACIO: Dict[str, Any] = {
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
        "Materiales de Construcción",
        "Herramientas Manuales",
        "Herramientas Eléctricas",
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


def validar_esquema(datos: Any) -> Tuple[bool, str]:
    """Valida la integridad del esquema de datos antes de permitir la persistencia."""
    if not isinstance(datos, dict):
        return False, "La carga útil debe ser un objeto JSON (dict)"

    if "productos" in datos and not isinstance(datos["productos"], list):
        return False, "El campo 'productos' debe ser una lista"

    if "ventas" in datos and not isinstance(datos["ventas"], list):
        return False, "El campo 'ventas' debe ser una lista"

    if "configuracion" in datos and not isinstance(datos["configuracion"], dict):
        return False, "El campo 'configuracion' debe ser un objeto"

    return True, ""


def crear_backup_automatico() -> None:
    """Crea una copia de seguridad rotativa antes de sobreescribir datos.json."""
    if not os.path.exists(ARCHIVO):
        return

    try:
        os.makedirs(BACKUPS_DIR, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        destino = os.path.join(BACKUPS_DIR, f"backup_{timestamp}.json")

        with open(ARCHIVO, "r", encoding="utf-8") as f_origen:
            contenido = f_origen.read()

        with open(destino, "w", encoding="utf-8") as f_destino:
            f_destino.write(contenido)

        # Rotación: mantener un máximo de MAX_BACKUPS_ROTACION
        archivos = sorted([
            os.path.join(BACKUPS_DIR, f)
            for f in os.listdir(BACKUPS_DIR)
            if f.startswith("backup_") and f.endswith(".json")
        ])
        while len(archivos) > MAX_BACKUPS_ROTACION:
            archivo_viejo = archivos.pop(0)
            try:
                os.remove(archivo_viejo)
            except OSError:
                pass
    except Exception as err:
        print(f"[Aviso] No se pudo generar respaldo rotativo: {err}")


def leer_datos() -> Dict[str, Any]:
    """Carga los datos asegurando estructura completa e inmutable frente a errores."""
    if not os.path.exists(ARCHIVO):
        escribir_datos(VACIO, crear_backup=False)
        return dict(VACIO)
    try:
        with open(ARCHIVO, "r", encoding="utf-8") as f:
            datos = json.load(f)
        if not isinstance(datos, dict):
            return dict(VACIO)
        base = dict(VACIO)
        base.update(datos)
        # Asegurar listas mínimas
        for clave in ("productos", "ventas", "clientes", "categorias", "unidades"):
            if clave not in base or not isinstance(base[clave], list):
                base[clave] = list(VACIO[clave])
        return base
    except (ValueError, OSError) as e:
        print(f"[Aviso] Error al leer {ARCHIVO} ({e}). Inicializando esquema base.")
        return dict(VACIO)


def escribir_datos(datos: Dict[str, Any], crear_backup: bool = True) -> None:
    """Escritura atómica segura: escribe a .tmp y reemplaza en una sola operación del SO."""
    if crear_backup:
        crear_backup_automatico()

    temporal = ARCHIVO + ".tmp"
    with open(temporal, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)

    # os.replace es atómico en sistemas POSIX y seguro en Windows moderno
    os.replace(temporal, ARCHIVO)


def es_ruta_prohibida(path: str) -> bool:
    """Valida si una ruta de solicitud HTTP viola las políticas AppSec (OWASP).
    Bloquea archivos ocultos (.git, .env), directorios traversal (..), y extensiones temporales/compiladas.
    """
    normalizada = path.replace("\\", "/").strip()
    partes = [p for p in normalizada.split("/") if p]
    tiene_oculto = any(p.startswith(".") for p in partes)
    return (
        tiene_oculto
        or normalizada.endswith(".pyc")
        or normalizada.endswith(".tmp")
        or ".." in normalizada
    )


class ManejadorFerreteria(SimpleHTTPRequestHandler):
    """Manejador HTTP empresarial con cabeceras de seguridad y control de acceso a archivos."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=CARPETA, **kwargs)

    def log_message(self, formato: str, *args: Any) -> None:
        # Registro limpio con timestamp ISO
        if "/api/datos" in self.path and self.command == "POST":
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            print(f"[{timestamp}] Base de datos actualizada con éxito (POST /api/datos)")

    def responder_json(self, codigo: int, cuerpo: Any) -> None:
        crudo = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(crudo)))
        # Cabeceras de seguridad y control de caché
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()
        self.wfile.write(crudo)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        ruta = self.path.split("?")[0].rstrip("/")

        if ruta in ("/api/datos", "api/datos"):
            self.responder_json(200, leer_datos())
            return

        if ruta in ("/api/ping", "api/ping"):
            datos = leer_datos()
            self.responder_json(200, {
                "ok": True,
                "servidor": "Ferretería POS PRO",
                "productos": len(datos.get("productos", [])),
                "ventas": len(datos.get("ventas", []))
            })
            return

        # AppSec: Bloquear acceso a archivos sensibles u ocultos (.git, .env, *.pyc, *.tmp)
        ruta_archivo = self.translate_path(self.path)
        nombre_base = os.path.basename(ruta_archivo)
        if (
            es_ruta_prohibida(self.path)
            or es_ruta_prohibida(ruta_archivo)
            or nombre_base.startswith(".")
            or ruta_archivo.endswith(".pyc")
            or ruta_archivo.endswith(".tmp")
        ):
            self.send_error(403, "Acceso restringido por política de seguridad")
            return

        super().do_GET()

    def do_POST(self) -> None:
        ruta = self.path.split("?")[0].rstrip("/")
        if ruta not in ("/api/datos", "api/datos"):
            self.send_error(404, "Endpoint no encontrado")
            return

        try:
            largo = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            largo = 0

        if largo <= 0 or largo > LIMITE_PAYLOAD:
            self.responder_json(400, {"ok": False, "error": "Tamaño de solicitud inválido o excede el límite"})
            return

        try:
            datos_raw = self.rfile.read(largo).decode("utf-8")
            datos = json.loads(datos_raw)
        except (ValueError, UnicodeDecodeError) as e:
            self.responder_json(400, {"ok": False, "error": f"JSON no válido: {e}"})
            return

        es_valido, mensaje_error = validar_esquema(datos)
        if not es_valido:
            self.responder_json(400, {"ok": False, "error": mensaje_error})
            return

        try:
            escribir_datos(datos, crear_backup=True)
        except OSError as error:
            self.responder_json(500, {"ok": False, "error": f"Error de disco: {error}"})
            return

        self.responder_json(200, {"ok": True, "mensaje": "Datos sincronizados correctamente"})


def main() -> None:
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

    datos_actuales = leer_datos()
    total_prod = len(datos_actuales.get("productos", []))
    total_ventas = len(datos_actuales.get("ventas", []))

    print("\n" + "=" * 70)
    print("  🔨 SISTEMA EMPRESARIAL DE GESTIÓN Y POS - FERRETERÍA")
    print(f"  🌐 Navegador:               {direccion}")
    print(f"  📁 Base de datos local:     {ARCHIVO}")
    print(f"  💾 Directorio de respaldos: {BACKUPS_DIR}")
    print(f"  📦 Catálogo activo:         {total_prod} productos")
    print(f"  💰 Ventas registradas:      {total_ventas} transacciones")
    print("  ⚡ Cada venta descuenta stock de forma atómica e inmediata")
    print("  💡 Presiona Ctrl+C en esta consola para detener el servidor")
    print("=" * 70 + "\n")

    try:
        webbrowser.open(direccion)
    except Exception:
        pass

    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Servidor detenido de manera segura.")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
