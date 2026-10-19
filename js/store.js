/**
 * ============================================================================
 * STORE CENTRALIZADO - FERRETERÍA PROFESIONAL (js/store.js)
 * Arquitectura reactiva, validación defensiva, operaciones atómicas de stock
 * ============================================================================
 */

const Store = (() => {
  'use strict';

  // Esquema inicial limpio - SIN DATOS DEMO
  const ESTADO_INICIAL = {
    configuracion: {
      empresa: "Ferretería Sullcairi",
      ruc: "",
      direccion: "Av. Principal N° 123",
      telefono: "",
      moneda: "S/",
      igv: 18,
      aplicarIgv: false,
      pieTicket: "¡Gracias por su compra! Vuelva pronto."
    },
    categorias: [
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
    unidades: [
      "Unidad", "Bolsa", "Kg", "Metro", "Galón", "Caja", "Rollo", "Paquete", "Plancha", "Litro", "Par"
    ],
    productos: [],
    ventas: [],
    clientes: []
  };

  let state = JSON.parse(JSON.stringify(ESTADO_INICIAL));
  const listeners = [];
  let saveTimer = null;
  let saveStateCallback = null;

  // Redondeo seguro para evitar anomalías de coma flotante (IEEE 754)
  function round3(num) {
    return Math.round((Number(num) || 0) * 1000) / 1000;
  }

  function round2(num) {
    return Math.round((Number(num) || 0) * 100) / 100;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  function notify() {
    const currentState = getState();
    for (let i = 0; i < listeners.length; i++) {
      try {
        listeners[i](currentState);
      } catch (e) {
        console.error("[Store] Error en listener:", e);
      }
    }
  }

  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  function setSaveCallback(cb) {
    saveStateCallback = cb;
  }

  function updateSaveIndicator(status) {
    if (typeof saveStateCallback === 'function') {
      try {
        saveStateCallback(status);
      } catch (err) {
        console.error("[Store] Error en callback de estado:", err);
      }
    }
  }

  // Inicialización con fallback tolerante a fallos
  async function init() {
    updateSaveIndicator("guardando");
    let cargadoRemoto = false;

    // 1. Intentar backend local Python
    try {
      const res = await fetch('/api/datos', { cache: 'no-store' });
      if (res.ok) {
        const datos = await res.json();
        if (datos && typeof datos === 'object') {
          state = {
            ...ESTADO_INICIAL,
            ...datos,
            configuracion: { ...ESTADO_INICIAL.configuracion, ...(datos.configuracion || {}) },
            categorias: Array.isArray(datos.categorias) && datos.categorias.length ? datos.categorias : ESTADO_INICIAL.categorias,
            unidades: Array.isArray(datos.unidades) && datos.unidades.length ? datos.unidades : ESTADO_INICIAL.unidades,
            productos: Array.isArray(datos.productos) ? datos.productos : [],
            ventas: Array.isArray(datos.ventas) ? datos.ventas : [],
            clientes: Array.isArray(datos.clientes) ? datos.clientes : []
          };
          cargadoRemoto = true;
          guardarEnLocalStorage();
          updateSaveIndicator("guardado");
          notify();
          return;
        }
      }
    } catch (e) {
      // Servidor no disponible: modo offline
    }

    // 2. Si no hay backend, leer de localStorage
    const local = localStorage.getItem('ferreteria_datos_v1');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (parsed && typeof parsed === 'object') {
          state = {
            ...ESTADO_INICIAL,
            ...parsed,
            configuracion: { ...ESTADO_INICIAL.configuracion, ...(parsed.configuracion || {}) },
            productos: Array.isArray(parsed.productos) ? parsed.productos : [],
            ventas: Array.isArray(parsed.ventas) ? parsed.ventas : [],
            clientes: Array.isArray(parsed.clientes) ? parsed.clientes : []
          };
        }
      } catch (err) {
        console.error("[Store] Error al leer localStorage:", err);
      }
    } else if (!cargadoRemoto) {
      state = JSON.parse(JSON.stringify(ESTADO_INICIAL));
      guardarEnLocalStorage();
    }

    updateSaveIndicator(cargadoRemoto ? "guardado" : "guardado-local");
    notify();
  }

  function guardarEnLocalStorage() {
    try {
      localStorage.setItem('ferreteria_datos_v1', JSON.stringify(state));
    } catch (e) {
      console.error("[Store] Error guardando en localStorage:", e);
    }
  }

  // Persistencia dual (localStorage inmediato + API remota)
  function persistir(inmediato = false) {
    guardarEnLocalStorage();
    updateSaveIndicator("guardando");

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    const ejecutarGuardadoRemoto = async () => {
      try {
        const res = await fetch('/api/datos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        });
        if (res.ok) {
          updateSaveIndicator("guardado");
        } else {
          updateSaveIndicator("sin-guardar");
        }
      } catch (err) {
        // Modo cliente estático / offline
        updateSaveIndicator("guardado-local");
      }
    };

    if (inmediato) {
      ejecutarGuardadoRemoto();
    } else {
      saveTimer = setTimeout(ejecutarGuardadoRemoto, 300);
    }
  }

  // ==========================================================================
  // GESTIÓN DE PRODUCTOS E INVENTARIO
  // ==========================================================================

  function addProduct(prod) {
    if (!prod || !prod.nombre || !String(prod.nombre).trim()) {
      return null;
    }

    const nuevoId = "PROD-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
    const nuevoCodigo = (prod.codigo && String(prod.codigo).trim())
      ? String(prod.codigo).trim()
      : "FER-" + String(state.productos.length + 1).padStart(4, "0");

    const producto = {
      id: nuevoId,
      codigo: nuevoCodigo,
      nombre: String(prod.nombre).trim(),
      categoria: prod.categoria || "Otros",
      unidad: prod.unidad || "Unidad",
      precioCompra: Math.max(0, round2(prod.precioCompra)),
      precioVenta: Math.max(0, round2(prod.precioVenta)),
      stock: Math.max(0, round3(prod.stock)),
      stockMinimo: Math.max(0, round3(prod.stockMinimo >= 0 ? prod.stockMinimo : 5)),
      ubicacion: String(prod.ubicacion || "").trim(),
      fechaCreacion: new Date().toISOString()
    };

    state.productos.push(producto);
    persistir();
    notify();
    return producto;
  }

  // Importación masiva atómica (O(1) persistencia y re-renderizado)
  function addProductsBatch(prodsArray) {
    if (!Array.isArray(prodsArray) || prodsArray.length === 0) return 0;

    let agregados = 0;
    const now = new Date().toISOString();

    for (let i = 0; i < prodsArray.length; i++) {
      const p = prodsArray[i];
      if (!p || !p.nombre || !String(p.nombre).trim()) continue;

      const nuevoId = "PROD-" + Date.now() + "-" + Math.floor(Math.random() * 100000) + "-" + agregados;
      const nuevoCodigo = (p.codigo && String(p.codigo).trim())
        ? String(p.codigo).trim()
        : "FER-" + String(state.productos.length + 1).padStart(4, "0");

      state.productos.push({
        id: nuevoId,
        codigo: nuevoCodigo,
        nombre: String(p.nombre).trim(),
        categoria: p.categoria || "Otros",
        unidad: p.unidad || "Unidad",
        precioCompra: Math.max(0, round2(p.precioCompra)),
        precioVenta: Math.max(0, round2(p.precioVenta)),
        stock: Math.max(0, round3(p.stock)),
        stockMinimo: Math.max(0, round3(p.stockMinimo >= 0 ? p.stockMinimo : 5)),
        ubicacion: String(p.ubicacion || "").trim(),
        fechaCreacion: now
      });
      agregados++;
    }

    if (agregados > 0) {
      persistir(true);
      notify();
    }
    return agregados;
  }

  function updateProduct(id, datosActualizados) {
    const idx = state.productos.findIndex(p => p.id === id);
    if (idx === -1) return false;

    const actual = state.productos[idx];
    state.productos[idx] = {
      ...actual,
      ...datosActualizados,
      codigo: datosActualizados.codigo !== undefined ? String(datosActualizados.codigo).trim() : actual.codigo,
      nombre: datosActualizados.nombre !== undefined ? String(datosActualizados.nombre).trim() : actual.nombre,
      categoria: datosActualizados.categoria || actual.categoria,
      unidad: datosActualizados.unidad || actual.unidad,
      precioCompra: datosActualizados.precioCompra !== undefined ? Math.max(0, round2(datosActualizados.precioCompra)) : actual.precioCompra,
      precioVenta: datosActualizados.precioVenta !== undefined ? Math.max(0, round2(datosActualizados.precioVenta)) : actual.precioVenta,
      stock: datosActualizados.stock !== undefined ? Math.max(0, round3(datosActualizados.stock)) : actual.stock,
      stockMinimo: datosActualizados.stockMinimo !== undefined ? Math.max(0, round3(datosActualizados.stockMinimo)) : actual.stockMinimo,
      ubicacion: datosActualizados.ubicacion !== undefined ? String(datosActualizados.ubicacion).trim() : actual.ubicacion,
      fechaModificacion: new Date().toISOString()
    };

    persistir();
    notify();
    return state.productos[idx];
  }

  function deleteProduct(id) {
    const idx = state.productos.findIndex(p => p.id === id);
    if (idx === -1) return false;
    state.productos.splice(idx, 1);
    persistir();
    notify();
    return true;
  }

  /**
   * REQUISITO: "que el mismo pueda agregar el stock de sus productos"
   * Aumenta el stock del producto de forma atómica y precisa.
   */
  function addStock(id, cantidad, motivo = "", nuevoPrecioCompra = null) {
    const prod = state.productos.find(p => p.id === id);
    if (!prod) return { ok: false, error: "Producto no encontrado en inventario" };

    const cantNum = round3(cantidad);
    if (isNaN(cantNum) || cantNum <= 0) {
      return { ok: false, error: "La cantidad a ingresar debe ser un número positivo" };
    }

    prod.stock = round3(prod.stock + cantNum);

    if (nuevoPrecioCompra !== null && !isNaN(Number(nuevoPrecioCompra)) && Number(nuevoPrecioCompra) > 0) {
      prod.precioCompra = round2(nuevoPrecioCompra);
    }
    prod.fechaUltimoIngreso = new Date().toISOString();
    prod.ultimoMotivoIngreso = motivo ? String(motivo).trim() : "Reabastecimiento";

    persistir(true);
    notify();
    return { ok: true, nuevoStock: prod.stock, producto: prod };
  }

  // ==========================================================================
  // GESTIÓN DE VENTAS Y DESCUENTO ATÓMICO DE STOCK
  // ==========================================================================

  /**
   * REQUISITO: "y que al vender baje"
   * Valida stock en tiempo real y descuenta atómicamente cada ítem vendido.
   */
  function recordSale(datosVenta) {
    const { items, cliente, docCliente, tipoComprobante, metodoPago, montoRecibido } = datosVenta;

    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, error: "El carrito de ventas está vacío" };
    }

    // 1. Verificación previa de existencias
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const prod = state.productos.find(p => p.id === it.productoId);
      if (!prod) {
        return { ok: false, error: `El producto "${it.nombre}" no existe en el catálogo.` };
      }
      const cantReq = round3(it.cantidad);
      if (prod.stock < cantReq) {
        return {
          ok: false,
          error: `Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock} ${prod.unidad}, solicitado: ${cantReq}.`
        };
      }
    }

    // 2. Descuento de stock y cálculo financiero preciso
    const itemsProcesados = [];
    let totalCosto = 0;
    let totalVenta = 0;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const prod = state.productos.find(p => p.id === it.productoId);
      const cantidad = round3(it.cantidad);
      const precioVenta = round2(it.precioVenta);
      const precioCompra = round2(prod.precioCompra);
      const subtotal = round2(cantidad * precioVenta);
      const costo = round2(cantidad * precioCompra);
      const ganancia = round2(subtotal - costo);

      // DESCUENTO REAL DEL STOCK
      prod.stock = Math.max(0, round3(prod.stock - cantidad));

      totalVenta = round2(totalVenta + subtotal);
      totalCosto = round2(totalCosto + costo);

      itemsProcesados.push({
        productoId: prod.id,
        codigo: prod.codigo,
        nombre: prod.nombre,
        categoria: prod.categoria,
        unidad: prod.unidad,
        cantidad: cantidad,
        precioUnitario: precioVenta,
        precioCompra: precioCompra,
        subtotal: subtotal,
        ganancia: ganancia
      });
    }

    // Generar correlativo de comprobante
    const prefijo = tipoComprobante === "Factura" ? "F001" : tipoComprobante === "Boleta" ? "B001" : "NV01";
    const correlativo = String(state.ventas.length + 1).padStart(6, "0");
    const numeroComprobante = `${prefijo}-${correlativo}`;

    const totalRecibido = montoRecibido !== undefined && !isNaN(Number(montoRecibido)) ? round2(montoRecibido) : totalVenta;
    const vuelto = Math.max(0, round2(totalRecibido - totalVenta));

    const venta = {
      id: "VTA-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      numero: numeroComprobante,
      fecha: new Date().toISOString(),
      cliente: (cliente && String(cliente).trim()) ? String(cliente).trim() : "Cliente General",
      docCliente: (docCliente && String(docCliente).trim()) ? String(docCliente).trim() : "-",
      tipoComprobante: tipoComprobante || "Nota de Venta",
      metodoPago: metodoPago || "Efectivo",
      items: itemsProcesados,
      totalItems: round3(itemsProcesados.reduce((sum, it) => sum + it.cantidad, 0)),
      subtotal: totalVenta,
      total: totalVenta,
      totalCosto: totalCosto,
      gananciaTotal: round2(totalVenta - totalCosto),
      montoRecibido: totalRecibido,
      vuelto: vuelto,
      estado: "COMPLETADA"
    };

    state.ventas.unshift(venta);

    // Actualizar historial de cliente si aplica
    if (venta.cliente !== "Cliente General" || venta.docCliente !== "-") {
      actualizarOAgregarCliente(venta.cliente, venta.docCliente, venta.total);
    }

    persistir(true);
    notify();
    return { ok: true, venta };
  }

  function actualizarOAgregarCliente(nombre, doc, montoVenta) {
    const docClean = doc && doc !== "-" ? String(doc).trim() : "";
    const nombreClean = String(nombre).trim();

    let cliente = state.clientes.find(c =>
      (docClean && c.documento === docClean) ||
      (c.nombre && c.nombre.toLowerCase() === nombreClean.toLowerCase())
    );

    if (cliente) {
      cliente.comprasTotal = round2((cliente.comprasTotal || 0) + montoVenta);
      cliente.numeroCompras = (cliente.numeroCompras || 0) + 1;
      cliente.ultimaCompra = new Date().toISOString();
    } else {
      state.clientes.push({
        id: "CLI-" + Date.now(),
        nombre: nombreClean,
        documento: docClean || "-",
        comprasTotal: round2(montoVenta),
        numeroCompras: 1,
        ultimaCompra: new Date().toISOString()
      });
    }
  }

  /**
   * REVERTIR VENTA: Reintegra de inmediato todo el stock de los productos.
   */
  function annulSale(ventaId, motivo = "Anulación de venta") {
    const venta = state.ventas.find(v => v.id === ventaId);
    if (!venta) return { ok: false, error: "Venta no encontrada" };
    if (venta.estado === "ANULADA") return { ok: false, error: "Esta venta ya fue anulada previamente" };

    // Reposición atómica de stock
    for (let i = 0; i < venta.items.length; i++) {
      const it = venta.items[i];
      const prod = state.productos.find(p => p.id === it.productoId);
      if (prod) {
        prod.stock = round3(prod.stock + it.cantidad);
      }
    }

    venta.estado = "ANULADA";
    venta.motivoAnulacion = motivo;
    venta.fechaAnulacion = new Date().toISOString();

    persistir(true);
    notify();
    return { ok: true, venta };
  }

  // ==========================================================================
  // REQUISITO: "y de un resumen de las ventas"
  // ==========================================================================

  function getSalesSummary(filtroPeriodo = "hoy", fechaInicio = null, fechaFin = null) {
    const ahora = new Date();
    const hoyStr = ahora.toISOString().slice(0, 10);

    const ventasValidas = state.ventas.filter(v => v.estado !== "ANULADA");

    const ventasFiltradas = ventasValidas.filter(v => {
      const fechaVentaStr = v.fecha ? v.fecha.slice(0, 10) : "";

      if (filtroPeriodo === "hoy") {
        return fechaVentaStr === hoyStr;
      }
      if (filtroPeriodo === "ayer") {
        const ayer = new Date(ahora);
        ayer.setDate(ayer.getDate() - 1);
        return fechaVentaStr === ayer.toISOString().slice(0, 10);
      }
      if (filtroPeriodo === "semana") {
        const hace7Dias = new Date(ahora);
        hace7Dias.setDate(hace7Dias.getDate() - 7);
        return new Date(v.fecha) >= hace7Dias;
      }
      if (filtroPeriodo === "mes") {
        const mesActual = ahora.toISOString().slice(0, 7);
        return fechaVentaStr.startsWith(mesActual);
      }
      if (filtroPeriodo === "rango" && fechaInicio && fechaFin) {
        return fechaVentaStr >= fechaInicio && fechaVentaStr <= fechaFin;
      }
      return true; // "todos"
    });

    let totalVentas = 0;
    let totalCosto = 0;
    let totalGanancia = 0;
    let totalUnidades = 0;
    const metodosPago = {};
    const conteoProductos = {};

    for (let i = 0; i < ventasFiltradas.length; i++) {
      const v = ventasFiltradas[i];
      totalVentas = round2(totalVentas + (Number(v.total) || 0));
      totalCosto = round2(totalCosto + (Number(v.totalCosto) || 0));
      totalGanancia = round2(totalGanancia + (Number(v.gananciaTotal) || 0));

      const mp = v.metodoPago || "Efectivo";
      metodosPago[mp] = round2((metodosPago[mp] || 0) + (Number(v.total) || 0));

      for (let j = 0; j < (v.items || []).length; j++) {
        const it = v.items[j];
        totalUnidades = round3(totalUnidades + (Number(it.cantidad) || 0));
        const clave = it.nombre;
        if (!conteoProductos[clave]) {
          conteoProductos[clave] = {
            nombre: it.nombre,
            unidad: it.unidad || "Unidad",
            cantidad: 0,
            totalRecaudado: 0
          };
        }
        conteoProductos[clave].cantidad = round3(conteoProductos[clave].cantidad + (Number(it.cantidad) || 0));
        conteoProductos[clave].totalRecaudado = round2(conteoProductos[clave].totalRecaudado + (Number(it.subtotal) || 0));
      }
    }

    const topProductos = Object.values(conteoProductos)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 8);

    const cantidadTransacciones = ventasFiltradas.length;
    const ticketPromedio = cantidadTransacciones > 0 ? round2(totalVentas / cantidadTransacciones) : 0;
    const margenPorcentaje = totalVentas > 0 ? round2((totalGanancia / totalVentas) * 100) : 0;

    return {
      filtroPeriodo,
      totalVentas,
      totalCosto,
      totalGanancia,
      margenPorcentaje,
      cantidadTransacciones,
      totalUnidades,
      ticketPromedio,
      metodosPago,
      topProductos,
      ventas: ventasFiltradas
    };
  }

  // ==========================================================================
  // CONFIGURACIÓN Y RESPALDOS
  // ==========================================================================

  function updateConfig(nuevaConfig) {
    state.configuracion = {
      ...state.configuracion,
      ...nuevaConfig
    };
    persistir();
    notify();
  }

  function addCategory(categoria) {
    const c = String(categoria || "").trim();
    if (c && !state.categorias.includes(c)) {
      state.categorias.push(c);
      persistir();
      notify();
      return true;
    }
    return false;
  }

  // Descarga eficiente de respaldo usando Blob (previene límite de Data URI)
  function exportBackupJSON() {
    const raw = JSON.stringify(state, null, 2);
    const blob = new Blob([raw], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo_ferreteria_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  }

  function importBackupJSON(jsonData) {
    try {
      if (typeof jsonData === "string") {
        jsonData = JSON.parse(jsonData);
      }
      if (jsonData && typeof jsonData === "object") {
        state = {
          ...ESTADO_INICIAL,
          ...jsonData,
          configuracion: { ...ESTADO_INICIAL.configuracion, ...(jsonData.configuracion || {}) },
          categorias: Array.isArray(jsonData.categorias) && jsonData.categorias.length ? jsonData.categorias : ESTADO_INICIAL.categorias,
          unidades: Array.isArray(jsonData.unidades) && jsonData.unidades.length ? jsonData.unidades : ESTADO_INICIAL.unidades,
          productos: Array.isArray(jsonData.productos) ? jsonData.productos : [],
          ventas: Array.isArray(jsonData.ventas) ? jsonData.ventas : [],
          clientes: Array.isArray(jsonData.clientes) ? jsonData.clientes : []
        };
        persistir(true);
        notify();
        return { ok: true, productos: state.productos.length, ventas: state.ventas.length };
      }
      return { ok: false, error: "Estructura JSON no reconocida" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function limpiarTodo() {
    state = JSON.parse(JSON.stringify(ESTADO_INICIAL));
    persistir(true);
    notify();
  }

  return {
    init,
    subscribe,
    getState,
    setSaveCallback,
    addProduct,
    addProductsBatch,
    updateProduct,
    deleteProduct,
    addStock,
    recordSale,
    annulSale,
    getSalesSummary,
    updateConfig,
    addCategory,
    exportBackupJSON,
    importBackupJSON,
    limpiarTodo
  };
})();
