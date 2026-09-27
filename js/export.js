/**
 * ============================================================================
 * EXPORTADOR Y GENERADOR DE REPORTES / EXCEL / TICKETS (js/export.js)
 * Soporta SheetJS (xlsx.full.min.js) y plantillas de impresión
 * ============================================================================
 */

const ExportManager = (() => {

  // Formato de moneda
  function fmt(monto, moneda = "S/") {
    return `${moneda} ${(Number(monto) || 0).toFixed(2)}`;
  }

  // ==========================================================================
  // EXPORTAR INVENTARIO A EXCEL
  // ==========================================================================
  function exportarInventarioExcel() {
    if (typeof XLSX === 'undefined') {
      alert("La biblioteca de Excel (SheetJS) no está disponible.");
      return;
    }

    const state = Store.getState();
    const productos = state.productos || [];

    if (productos.length === 0) {
      alert("No hay productos registrados para exportar.");
      return;
    }

    const filas = productos.map(p => {
      const pCompra = Number(p.precioCompra) || 0;
      const pVenta = Number(p.precioVenta) || 0;
      const stock = Number(p.stock) || 0;
      const valorTotal = stock * pVenta;
      const margen = pCompra > 0 ? (((pVenta - pCompra) / pCompra) * 100).toFixed(1) + "%" : "0%";
      const estado = stock <= 0 ? "Agotado" : (stock <= (p.stockMinimo || 5) ? "Bajo Stock" : "Normal");

      return {
        "Código": p.codigo || "",
        "Descripción del Producto": p.nombre || "",
        "Categoría": p.categoria || "Otros",
        "Unidad": p.unidad || "Unidad",
        "P. Compra": pCompra,
        "P. Venta": pVenta,
        "Margen %": margen,
        "Stock Actual": stock,
        "Stock Mínimo": p.stockMinimo || 5,
        "Estado": estado,
        "Valor Total (Venta)": valorTotal,
        "Ubicación": p.ubicacion || ""
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas);

    // Ajustar ancho de columnas
    ws['!cols'] = [
      { wch: 12 }, { wch: 35 }, { wch: 22 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 18 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Inventario_Ferretería");
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Inventario_Ferreteria_${fecha}.xlsx`);
  }

  // ==========================================================================
  // EXPORTAR RESUMEN Y REPORTE DE VENTAS A EXCEL
  // ==========================================================================
  function exportarReporteVentasExcel(filtroPeriodo = "todos", fechaInicio = null, fechaFin = null) {
    if (typeof XLSX === 'undefined') {
      alert("La biblioteca de Excel (SheetJS) no está disponible.");
      return;
    }

    const resumen = Store.getSalesSummary(filtroPeriodo, fechaInicio, fechaFin);
    const ventas = resumen.ventas || [];

    if (ventas.length === 0) {
      alert("No hay ventas registradas en el periodo seleccionado para exportar.");
      return;
    }

    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen General
    const datosResumen = [
      { "Métrica": "Periodo del Reporte", "Valor": filtroPeriodo.toUpperCase() },
      { "Métrica": "Total Recaudado (Ventas)", "Valor": resumen.totalVentas },
      { "Métrica": "Costo de Mercadería", "Valor": resumen.totalCosto },
      { "Métrica": "Ganancia Neta Estimada", "Valor": resumen.totalGanancia },
      { "Métrica": "Margen Promedio", "Valor": resumen.margenPorcentaje.toFixed(2) + "%" },
      { "Métrica": "Cantidad de Transacciones", "Valor": resumen.cantidadTransacciones },
      { "Métrica": "Total de Unidades Vendidas", "Valor": resumen.totalUnidades },
      { "Métrica": "Ticket Promedio", "Valor": resumen.ticketPromedio.toFixed(2) }
    ];
    const wsResumen = XLSX.utils.json_to_sheet(datosResumen);
    wsResumen['!cols'] = [{ wch: 28 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen_General");

    // Hoja 2: Ventas por Comprobante
    const filasVentas = ventas.map(v => ({
      "N° Comprobante": v.numero,
      "Fecha": v.fecha ? v.fecha.replace("T", " ").slice(0, 19) : "",
      "Tipo": v.tipoComprobante,
      "Cliente": v.cliente,
      "Documento (DNI/RUC)": v.docCliente,
      "Método de Pago": v.metodoPago,
      "Cant. Productos": v.items ? v.items.length : 0,
      "Total Venta": Number(v.total) || 0,
      "Costo": Number(v.totalCosto) || 0,
      "Ganancia": Number(v.gananciaTotal) || 0,
      "Estado": v.estado
    }));
    const wsVentas = XLSX.utils.json_to_sheet(filasVentas);
    wsVentas['!cols'] = [
      { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 25 },
      { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(wb, wsVentas, "Historial_Ventas");

    // Hoja 3: Detalle de Ítems Vendidos
    const filasDetalle = [];
    ventas.forEach(v => {
      (v.items || []).forEach(it => {
        filasDetalle.push({
          "N° Comprobante": v.numero,
          "Fecha": v.fecha ? v.fecha.slice(0, 10) : "",
          "Código Producto": it.codigo || "",
          "Producto": it.nombre,
          "Categoría": it.categoria || "",
          "Unidad": it.unidad || "Unidad",
          "Cantidad": it.cantidad,
          "P. Unitario": it.precioUnitario,
          "Subtotal": it.subtotal,
          "Ganancia": it.ganancia
        });
      });
    });
    const wsDetalle = XLSX.utils.json_to_sheet(filasDetalle);
    wsDetalle['!cols'] = [
      { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 32 },
      { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle_Items_Vendidos");

    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Reporte_Ventas_Ferreteria_${fecha}.xlsx`);
  }

  // ==========================================================================
  // DESCARGAR PLANTILLA EXCEL PARA SUBIR PRODUCTOS
  // ==========================================================================
  function descargarPlantillaExcel() {
    if (typeof XLSX === 'undefined') {
      alert("La biblioteca de Excel (SheetJS) no está disponible.");
      return;
    }

    const plantilla = [
      {
        "Codigo": "FER-1001",
        "Nombre": "Ejemplo: Cemento Sol Tipo I 42.5kg",
        "Categoria": "Materiales de Construcción",
        "Unidad": "Bolsa",
        "PrecioCompra": 24.50,
        "PrecioVenta": 29.00,
        "Stock": 50,
        "StockMinimo": 10,
        "Ubicacion": "Patio 1"
      },
      {
        "Codigo": "FER-1002",
        "Nombre": "Ejemplo: Tubo PVC 1/2 pulgada x 3m Pavco",
        "Categoria": "Gasfitería y Tuberías",
        "Unidad": "Unidad",
        "PrecioCompra": 8.00,
        "PrecioVenta": 12.50,
        "Stock": 30,
        "StockMinimo": 5,
        "Ubicacion": "Estante B-2"
      }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(plantilla);
    ws['!cols'] = [
      { wch: 14 }, { wch: 35 }, { wch: 25 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, "Plantilla_Productos_Ferreteria.xlsx");
  }

  // ==========================================================================
  // IMPORTAR PRODUCTOS DESDE EXCEL / CSV
  // ==========================================================================
  function importarProductosExcel(file, callback) {
    if (typeof XLSX === 'undefined') {
      callback({ ok: false, error: "SheetJS no disponible" });
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);

        if (!rows || rows.length === 0) {
          callback({ ok: false, error: "El archivo no contiene registros legibles." });
          return;
        }

        let importados = 0;
        rows.forEach(r => {
          // Detectar columnas flexibles
          const nombre = r["Nombre"] || r["Producto"] || r["Descripcion"] || r["Descripción del Producto"] || "";
          if (!nombre || String(nombre).startsWith("Ejemplo:")) return; // ignorar ejemplos

          const codigo = r["Codigo"] || r["Código"] || "";
          const categoria = r["Categoria"] || r["Categoría"] || "Otros";
          const unidad = r["Unidad"] || "Unidad";
          const precioCompra = parseFloat(r["PrecioCompra"] || r["P. Compra"] || r["Compra"] || 0);
          const precioVenta = parseFloat(r["PrecioVenta"] || r["P. Venta"] || r["Venta"] || 0);
          const stock = parseFloat(r["Stock"] || r["Stock Actual"] || r["Cantidad"] || 0);
          const stockMinimo = parseFloat(r["StockMinimo"] || r["Stock Mínimo"] || 5);
          const ubicacion = r["Ubicacion"] || r["Ubicación"] || "";

          Store.addProduct({
            codigo: String(codigo),
            nombre: String(nombre),
            categoria: String(categoria),
            unidad: String(unidad),
            precioCompra: isNaN(precioCompra) ? 0 : precioCompra,
            precioVenta: isNaN(precioVenta) ? 0 : precioVenta,
            stock: isNaN(stock) ? 0 : stock,
            stockMinimo: isNaN(stockMinimo) ? 5 : stockMinimo,
            ubicacion: String(ubicacion)
          });
          importados++;
        });

        callback({ ok: true, importados });
      } catch (err) {
        callback({ ok: false, error: "Error al procesar el archivo: " + err.message });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ==========================================================================
  // GENERAR TICKET DE VENTA (HTML FORMATEADO)
  // ==========================================================================
  function generarTicketHTML(venta) {
    const state = Store.getState();
    const config = state.configuracion || {};
    const moneda = config.moneda || "S/";

    const fechaHora = venta.fecha ? new Date(venta.fecha).toLocaleString("es-PE") : "";
    const lineasItems = (venta.items || []).map(it => `
      <tr>
        <td style="padding:3px 0;">${it.cantidad} ${it.unidad}</td>
        <td style="padding:3px 0;">${it.nombre}</td>
        <td style="padding:3px 0; text-align:right;">${(it.precioUnitario || 0).toFixed(2)}</td>
        <td style="padding:3px 0; text-align:right; font-weight:bold;">${(it.subtotal || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <div class="ticket-wrapper">
        <div class="ticket-header">
          <h2>${config.empresa || 'FERRETERÍA'}</h2>
          ${config.ruc ? `<p>RUC: ${config.ruc}</p>` : ''}
          ${config.direccion ? `<p>${config.direccion}</p>` : ''}
          ${config.telefono ? `<p>Tel: ${config.telefono}</p>` : ''}
          <p style="margin-top:4px; font-weight:bold;">${(venta.tipoComprobante || 'NOTA DE VENTA').toUpperCase()}</p>
          <p style="font-size:14px; font-weight:bold;">N° ${venta.numero}</p>
        </div>

        <div class="ticket-datos">
          <p><b>Fecha:</b> ${fechaHora}</p>
          <p><b>Cliente:</b> ${venta.cliente || 'Cliente General'}</p>
          ${venta.docCliente && venta.docCliente !== '-' ? `<p><b>Doc:</b> ${venta.docCliente}</p>` : ''}
          <p><b>Pago:</b> ${venta.metodoPago || 'Efectivo'}</p>
          ${venta.estado === 'ANULADA' ? `<p style="color:red; font-weight:bold; font-size:14px; text-align:center;">*** ANULADA ***</p>` : ''}
        </div>

        <table class="ticket-tabla">
          <thead>
            <tr>
              <th style="width:20%;">Cant</th>
              <th style="width:45%;">Descripción</th>
              <th style="width:17%; text-align:right;">P.Unit</th>
              <th style="width:18%; text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${lineasItems}
          </tbody>
        </table>

        <div class="ticket-totales">
          <div class="ticket-fila-total" style="font-size:15px; font-weight:bold;">
            <span>TOTAL:</span>
            <span>${moneda} ${(Number(venta.total) || 0).toFixed(2)}</span>
          </div>
          ${venta.metodoPago === 'Efectivo' ? `
            <div class="ticket-fila-total" style="font-size:12px;">
              <span>Recibido:</span>
              <span>${moneda} ${(Number(venta.montoRecibido) || Number(venta.total)).toFixed(2)}</span>
            </div>
            <div class="ticket-fila-total" style="font-size:12px;">
              <span>Vuelto:</span>
              <span>${moneda} ${(Number(venta.vuelto) || 0).toFixed(2)}</span>
            </div>
          ` : ''}
        </div>

        <div class="ticket-footer">
          <p>${config.pieTicket || '¡Gracias por su compra!'}</p>
        </div>
      </div>
    `;
  }

  return {
    fmt,
    exportarInventarioExcel,
    exportarReporteVentasExcel,
    descargarPlantillaExcel,
    importarProductosExcel,
    generarTicketHTML
  };
})();
