# Sistema de Gestión y Punto de Venta para Ferretería

Sistema completo, moderno e intuitivo diseñado específicamente para ferreterías y tiendas de materiales.

**Estado:** 100% limpio y listo para usar (**sin datos demo ni productos de prueba**). Permite registrar tus propios productos, reabastecer stock ágilmente, vender con descuento automático de inventario y consultar el resumen detallado de ventas.

---

## 🚀 Cómo Iniciar el Sistema

### Opción 1: Con Servidor Local en Python (Recomendado)
Guarda automáticamente todos los cambios directamente en el archivo `datos.json`.

```bash
python servidor.py
```
*Se abrirá automáticamente en tu navegador en `http://localhost:8000`.*  
*(Si deseas usar otro puerto: `python servidor.py 8080`).*

### Opción 2: Sin Servidor (Doble Clic)
Puedes abrir `index.html` o `ferreteria_completa.html` con doble clic en cualquier navegador. Funciona de inmediato guardando los datos en la memoria local de tu navegador (`localStorage`).

---

## 🛠️ Características Principales

### 1. 📦 Inventario y Control de Stock
- **Agregar Productos:** Registra artículos con Código/Barras, Nombre, Categoría (Construcción, Gasfitería, Electricidad, Pinturas, Herramientas, etc.), Unidad de medida (Unidad, Bolsa, Kg, Metro, Galón, Caja, etc.), Precio de Compra, Precio de Venta y Stock Mínimo.
- **Agregar Stock / Reabastecer:** Cada producto en la tabla tiene un botón directo **`+ Stock`**. Al hacer clic puedes sumar existencias (+10, +50, etc.), actualizar el costo de compra y registrar el proveedor o motivo.
- **Alertas de Stock:** Clasificación automática de productos en:
  - 🟢 **Normal:** Stock adecuado.
  - 🟡 **Stock Bajo:** Advertencia cuando las unidades llegan al mínimo configurado.
  - 🔴 **Agotado:** Artículos con 0 unidades.
- **Importar y Exportar Excel:** Descarga la plantilla oficial en Excel, llénala con tu inventario y súbela de golpe con un solo clic.

### 2. ⚡ Punto de Venta (POS / Caja)
- Búsqueda ultrarrápida por nombre o lector de código de barras.
- Filtro rápido por categorías ferreteras.
- Validación estricta de inventario: **no permite vender más de lo que hay en stock**.
- Métodos de pago integrados: **Efectivo (con cálculo automático de vuelto), Yape, Plin, Tarjeta, Transferencia y Al Crédito**.
- Tipos de comprobante: **Nota de Venta, Boleta y Factura**.
- **Descuento Automático de Stock:** En el momento exacto en que cobras la venta, el stock de cada producto vendido disminuye de forma instantánea.
- **Ticket Imprimible:** Genera un ticket formateado listo para impresoras térmicas (80mm) o estándar.

### 3. 📊 Resumen de Ventas y Reportes
- **KPIs en tiempo real:**
  - Total vendido en soles (S/).
  - Ganancia neta estimada (Ventas menos Costo de compra de la mercadería).
  - Número de transacciones.
  - Total de unidades de productos despachados.
  - Ticket promedio por cliente.
- **Filtros por periodo:** Consulta las ventas de **Hoy, Ayer, Esta Semana, Este Mes o Todo el Historial**.
- **Distribución de Cobros:** Gráficos y porcentajes de ventas por método de pago (Efectivo, Yape, Tarjeta, etc.).
- **Top Productos Más Vendidos:** Ranking con los artículos de mayor rotación y su recaudación.
- **Historial Detallado y Anulación:** Historial completo con fecha, hora, cliente y detalle de productos.
  - **Anulación con devolución de stock:** Si anulas una venta, el sistema te pedirá confirmación y **devolverá todo el stock vendido a los productos de forma automática**.
- **Exportar Reporte a Excel:** Genera un libro Excel con 3 hojas: Resumen General, Historial de Ventas y Detalle de Ítems Vendidos.

### 4. ⚙️ Configuración y Respaldos
- Personaliza el nombre de tu ferretería, RUC, dirección, teléfono, símbolo de moneda y pie de ticket.
- **Descargar Respaldo JSON:** Crea copias de seguridad de todos tus datos para conservarlos en tu computadora o pendrive.
- **Restaurar Respaldo:** Carga un archivo de respaldo en cualquier momento.

---

## 📁 Estructura del Proyecto

```text
├── index.html                 # Página principal del sistema
├── ferreteria_completa.html   # Versión autónoma empaquetada (todo en 1 archivo)
├── servidor.py                # Servidor local HTTP y API REST en Python
├── datos.json                 # Base de datos local (inicia sin datos demo)
├── build_standalone.py        # Generador de la versión autónoma
├── css/
│   └── theme.css              # Estilos modernos, diseño responsive e impresión
└── js/
    ├── store.js               # Motor de cálculo, stock automático y guardado
    ├── export.js              # Exportador a Excel (SheetJS) y generador de tickets
    ├── app.js                 # Controlador del Punto de Venta, Inventario y Resumen
    └── lib/
        └── xlsx.full.min.js   # Biblioteca SheetJS para manejo de archivos Excel
```
