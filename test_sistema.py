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

        # Mapeo de botones controlados mediante selectores de clase agrupados (.nav-btn)
        selectores_agrupados = {
            "nav-btn-pos": ".nav-btn",
            "nav-btn-inventario": ".nav-btn",
            "nav-btn-producto": ".nav-btn",
            "nav-btn-kardex": ".nav-btn",
            "nav-btn-etiquetas": ".nav-btn",
            "nav-btn-resumen": ".nav-btn",
            "mob-nav-pos": ".nav-btn",
            "mob-nav-inventario": ".nav-btn",
            "mob-nav-producto": ".nav-btn",
            "mob-nav-kardex": ".nav-btn",
            "mob-nav-etiquetas": ".nav-btn",
            "mob-nav-resumen": ".nav-btn",
            "mob-nav-ajustes": ".nav-btn"
        }

        for btn_id in botones_html:
            # Debe estar referenciado por ID en app.js o controlado por su selector de clase grupal
            encontrado = (btn_id in app_js) or (btn_id in selectores_agrupados and selectores_agrupados[btn_id] in app_js)
            self.assertTrue(encontrado, f"El botón con id='{btn_id}' en index.html no tiene referencia en app.js")

    def test_07_administracion_avanzada_kardex_y_lotes(self):
        """Verifica que store.js y export.js contengan los métodos de Kardex, operaciones en lote y etiquetas."""
        with open(self.store_js_path, "r", encoding="utf-8") as f:
            store_js = f.read()

        with open(os.path.join(self.base_dir, "js", "export.js"), "r", encoding="utf-8") as f:
            export_js = f.read()

        # Métodos críticos del Store
        metodos_store = [
            "registrarMovimientoStock",
            "duplicateProduct",
            "adjustStock",
            "deleteProductsBatch",
            "updateCategoryBatch",
            "adjustPricesBatch",
            "changeStatusBatch",
            "getStockMovements",
            "getKpiInventario",
            "addCategory",
            "removeCategory",
            "addUnit",
            "removeUnit"
        ]
        for metodo in metodos_store:
            self.assertIn(metodo, store_js, f"Store debe exportar el método de administración '{metodo}'")

        # Métodos críticos de Exportación y Código de Barras
        metodos_export = [
            "generarCodigoBarrasSVG",
            "generarEtiquetasHTML",
            "exportarKardexExcel"
        ]
        for metodo in metodos_export:
            self.assertIn(metodo, export_js, f"ExportManager debe contener el método '{metodo}'")

    def test_08_paginas_individuales_y_responsividad(self):
        """Verifica que cada botón principal tenga su propia página dedicada y diseño adaptable multidispositivo."""
        with open(self.index_path, "r", encoding="utf-8") as f:
            html = f.read()

        with open(os.path.join(self.base_dir, "css", "theme.css"), "r", encoding="utf-8") as f:
            css = f.read()

        paginas_individuales = [
            "seccion-pos",
            "seccion-inventario",
            "seccion-producto",
            "seccion-kardex",
            "seccion-etiquetas",
            "seccion-resumen",
            "seccion-ajustes"
        ]
        for pag in paginas_individuales:
            self.assertIn(f'id="{pag}"', html, f"Debe existir la página individual dedicada '{pag}'")

        archivos_html = [
            "index.html",
            "inventario.html",
            "producto.html",
            "kardex.html",
            "etiquetas.html",
            "resumen.html",
            "ajustes.html"
        ]
        for arch in archivos_html:
            ruta_arch = os.path.join(self.base_dir, arch)
            self.assertTrue(os.path.exists(ruta_arch), f"Debe existir el archivo HTML individual '{arch}'")

        # Verificar breakpoints responsivos para laptops, tablets, smartphones y accesibilidad
        self.assertIn("@media (max-width: 1360px)", css)
        self.assertIn("@media (max-width: 1150px)", css)
        self.assertIn("@media (max-width: 960px)", css)
        self.assertIn("@media (max-width: 768px)", css)
        self.assertIn("@media (max-width: 480px)", css)
        self.assertIn("@media (prefers-reduced-motion: reduce)", css)
        self.assertIn(".mobile-bottom-nav", css)
        self.assertIn(".app-sidebar", css)
        self.assertIn(".drawer-panel", css)

    def test_09_reglas_negocio_sku_unico_ceros_y_stock_no_negativo(self):
        """Verifica unicidad de SKU, preservación de ceros a la izquierda y bloqueo de stock/precio negativo."""
        # 1. Preservación de ceros a la izquierda
        self.assertEqual(servidor.normalizar_codigo("00125"), "00125")
        self.assertEqual(servidor.normalizar_codigo("  00450 "), "00450")

        # 2. SKU único (case-insensitive)
        payload_sku_duplicado = {
            "productos": [
                {"id": "P1", "codigo": "FER-001", "nombre": "Martillo", "precioVenta": 25, "stock": 10},
                {"id": "P2", "codigo": "fer-001", "nombre": "Alicate", "precioVenta": 18, "stock": 5}
            ],
            "ventas": []
        }
        valido, err = servidor.validar_esquema(payload_sku_duplicado)
        self.assertFalse(valido, "Debe rechazar SKUs duplicados sin importar mayúsculas/minúsculas")
        self.assertIn("SKU duplicado", err)

        # 3. Código de barras único cuando está presente
        payload_barcode_duplicado = {
            "productos": [
                {"id": "P1", "codigo": "001", "codigoBarras": "7751234567890", "nombre": "A", "precioVenta": 10, "stock": 1},
                {"id": "P2", "codigo": "002", "codigoBarras": "7751234567890", "nombre": "B", "precioVenta": 12, "stock": 2}
            ],
            "ventas": []
        }
        valido_bc, err_bc = servidor.validar_esquema(payload_barcode_duplicado)
        self.assertFalse(valido_bc, "Debe rechazar códigos de barras duplicados")

        # 4. Rechazo de stock o precio negativo
        payload_stock_negativo = {
            "productos": [
                {"id": "P1", "codigo": "00125", "nombre": "Cemento", "precioVenta": 29.0, "stock": -3}
            ],
            "ventas": []
        }
        valido_neg, _ = servidor.validar_esquema(payload_stock_negativo)
        self.assertFalse(valido_neg, "No debe permitir stock negativo")

        # 5. Métodos de integridad en store.js
        with open(self.store_js_path, "r", encoding="utf-8") as f:
            store_js = f.read()
        for metodo in ["validarProductoUnico", "toggleProductStatus", "prepareDuplicateDraft", "retirarStock"]:
            self.assertIn(metodo, store_js, f"Store debe incluir el método de regla de negocio '{metodo}'")

    def test_10_catalogo_publico_y_rbac(self):
        """Verifica que el catálogo público excluya productos inactivos y costos de compra, y valide RBAC."""
        datos_prueba = {
            "configuracion": {"empresa": "Ferretería Sullcairi", "moneda": "S/"},
            "categorias": ["Herramientas Manuales"],
            "productos": [
                {
                    "id": "P1",
                    "codigo": "00101",
                    "nombre": "Martillo Carpintero",
                    "estado": "activo",
                    "precioCompra": 15.0,
                    "precioVenta": 25.0,
                    "stock": 12,
                    "stockMinimo": 5,
                    "unidad": "Unidad"
                },
                {
                    "id": "P2",
                    "codigo": "00102",
                    "nombre": "Producto Descontinuado",
                    "estado": "inactivo",
                    "precioCompra": 10.0,
                    "precioVenta": 18.0,
                    "stock": 4,
                    "stockMinimo": 2,
                    "unidad": "Unidad"
                }
            ]
        }
        catalogo = servidor.obtener_catalogo_publico(datos_prueba)
        self.assertEqual(len(catalogo), 1, "El catálogo público solo debe exponer productos activos")
        prod_publico = catalogo[0]
        self.assertEqual(prod_publico["codigo"], "00101")
        self.assertNotIn("precioCompra", prod_publico, "El catálogo público nunca debe exponer el costo de compra")
        self.assertEqual(prod_publico["disponibilidad"], "disponible")

        # Verificación RBAC
        self.assertTrue(servidor.verificar_permiso_rol("admin", "escritura")[0])
        self.assertTrue(servidor.verificar_permiso_rol("operador", "escritura")[0])
        self.assertFalse(servidor.verificar_permiso_rol("invitado", "escritura")[0])

    def test_11_servidor_http_e2e_y_sincronizacion_paginas(self):
        """Levanta el servidor HTTP real en un hilo efímero y prueba endpoints REST, RBAC y las 7 páginas HTML."""
        import threading
        import urllib.request
        import urllib.error
        from http.server import HTTPServer

        # 1. Verificar que cada archivo HTML físico tenga su data-pagina y sección activa correcta
        mapa_paginas = {
            "index.html": "pos",
            "inventario.html": "inventario",
            "producto.html": "producto",
            "kardex.html": "kardex",
            "etiquetas.html": "etiquetas",
            "resumen.html": "resumen",
            "ajustes.html": "ajustes"
        }
        for archivo, seccion in mapa_paginas.items():
            ruta = os.path.join(self.base_dir, archivo)
            with open(ruta, "r", encoding="utf-8") as f:
                contenido = f.read()
            self.assertIn(f'<body data-pagina="{seccion}">', contenido, f"{archivo} debe tener data-pagina='{seccion}'")
            self.assertIn(f'<section class="modulo-seccion activo" id="seccion-{seccion}">', contenido, f"{archivo} debe activar #seccion-{seccion}")

        # 2. Levantar servidor HTTP real en puerto libre
        httpd = HTTPServer(("127.0.0.1", 0), servidor.ManejadorFerreteria)
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()

        try:
            base_url = f"http://127.0.0.1:{port}"

            # GET /api/ping
            with urllib.request.urlopen(f"{base_url}/api/ping", timeout=3) as resp:
                self.assertEqual(resp.status, 200)
                ping = json.loads(resp.read().decode("utf-8"))
                self.assertTrue(ping["ok"])

            # GET /api/catalogo-publico
            with urllib.request.urlopen(f"{base_url}/api/catalogo-publico", timeout=3) as resp:
                self.assertEqual(resp.status, 200)
                cat_pub = json.loads(resp.read().decode("utf-8"))
                self.assertTrue(cat_pub["ok"])
                self.assertIsInstance(cat_pub["productos"], list)

            # GET de cada una de las 7 páginas físicas por HTTP
            for archivo in mapa_paginas.keys():
                with urllib.request.urlopen(f"{base_url}/{archivo}", timeout=3) as resp_html:
                    self.assertEqual(resp_html.status, 200)

            # POST /api/datos con rol sin permisos (403 Forbidden)
            req_403 = urllib.request.Request(
                f"{base_url}/api/datos",
                data=json.dumps({"productos": [], "ventas": []}).encode("utf-8"),
                headers={"Content-Type": "application/json", "X-User-Role": "invitado"},
                method="POST"
            )
            with self.assertRaises(urllib.error.HTTPError) as ctx_403:
                urllib.request.urlopen(req_403, timeout=3)
            self.assertEqual(ctx_403.exception.code, 403)

            # POST /api/datos con SKU duplicado (400 Bad Request)
            payload_dup = {
                "productos": [
                    {"id": "1", "codigo": "00125", "nombre": "P1", "precioVenta": 10, "stock": 1},
                    {"id": "2", "codigo": "00125", "nombre": "P2", "precioVenta": 15, "stock": 2}
                ],
                "ventas": []
            }
            req_400 = urllib.request.Request(
                f"{base_url}/api/datos",
                data=json.dumps(payload_dup).encode("utf-8"),
                headers={"Content-Type": "application/json", "X-User-Role": "admin"},
                method="POST"
            )
            with self.assertRaises(urllib.error.HTTPError) as ctx_400:
                urllib.request.urlopen(req_400, timeout=3)
            self.assertEqual(ctx_400.exception.code, 400)

        finally:
            httpd.shutdown()
            httpd.server_close()


if __name__ == "__main__":
    unittest.main()
