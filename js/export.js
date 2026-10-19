/**
 * ============================================================================
 * EXPORTADOR Y GENERADOR DE REPORTES / EXCEL / TICKETS (js/export.js)
 * Manejo de SheetJS (xlsx.full.min.js), plantillas de importación y tickets térmicos
 * ============================================================================
 */

const ExportManager = (() => {
  'use strict';

  function escapeHtml(texto) {
    if (texto === null || texto === undefined) return "";
    return String(texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fmt(monto, moneda = "S/") {
    return `${moneda} ${(Number(monto) || 0).toFixed(2)}`;
  }

  // ==========================================================================
  // EXPORTAR INVENTARIO A EXCEL
  // ==========================================================================
  function exportarInventarioExcel() {
    if (typeof XLSX === 'undefined') {
      alert("La biblioteca de Excel (SheetJS) no está disponible en este momento.");
      return;
    }

    const state = Store.getState();
    const productos = state.productos || [];

    if (productos.length === 0) {
      alert("No hay productos en el inventario para exportar.");
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

    ws['!cols'] = [
      { wch: 14 }, { wch: 38 }, { wch: 24 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 20 }
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
      alert("La biblioteca de Excel (SheetJS) no está disponible en este momento.");
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
      { "Métrica": "Periodo del Reporte", "Valor": String(filtroPeriodo).toUpperCase() },
      { "Métrica": "Total Recaudado (Ventas)", "Valor": resumen.totalVentas },
      { "Métrica": "Costo de Mercadería", "Valor": resumen.totalCosto },
      { "Métrica": "Ganancia Neta Estimada", "Valor": resumen.totalGanancia },
      { "Métrica": "Margen Promedio", "Valor": resumen.margenPorcentaje.toFixed(2) + "%" },
      { "Métrica": "Cantidad de Transacciones", "Valor": resumen.cantidadTransacciones },
      { "Métrica": "Total de Unidades Vendidas", "Valor": resumen.totalUnidades },
      { "Métrica": "Ticket Promedio", "Valor": resumen.ticketPromedio.toFixed(2) }
    ];
    const wsResumen = XLSX.utils.json_to_sheet(datosResumen);
    wsResumen['!cols'] = [{ wch: 30 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen_General");

    // Hoja 2: Historial de Ventas
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
      { wch: 16 }, { wch: 20 }, { wch: 15 }, { wch: 28 },
      { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, wsVentas, "Historial_Ventas");

    // Hoja 3: Detalle de Ítems
    const filasDetalle = [];
    ventas.forEach(v => {
      (v.items || []).forEach(it => {
        filasDetalle.push({
          "N° Comprobante": v.numero,
          "Fecha": v.fecha ? v.fecha.slice(0, 10) : "",
          "Código": it.codigo || "",
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
      { wch: 16 }, { wch: 14 }, { wch: 15 }, { wch: 35 },
      { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }
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
      alert("La biblioteca de Excel (SheetJS) no está disponible en este momento.");
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
      { wch: 15 }, { wch: 38 }, { wch: 26 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, "Plantilla_Productos_Ferreteria.xlsx");
  }

  // ==========================================================================
  // IMPORTAR PRODUCTOS DESDE EXCEL / CSV (POR LOTES O(1))
  // ==========================================================================
  function importarProductosExcel(file, callback) {
    if (typeof XLSX === 'undefined') {
      callback({ ok: false, error: "Biblioteca SheetJS no cargada" });
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
          callback({ ok: false, error: "El archivo no contiene filas o datos legibles." });
          return;
        }

        const prodsToAdd = [];
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const nombre = r["Nombre"] || r["Producto"] || r["Descripcion"] || r["Descripción del Producto"] || "";
          if (!nombre || String(nombre).startsWith("Ejemplo:")) continue;

          const codigo = r["Codigo"] || r["Código"] || "";
          const categoria = r["Categoria"] || r["Categoría"] || "Otros";
          const unidad = r["Unidad"] || "Unidad";
          const precioCompra = parseFloat(r["PrecioCompra"] || r["P. Compra"] || r["Compra"] || 0);
          const precioVenta = parseFloat(r["PrecioVenta"] || r["P. Venta"] || r["Venta"] || 0);
          const stock = parseFloat(r["Stock"] || r["Stock Actual"] || r["Cantidad"] || 0);
          const stockMinimo = parseFloat(r["StockMinimo"] || r["Stock Mínimo"] || 5);
          const ubicacion = r["Ubicacion"] || r["Ubicación"] || "";

          prodsToAdd.push({
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
        }

        const importados = Store.addProductsBatch(prodsToAdd);
        callback({ ok: true, importados });
      } catch (err) {
        callback({ ok: false, error: "Error al procesar el archivo Excel: " + err.message });
      }
    };
    reader.onerror = function() {
      callback({ ok: false, error: "No se pudo leer el archivo seleccionado" });
    };
    reader.readAsArrayBuffer(file);
  }

  // ==========================================================================
  // GENERAR TICKET DE VENTA (HTML FORMATEADO Y PROTEGIDO CONTRA XSS)
  // ==========================================================================
  function generarTicketHTML(venta) {
    if (!venta) return "";

    const state = Store.getState();
    const config = state.configuracion || {};
    const moneda = escapeHtml(config.moneda || "S/");

    const fechaHora = venta.fecha ? new Date(venta.fecha).toLocaleString("es-PE") : "";
    const lineasItems = (venta.items || []).map(it => `
      <tr>
        <td style="padding:4px 0; font-size:12px;">${escapeHtml(it.cantidad)} ${escapeHtml(it.unidad)}</td>
        <td style="padding:4px 0; font-size:12px; font-weight:600;">${escapeHtml(it.nombre)}</td>
        <td style="padding:4px 0; font-size:12px; text-align:right;">${(it.precioUnitario || 0).toFixed(2)}</td>
        <td style="padding:4px 0; font-size:12px; text-align:right; font-weight:bold;">${(it.subtotal || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <div class="ticket-wrapper">
        <div class="ticket-header">
          <h2>${escapeHtml(config.empresa || 'FERRETERÍA SULLCAIRI')}</h2>
          ${config.ruc ? `<p style="font-size:12px; margin-top:2px;">RUC: ${escapeHtml(config.ruc)}</p>` : ''}
          ${config.direccion ? `<p style="font-size:11px; margin-top:2px;">${escapeHtml(config.direccion)}</p>` : ''}
          ${config.telefono ? `<p style="font-size:11px; margin-top:2px;">Tel/WhatsApp: ${escapeHtml(config.telefono)}</p>` : ''}
          <div style="margin-top:6px; font-weight:bold; font-size:13px; text-transform:uppercase;">
            ${escapeHtml(venta.tipoComprobante || 'NOTA DE VENTA')}
          </div>
          <div style="font-size:15px; font-weight:900; letter-spacing:1px; margin-top:2px;">
            N° ${escapeHtml(venta.numero)}
          </div>
        </div>

        <div class="ticket-meta">
          <p><b>Fecha:</b> ${escapeHtml(fechaHora)}</p>
          <p><b>Cliente:</b> ${escapeHtml(venta.cliente || 'Cliente General')}</p>
          ${venta.docCliente && venta.docCliente !== '-' ? `<p><b>Documento:</b> ${escapeHtml(venta.docCliente)}</p>` : ''}
          <p><b>Forma de Pago:</b> ${escapeHtml(venta.metodoPago || 'Efectivo')}</p>
          ${venta.estado === 'ANULADA' ? `<div style="color:red; font-weight:bold; font-size:14px; text-align:center; margin-top:4px; border:1px dashed red; padding:2px;">*** COMPROBANTE ANULADO ***</div>` : ''}
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
          <div class="ticket-fila" style="font-size:15px; font-weight:900;">
            <span>TOTAL A PAGAR:</span>
            <span>${moneda} ${(Number(venta.total) || 0).toFixed(2)}</span>
          </div>
          ${venta.metodoPago === 'Efectivo' ? `
            <div class="ticket-fila" style="font-size:12px; margin-top:4px;">
              <span>Monto Recibido:</span>
              <span>${moneda} ${(Number(venta.montoRecibido) || Number(venta.total)).toFixed(2)}</span>
            </div>
            <div class="ticket-fila" style="font-size:12px; font-weight:bold;">
              <span>Vuelto Entregado:</span>
              <span>${moneda} ${(Number(venta.vuelto) || 0).toFixed(2)}</span>
            </div>
          ` : ''}
        </div>

        <div class="ticket-footer">
          <p style="font-weight:600;">${escapeHtml(config.pieTicket || '¡Gracias por su compra!')}</p>
          <p style="font-size:10px; color:#555; margin-top:4px;">Sistema Ferretero PRO</p>
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
