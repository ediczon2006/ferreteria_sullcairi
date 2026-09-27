/**
 * ============================================================================
 * STORE CENTRALIZADO - FERRETERÍA (js/store.js)
 * Manejo de estado, inventario, stock automático, ventas y reportes
 * ============================================================================
 */

const Store = (() => {
  // Estado base limpio - SIN DATOS DEMO
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

  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  function notify() {
    const currentState = getState();
    listeners.forEach(fn => {
      try { fn(currentState); } catch (e) { console.error("Error en listener:", e); }
    });
  }

  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  function setSaveCallback(cb) {
    saveStateCallback = cb;
  }

  function updateSaveIndicator(status) {
    if (typeof saveStateCallback === 'function') {
      saveStateCallback(status);
    }
  }

  // Carga inicial
  async function init() {
    updateSaveIndicator("guardando");
    let cargado = false;

    // 1. Intentar cargar desde el backend python
    try {
      const res = await fetch('/api/datos', { cache: 'no-store' });
      if (res.ok) {
        const datos = await res.json();
        if (datos && typeof datos === 'object') {
          // Fusionar con defaults
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
          cargado = true;
          guardarEnLocalStorage();
          updateSaveIndicator("guardado");
          notify();
          return;
        }
      }
    } catch (e) {
      console.warn("Modo local/offline (servidor no detectado):", e.message);
    }

    // 2. Si falló el servidor, leer de localStorage
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
          cargado = true;
        }
      } catch (err) {
        console.error("Error al parsear localStorage:", err);
      }
    }

    if (!cargado) {
      state = JSON.parse(JSON.stringify(ESTADO_INICIAL));
      guardarEnLocalStorage();
    }

    updateSaveIndicator("guardado");
    notify();
  }

  function guardarEnLocalStorage() {
    try {
      localStorage.setItem('ferreteria_datos_v1', JSON.stringify(state));
    } catch (e) {
      console.error("Error guardando en localStorage:", e);
    }
  }

  // Guardar datos (localmente y en backend si está activo)
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
        // En modo cliente estático sin python, localstorage es el soporte
        updateSaveIndicator("guardado-local");
      }
    };

    if (inmediato) {
      ejecutarGuardadoRemoto();
    } else {
      saveTimer = setTimeout(ejecutarGuardadoRemoto, 400);
    }
  }

  // ==========================================================================
  // GESTIÓN DE PRODUCTOS E INVENTARIO
  // ==========================================================================

  function addProduct(prod) {
    const nuevoId = "PROD-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    const nuevoCodigo = (prod.codigo && prod.codigo.trim()) 
      ? prod.codigo.trim() 
      : "FER-" + String(state.productos.length + 1).padStart(4, "0");

    const producto = {
      id: nuevoId,
      codigo: nuevoCodigo,
      nombre: prod.nombre.trim(),
      categoria: prod.categoria || "Otros",
      unidad: prod.unidad || "Unidad",
      precioCompra: Number(prod.precioCompra) || 0,
      precioVenta: Number(prod.precioVenta) || 0,
      stock: Number(prod.stock) || 0,
      stockMinimo: Number(prod.stockMinimo) >= 0 ? Number(prod.stockMinimo) : 5,
      ubicacion: (prod.ubicacion || "").trim(),
      fechaCreacion: new Date().toISOString()
    };

    state.productos.push(producto);
    persistir();
    notify();
    return producto;
  }

  function updateProduct(id, datosActualizados) {
    const idx = state.productos.findIndex(p => p.id === id);
    if (idx === -1) return false;

    state.productos[idx] = {
      ...state.productos[idx],
      ...datosActualizados,
      precioCompra: Number(datosActualizados.precioCompra ?? state.productos[idx].precioCompra),
      precioVenta: Number(datosActualizados.precioVenta ?? state.productos[idx].precioVenta),
      stock: Number(datosActualizados.stock ?? state.productos[idx].stock),
      stockMinimo: Number(datosActualizados.stockMinimo ?? state.productos[idx].stockMinimo),
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
   * REQUISITO DEL USUARIO: "que el mismo pueda agregar el stock de sus productos"
   * Aumenta el stock del producto de manera ágil (Entrada de mercadería / Ajuste).
   */
  function addStock(id, cantidad, motivo = "", nuevoPrecioCompra = null) {
    const prod = state.productos.find(p => p.id === id);
    if (!prod) return { ok: false, error: "Producto no encontrado" };

    const cantNum = Number(cantidad);
    if (isNaN(cantNum) || cantNum <= 0) {
      return { ok: false, error: "La cantidad debe ser un número mayor a cero" };
    }

    prod.stock = Number(prod.stock) + cantNum;
    if (nuevoPrecioCompra !== null && !isNaN(Number(nuevoPrecioCompra)) && Number(nuevoPrecioCompra) > 0) {
      prod.precioCompra = Number(nuevoPrecioCompra);
    }
    prod.fechaUltimoIngreso = new Date().toISOString();

    persistir(true);
    notify();
    return { ok: true, nuevoStock: prod.stock, producto: prod };
  }

  // ==========================================================================
  // GESTIÓN DE VENTAS Y DESCUENTO AUTOMÁTICO DE STOCK
  // ==========================================================================

  /**
   * REQUISITO DEL USUARIO: "y que al vender baje"
   * Registra una venta, descuenta inmediatamente el stock de cada producto vendido,
   * y guarda el registro para el resumen de ventas.
   */
  function recordSale(datosVenta) {
    const { items, cliente, docCliente, tipoComprobante, metodoPago, montoRecibido } = datosVenta;

    if (!items || !items.length) {
      return { ok: false, error: "No hay productos en la venta" };
    }

    // 1. Validar existencias de stock antes de procesar
    for (const item of items) {
      const prod = state.productos.find(p => p.id === item.productoId);
      if (!prod) {
        return { ok: false, error: `El producto "${item.nombre}" ya no existe en el catálogo.` };
      }
      if (prod.stock < item.cantidad) {
        return { 
          ok: false, 
          error: `Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock} ${prod.unidad}, solicitó: ${item.cantidad}.` 
        };
      }
    }

    // 2. Descontar el stock de cada producto
    const itemsProcesados = [];
    let totalCosto = 0;
    let totalVenta = 0;

    for (const item of items) {
      const prod = state.productos.find(p => p.id === item.productoId);
      const cantidad = Number(item.cantidad);
      const precioVenta = Number(item.precioVenta);
      const precioCompra = Number(prod.precioCompra) || 0;
      const subtotal = cantidad * precioVenta;
      const costo = cantidad * precioCompra;
      const ganancia = subtotal - costo;

      // ¡AQUÍ SE DESCUENTA EL STOCK DIRECTAMENTE!
      prod.stock = Math.max(0, Number(prod.stock) - cantidad);

      totalVenta += subtotal;
      totalCosto += costo;

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

    // 3. Generar número de comprobante correlativo
    const anio = new Date().getFullYear();
    const prefijo = tipoComprobante === "Factura" ? "F001" : tipoComprobante === "Boleta" ? "B001" : "NV01";
    const correlativo = String(state.ventas.length + 1).padStart(6, "0");
    const numeroComprobante = `${prefijo}-${correlativo}`;

    const totalRecibido = Number(montoRecibido) || totalVenta;
    const vuelto = Math.max(0, totalRecibido - totalVenta);

    const venta = {
      id: "VTA-" + Date.now(),
      numero: numeroComprobante,
      fecha: new Date().toISOString(),
      cliente: (cliente && cliente.trim()) ? cliente.trim() : "Cliente General",
      docCliente: (docCliente && docCliente.trim()) ? docCliente.trim() : "-",
      tipoComprobante: tipoComprobante || "Nota de Venta",
      metodoPago: metodoPago || "Efectivo",
      items: itemsProcesados,
      totalItems: itemsProcesados.reduce((sum, it) => sum + it.cantidad, 0),
      subtotal: totalVenta,
      total: totalVenta,
      totalCosto: totalCosto,
      gananciaTotal: totalVenta - totalCosto,
      montoRecibido: totalRecibido,
      vuelto: vuelto,
      estado: "COMPLETADA"
    };

    // Agregar al inicio del historial de ventas
    state.ventas.unshift(venta);

    // Si se especificó un cliente con nombre o documento, registrar/actualizar en clientes
    if (venta.cliente !== "Cliente General" || venta.docCliente !== "-") {
      actualizarOAgregarCliente(venta.cliente, venta.docCliente, venta.total);
    }

    persistir(true);
    notify();
    return { ok: true, venta };
  }

  function actualizarOAgregarCliente(nombre, doc, montoVenta) {
    let cliente = state.clientes.find(c => (doc !== "-" && c.documento === doc) || c.nombre.toLowerCase() === nombre.toLowerCase());
    if (cliente) {
      cliente.comprasTotal = (cliente.comprasTotal || 0) + montoVenta;
      cliente.numeroCompras = (cliente.numeroCompras || 0) + 1;
      cliente.ultimaCompra = new Date().toISOString();
    } else {
      state.clientes.push({
        id: "CLI-" + Date.now(),
        nombre: nombre,
        documento: doc,
        telefono: "",
        direccion: "",
        comprasTotal: montoVenta,
        numeroCompras: 1,
        ultimaCompra: new Date().toISOString()
      });
    }
  }

  /**
   * Anular venta: REVIERTE y REGRESA EL STOCK a los productos
   */
  function annulSale(ventaId, motivo = "Anulación de venta") {
    const venta = state.ventas.find(v => v.id === ventaId);
    if (!venta) return { ok: false, error: "Venta no encontrada" };
    if (venta.estado === "ANULADA") return { ok: false, error: "Esta venta ya fue anulada previamente" };

    // Reponer stock
    for (const item of venta.items) {
      const prod = state.productos.find(p => p.id === item.productoId);
      if (prod) {
        prod.stock = Number(prod.stock) + Number(item.cantidad);
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
  // REQUISITO DEL USUARIO: "y de un resumen de las ventas"
  // ==========================================================================

  function getSalesSummary(filtroPeriodo = "hoy", fechaInicio = null, fechaFin = null) {
    const ahora = new Date();
    const hoyStr = ahora.toISOString().slice(0, 10);

    const ventasValidas = state.ventas.filter(v => v.estado !== "ANULADA");

    // Filtrar por fechas
    const ventasFiltradas = ventasValidas.filter(v => {
      const fechaVenta = new Date(v.fecha);
      const fechaVentaStr = v.fecha.slice(0, 10);

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
        return fechaVenta >= hace7Dias;
      }
      if (filtroPeriodo === "mes") {
        const mesActual = ahora.toISOString().slice(0, 7);
        return v.fecha.startsWith(mesActual);
      }
      if (filtroPeriodo === "rango" && fechaInicio && fechaFin) {
        return fechaVentaStr >= fechaInicio && fechaVentaStr <= fechaFin;
      }
      // "todos"
      return true;
    });

    let totalVentas = 0;
    let totalCosto = 0;
    let totalGanancia = 0;
    let totalUnidades = 0;
    const metodosPago = {};
    const conteoProductos = {};

    for (const v of ventasFiltradas) {
      totalVentas += Number(v.total) || 0;
      totalCosto += Number(v.totalCosto) || 0;
      totalGanancia += Number(v.gananciaTotal) || 0;

      // Métodos de pago
      const mp = v.metodoPago || "Efectivo";
      metodosPago[mp] = (metodosPago[mp] || 0) + (Number(v.total) || 0);

      // Conteo por producto
      for (const it of v.items || []) {
        totalUnidades += Number(it.cantidad) || 0;
        const clave = it.nombre;
        if (!conteoProductos[clave]) {
          conteoProductos[clave] = {
            nombre: it.nombre,
            unidad: it.unidad,
            cantidad: 0,
            totalRecaudado: 0
          };
        }
        conteoProductos[clave].cantidad += Number(it.cantidad) || 0;
        conteoProductos[clave].totalRecaudado += Number(it.subtotal) || 0;
      }
    }

    // Top productos vendidos
    const topProductos = Object.values(conteoProductos)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 8);

    const cantidadTransacciones = ventasFiltradas.length;
    const ticketPromedio = cantidadTransacciones > 0 ? (totalVentas / cantidadTransacciones) : 0;
    const margenPorcentaje = totalVentas > 0 ? ((totalGanancia / totalVentas) * 100) : 0;

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
  // CONFIGURACIÓN Y UTILIDADES
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
    const c = categoria.trim();
    if (c && !state.categorias.includes(c)) {
      state.categorias.push(c);
      persistir();
      notify();
      return true;
    }
    return false;
  }

  function exportBackupJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `respaldo_ferreteria_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
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
          productos: Array.isArray(jsonData.productos) ? jsonData.productos : [],
          ventas: Array.isArray(jsonData.ventas) ? jsonData.ventas : [],
          clientes: Array.isArray(jsonData.clientes) ? jsonData.clientes : []
        };
        persistir(true);
        notify();
        return { ok: true, productos: state.productos.length, ventas: state.ventas.length };
      }
      return { ok: false, error: "Formato no válido" };
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
