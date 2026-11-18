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
  // EXPORTAR INVENTARIO A EXCEL (COMPLETO O SELECCIONADOS)
  // ==========================================================================
  function exportarInventarioExcel(idsSeleccionados = null) {
    if (typeof XLSX === 'undefined') {
      alert("La biblioteca de Excel (SheetJS) no está disponible en este momento.");
      return;
    }

    const state = Store.getState();
    let productos = state.productos || [];

    if (Array.isArray(idsSeleccionados) && idsSeleccionados.length > 0) {
      const set = new Set(idsSeleccionados);
      productos = productos.filter(p => set.has(p.id));
    }

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
        "Código de Barras": p.codigoBarras || p.codigo || "",
        "Descripción del Producto": p.nombre || "",
        "Categoría": p.categoria || "Otros",
        "Marca": p.marca || "-",
        "Unidad": p.unidad || "Unidad",
        "P. Compra": pCompra,
        "P. Venta": pVenta,
        "P. Mayorista": p.precioMayor || 0,
        "Margen %": margen,
        "Stock Actual": stock,
        "Stock Mínimo": p.stockMinimo || 5,
        "Stock Máximo": p.stockMaximo || 0,
        "Estado": p.estado === "inactivo" ? "Inactivo" : estado,
        "Valor Total (Venta)": valorTotal,
        "Ubicación": p.ubicacion || ""
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas);

    ws['!cols'] = [
      { wch: 14 }, { wch: 18 }, { wch: 38 }, { wch: 22 }, { wch: 16 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 20 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Inventario_Ferretería");
    const fecha = new Date().toISOString().slice(0, 10);
    const sufijo = idsSeleccionados ? "_Seleccionados" : "";
    XLSX.writeFile(wb, `Inventario_Ferreteria${sufijo}_${fecha}.xlsx`);
  }

  // ==========================================================================
  // EXPORTAR AUDITORÍA / KARDEX DE INVENTARIO A EXCEL
  // ==========================================================================
  function exportarKardexExcel(productoId = null) {
    if (typeof XLSX === 'undefined') {
      alert("La biblioteca de Excel (SheetJS) no está disponible en este momento.");
      return;
    }

    const movimientos = Store.getStockMovements(productoId, 5000);
    if (!movimientos || movimientos.length === 0) {
      alert("No hay movimientos registrados en el Kardex para exportar.");
      return;
    }

    const filas = movimientos.map(m => ({
      "Fecha y Hora": m.fecha ? m.fecha.replace("T", " ").slice(0, 19) : "",
      "Código": m.codigo || "",
      "Producto": m.nombre || "",
      "Tipo de Movimiento": m.tipo || "Ajuste",
      "Cantidad": Number(m.cantidad) || 0,
      "Stock Anterior": Number(m.stockAnterior) || 0,
      "Stock Resultante": Number(m.stockNuevo) || 0,
      "Costo Unitario": Number(m.costoUnitario) || 0,
      "Motivo": m.motivo || "",
      "Referencia": m.referencia || ""
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas);

    ws['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 36 }, { wch: 24 },
      { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
      { wch: 30 }, { wch: 24 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Kardex_Movimientos");
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Kardex_Movimientos_Ferreteria_${fecha}.xlsx`);
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

  // ==========================================================================
  // GENERADOR NATIVO DE CÓDIGO DE BARRAS EN SVG (CODE 128-B)
  // 100% Vectorial, nítido a cualquier resolución e imprimible en cualquier térmico
  // ==========================================================================
  function generarCodigoBarrasSVG(texto, opciones = {}) {
    const str = String(texto || "").trim();
    if (!str) return "";
    const altura = opciones.altura || 42;
    const anchoModulo = opciones.anchoModulo || 1.6;
    const mostrarTexto = opciones.mostrarTexto !== false;

    // Tabla oficial de 107 patrones Code 128 (anchuras de barras y espacios)
    const CODE128_PATRONES = [
      "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
      "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
      "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
      "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
      "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
      "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
      "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
      "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
      "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
      "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
      "114131","311141","411131","211412","211214","211232","2331112"
    ];

    // Inicio Code 128B (índice 104)
    const valores = [104];
    let checksum = 104;

    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      const val = (code >= 32 && code <= 126) ? (code - 32) : 0;
      valores.push(val);
      checksum += val * (i + 1);
    }

    valores.push(checksum % 103);
    valores.push(106); // Stop pattern

    let rectangulos = "";
    let currentX = 8;
    for (let v = 0; v < valores.length; v++) {
      const patron = CODE128_PATRONES[valores[v]] || "212222";
      for (let p = 0; p < patron.length; p++) {
        const w = parseInt(patron[p], 10) * anchoModulo;
        if (p % 2 === 0) {
          rectangulos += `<rect x="${currentX.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${altura}" fill="#000000" />`;
        }
        currentX += w;
      }
    }

    const anchoTotal = Math.ceil(currentX + 8);
    const altoTotal = mostrarTexto ? (altura + 16) : altura;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${anchoTotal} ${altoTotal}" width="${anchoTotal}" height="${altoTotal}" style="display:block; margin:0 auto; max-width:100%;">
        <rect x="0" y="0" width="${anchoTotal}" height="${altoTotal}" fill="#ffffff" />
        ${rectangulos}
        ${mostrarTexto ? `<text x="${(anchoTotal / 2).toFixed(1)}" y="${altura + 12}" text-anchor="middle" font-family="monospace" font-size="11" font-weight="700" fill="#0f172a">${escapeHtml(str)}</text>` : ''}
      </svg>
    `;
  }

  // ==========================================================================
  // GENERAR HOJA DE ETIQUETAS DE CÓDIGO DE BARRAS PARA IMPRESIÓN
  // ==========================================================================
  function generarEtiquetasHTML(itemsEtiquetas) {
    if (!Array.isArray(itemsEtiquetas) || itemsEtiquetas.length === 0) return "";

    const state = Store.getState();
    const config = state.configuracion || {};
    const nombreEmpresa = config.empresa || "Ferretería Sullcairi";
    const moneda = config.moneda || "S/";

    const tarjetas = [];
    itemsEtiquetas.forEach(item => {
      const prod = item.producto;
      const copias = Math.max(1, parseInt(item.copias, 10) || 1);
      const codigoBarras = prod.codigoBarras || prod.codigo || "FER-000";
      const svg = generarCodigoBarrasSVG(codigoBarras, { altura: 36, anchoModulo: 1.4, mostrarTexto: true });

      for (let c = 0; c < copias; c++) {
        tarjetas.push(`
          <div class="etiqueta-sticker-item">
            <div class="etiqueta-sticker-empresa">${escapeHtml(nombreEmpresa)}</div>
            <div class="etiqueta-sticker-nombre" title="${escapeHtml(prod.nombre)}">${escapeHtml(prod.nombre)}</div>
            <div class="etiqueta-sticker-cat">${escapeHtml(prod.categoria || 'General')}${prod.marca ? ` • ${escapeHtml(prod.marca)}` : ''}</div>
            <div class="etiqueta-sticker-barcode">${svg}</div>
            <div class="etiqueta-sticker-precio">
              <span class="etiqueta-sticker-moneda">${moneda}</span>
              <span class="etiqueta-sticker-monto">${Number(prod.precioVenta || 0).toFixed(2)}</span>
              <span class="etiqueta-sticker-unidad">x ${escapeHtml(prod.unidad || 'Und')}</span>
            </div>
          </div>
        `);
      }
    });

    return `
      <div class="contenedor-hoja-etiquetas">
        ${tarjetas.join('')}
      </div>
    `;
  }

  return {
    fmt,
    exportarInventarioExcel,
    exportarKardexExcel,
    exportarReporteVentasExcel,
    descargarPlantillaExcel,
    importarProductosExcel,
    generarCodigoBarrasSVG,
    generarEtiquetasHTML,
    generarTicketHTML
  };
})();
