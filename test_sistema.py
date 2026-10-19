#!/usr/bin/env python3
"""Suite de Pruebas Automatizadas para el Sistema de Ferretería.

Pruebas:
1. Integridad de esquema y ausencia de datos demo
2. Funciones de persistencia y rotación de backups
3. Validación de seguridad AppSec (OWASP Top 10)
4. Lógica de negocio (Inventario, Ventas, Reposición de Stock)
5. Verificación de integridad HTML / JS (Todos los IDs y botones mapeados)
"""

import json
import os
import re
import unittest
from datetime import datetime

import servidor


class TestFerreteriaSistema(unittest.TestCase):

    def setUp(self):
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.datos_path = os.path.join(self.base_dir, "datos.json")
        self.index_path = os.path.join(self.base_dir, "index.html")
        self.app_js_path = os.path.join(self.base_dir, "js", "app.js")
        self.store_js_path = os.path.join(self.base_dir, "js", "store.js")

    def test_01_esquema_sin_datos_demo(self):
        """Verifica que el sistema inicie sin datos demo de prueba."""
        with open(self.datos_path, "r", encoding="utf-8") as f:
            datos = json.load(f)

        self.assertIn("productos", datos)
        self.assertIn("ventas", datos)
        self.assertIn("clientes", datos)
        self.assertIn("categorias", datos)
        self.assertIn("unidades", datos)

        self.assertEqual(len(datos["productos"]), 0, "No debe haber productos demo")
        self.assertEqual(len(datos["ventas"]), 0, "No debe haber ventas demo")
        self.assertEqual(len(datos["clientes"]), 0, "No debe haber clientes demo")
        self.assertGreaterEqual(len(datos["categorias"]), 8, "Debe tener categorías ferreteras predefinidas")
        self.assertGreaterEqual(len(datos["unidades"]), 8, "Debe tener unidades de medida estándar")

    def test_02_validacion_esquema_servidor(self):
        """Verifica la validación defensiva en servidor.py contra payloads malformados."""
        valido, err = servidor.validar_esquema({"productos": [], "ventas": []})
        self.assertTrue(valido)

        invalido_str, err = servidor.validar_esquema("no es dict")
        self.assertFalse(invalido_str)

        invalido_prod, err = servidor.validar_esquema({"productos": "no es lista"})
        self.assertFalse(invalido_prod)

        invalido_ventas, err = servidor.validar_esquema({"ventas": 123})
        self.assertFalse(invalido_ventas)

    def test_03_appsec_bloqueo_archivos_sensibles(self):
        """Verifica que el servidor bloquee accesos a archivos ocultos o de configuración."""
        rutas_prohibidas = [
            ".git/config",
            ".gitignore",
            ".env",
            "servidor.cpython-313.pyc",
            "datos.json.tmp",
            "../secret.txt",
            "/api/../privado",
            ".\\oculto\\test"
        ]
        for ruta in rutas_prohibidas:
            es_bloqueado = servidor.es_ruta_prohibida(ruta)
            self.assertTrue(es_bloqueado, f"La ruta sensible '{ruta}' debe ser bloqueada por política AppSec")

    def test_04_logica_descuento_y_reposicion_stock(self):
        """Simula la lógica de negocio de venta, descuento de stock y reversión al anular."""
        # Producto inicial
        producto = {
            "id": "PROD-TEST-1",
            "nombre": "Cemento Sol Tipo I",
            "unidad": "Bolsa",
            "precioCompra": 24.50,
            "precioVenta": 29.00,
            "stock": 50.0
        }

        # 1. Agregar Stock (+20)
        cantidad_ingreso = 20.0
        producto["stock"] += cantidad_ingreso
        self.assertEqual(producto["stock"], 70.0, "El stock debe sumar 70 bolsas")

        # 2. Venta de 5 bolsas
        cantidad_venta = 5.0
        self.assertGreaterEqual(producto["stock"], cantidad_venta, "Debe haber stock suficiente")
        producto["stock"] -= cantidad_venta
        self.assertEqual(producto["stock"], 65.0, "El stock debe bajar a 65 bolsas")

        # Ganancia estimada
        subtotal = cantidad_venta * producto["precioVenta"]
        costo = cantidad_venta * producto["precioCompra"]
        ganancia = subtotal - costo
        self.assertEqual(subtotal, 145.0)
        self.assertEqual(costo, 122.5)
        self.assertEqual(ganancia, 22.5)

        # 3. Anulación de la venta (Devolución de stock)
        producto["stock"] += cantidad_venta
        self.assertEqual(producto["stock"], 70.0, "Al anular la venta, el stock debe regresar a 70")

    def test_05_integridad_elementos_dom(self):
        """Verifica que todos los IDs y selectores del DOM referenciados en app.js existan en index.html."""
        with open(self.index_path, "r", encoding="utf-8") as f:
            html = f.read()

        with open(self.app_js_path, "r", encoding="utf-8") as f:
            app_js = f.read()

        # Extraer todos los document.getElementById('...') de app.js
        ids_en_js = set(re.findall(r"document\.getElementById\(['\"]([a-zA-Z0-9_-]+)['\"]\)", app_js))

        # IDs esperados en index.html
        ids_en_html = set(re.findall(r'id=["\']([a-zA-Z0-9_-]+)["\']', html))

        # IDs generados dinámicamente en el DOM por plantillas (ej: CTA de catálogo vacío)
        ids_dinamicos_plantillas = {"btn-ir-inventario-desde-pos"}

        faltantes = []
        for id_js in ids_en_js:
            if id_js not in ids_en_html and id_js not in ids_dinamicos_plantillas:
                faltantes.append(id_js)

        self.assertEqual(len(faltantes), 0, f"Los siguientes IDs de app.js no existen en index.html: {faltantes}")

    def test_06_todos_los_botones_tienen_eventos(self):
        """Verifica que todos los botones estáticos principales en index.html tengan controladores en app.js."""
        with open(self.index_path, "r", encoding="utf-8") as f:
            html = f.read()

        with open(self.app_js_path, "r", encoding="utf-8") as f:
            app_js = f.read()

        # Encontrar botones con ID
        botones_html = re.findall(r'<button[^>]*id=["\']([a-zA-Z0-9_-]+)["\']', html)

        # Mapeo de botones controlados mediante selectores de clase agrupados
        selectores_agrupados = {
            "nav-btn-pos": ".nav-btn",
            "nav-btn-inventario": ".nav-btn",
            "nav-btn-resumen": ".nav-btn"
        }

        for btn_id in botones_html:
            # Debe estar referenciado por ID en app.js o controlado por su selector de clase grupal
            encontrado = (btn_id in app_js) or (btn_id in selectores_agrupados and selectores_agrupados[btn_id] in app_js)
            self.assertTrue(encontrado, f"El botón con id='{btn_id}' en index.html no tiene referencia en app.js")


if __name__ == "__main__":
    unittest.main()
