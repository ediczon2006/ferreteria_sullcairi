#!/usr/bin/env python3
"""Script para empaquetar todo el sistema de Ferretería en un único archivo HTML autónomo."""

import os

base_dir = os.path.dirname(os.path.abspath(__file__))
index_path = os.path.join(base_dir, "index.html")
css_path = os.path.join(base_dir, "css", "theme.css")
store_path = os.path.join(base_dir, "js", "store.js")
export_path = os.path.join(base_dir, "js", "export.js")
app_path = os.path.join(base_dir, "js", "app.js")
out_path = os.path.join(base_dir, "ferreteria_completa.html")

with open(index_path, "r", encoding="utf-8") as f:
    html = f.read()

with open(css_path, "r", encoding="utf-8") as f:
    css = f.read()

with open(store_path, "r", encoding="utf-8") as f:
    store_js = f.read()

with open(export_path, "r", encoding="utf-8") as f:
    export_js = f.read()

with open(app_path, "r", encoding="utf-8") as f:
    app_js = f.read()

# Reemplazar enlace de CSS por estilo embebido
css_tag = '<link rel="stylesheet" href="css/theme.css">'
inline_css = f'<style>\n{css}\n</style>'
html = html.replace(css_tag, inline_css)

# Reemplazar scripts por scripts embebidos
old_scripts = (
    '  <script src="js/store.js"></script>\n'
    '  <script src="js/export.js"></script>\n'
    '  <script src="js/app.js"></script>'
)

new_scripts = (
    '  <script>\n' + store_js + '\n  </script>\n'
    '  <script>\n' + export_js + '\n  </script>\n'
    '  <script>\n' + app_js + '\n  </script>'
)

html = html.replace(old_scripts, new_scripts)

with open(out_path, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Archivo autónomo generado exitosamente: {out_path} ({len(html)} bytes)")
