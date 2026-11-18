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
    clientes: [],
    movimientosStock: []
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
            clientes: Array.isArray(datos.clientes) ? datos.clientes : [],
            movimientosStock: Array.isArray(datos.movimientosStock) ? datos.movimientosStock : []
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
            clientes: Array.isArray(parsed.clientes) ? parsed.clientes : [],
            movimientosStock: Array.isArray(parsed.movimientosStock) ? parsed.movimientosStock : []
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
  // GESTIÓN DE PRODUCTOS, KARDEX E INVENTARIO AVANZADO
  // ==========================================================================

  /**
   * Registro en Kardex (Auditoría de Movimientos de Stock en tiempo real)
   */
  function registrarMovimientoStock({ productoId, codigo, nombre, tipo, cantidad, stockAnterior, stockNuevo, motivo = "", costoUnitario = 0, referencia = "" }) {
    if (!Array.isArray(state.movimientosStock)) {
      state.movimientosStock = [];
    }
    const mov = {
      id: "MOV-" + Date.now() + "-" + Math.floor(Math.random() * 100000),
      fecha: new Date().toISOString(),
      productoId: productoId || "",
      codigo: codigo || "",
      nombre: nombre || "",
      tipo: tipo || "Ajuste", // 'Ingreso por Compra', 'Salida por Venta', 'Ajuste de Conteo Físico', 'Merma / Daño', 'Devolución por Anulación', 'Ingreso Inicial'
      cantidad: round3(cantidad),
      stockAnterior: round3(stockAnterior),
      stockNuevo: round3(stockNuevo),
      costoUnitario: round2(costoUnitario),
      motivo: String(motivo || "").trim(),
      referencia: String(referencia || "").trim()
    };

    // Mantener hasta 5,000 movimientos en memoria para alto rendimiento
    state.movimientosStock.unshift(mov);
    if (state.movimientosStock.length > 5000) {
      state.movimientosStock.pop();
    }
    return mov;
  }

  function addProduct(prod) {
    if (!prod || !prod.nombre || !String(prod.nombre).trim()) {
      return null;
    }

    const nuevoId = "PROD-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
    const nuevoCodigo = (prod.codigo && String(prod.codigo).trim())
      ? String(prod.codigo).trim()
      : "FER-" + String(state.productos.length + 1).padStart(4, "0");

    const stockInicial = Math.max(0, round3(prod.stock));
    const pCompra = Math.max(0, round2(prod.precioCompra));

    const producto = {
      id: nuevoId,
      codigo: nuevoCodigo,
      codigoBarras: (prod.codigoBarras && String(prod.codigoBarras).trim()) || nuevoCodigo,
      nombre: String(prod.nombre).trim(),
      categoria: prod.categoria || "Otros",
      marca: String(prod.marca || "").trim(),
      unidad: prod.unidad || "Unidad",
      precioCompra: pCompra,
      precioVenta: Math.max(0, round2(prod.precioVenta)),
      precioMayor: prod.precioMayor !== undefined && Number(prod.precioMayor) > 0 ? round2(prod.precioMayor) : 0,
      stock: stockInicial,
      stockMinimo: Math.max(0, round3(prod.stockMinimo >= 0 ? prod.stockMinimo : 5)),
      stockMaximo: prod.stockMaximo !== undefined && Number(prod.stockMaximo) > 0 ? round3(prod.stockMaximo) : 0,
      ubicacion: String(prod.ubicacion || "").trim(),
      descripcion: String(prod.descripcion || "").trim(),
      permiteDecimales: prod.permiteDecimales !== undefined ? Boolean(prod.permiteDecimales) : true,
      estado: prod.estado === "inactivo" ? "inactivo" : "activo",
      fechaCreacion: new Date().toISOString(),
      fechaModificacion: new Date().toISOString()
    };

    state.productos.push(producto);

    // Registro inicial en Kardex si tiene stock
    if (stockInicial > 0) {
      registrarMovimientoStock({
        productoId: nuevoId,
        codigo: nuevoCodigo,
        nombre: producto.nombre,
        tipo: "Ingreso Inicial",
        cantidad: stockInicial,
        stockAnterior: 0,
        stockNuevo: stockInicial,
        costoUnitario: pCompra,
        motivo: "Inventario inicial al crear producto",
        referencia: "Alta de Producto"
      });
    }

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

      const stockVal = Math.max(0, round3(p.stock));
      const pCompra = Math.max(0, round2(p.precioCompra));

      const prodObj = {
        id: nuevoId,
        codigo: nuevoCodigo,
        codigoBarras: (p.codigoBarras && String(p.codigoBarras).trim()) || nuevoCodigo,
        nombre: String(p.nombre).trim(),
        categoria: p.categoria || "Otros",
        marca: String(p.marca || "").trim(),
        unidad: p.unidad || "Unidad",
        precioCompra: pCompra,
        precioVenta: Math.max(0, round2(p.precioVenta)),
        precioMayor: p.precioMayor ? round2(p.precioMayor) : 0,
        stock: stockVal,
        stockMinimo: Math.max(0, round3(p.stockMinimo >= 0 ? p.stockMinimo : 5)),
        stockMaximo: p.stockMaximo ? round3(p.stockMaximo) : 0,
        ubicacion: String(p.ubicacion || "").trim(),
        descripcion: String(p.descripcion || "").trim(),
        permiteDecimales: p.permiteDecimales !== undefined ? Boolean(p.permiteDecimales) : true,
        estado: p.estado === "inactivo" ? "inactivo" : "activo",
        fechaCreacion: now,
        fechaModificacion: now
      };

      state.productos.push(prodObj);

      if (stockVal > 0) {
        registrarMovimientoStock({
          productoId: nuevoId,
          codigo: nuevoCodigo,
          nombre: prodObj.nombre,
          tipo: "Ingreso Inicial",
          cantidad: stockVal,
          stockAnterior: 0,
          stockNuevo: stockVal,
          costoUnitario: pCompra,
          motivo: "Carga masiva / Importación de inventario",
          referencia: "Importación Excel"
        });
      }
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
    const nuevoStock = datosActualizados.stock !== undefined ? Math.max(0, round3(datosActualizados.stock)) : actual.stock;
    const stockAnterior = actual.stock;

    state.productos[idx] = {
      ...actual,
      ...datosActualizados,
      codigo: datosActualizados.codigo !== undefined ? String(datosActualizados.codigo).trim() : actual.codigo,
      codigoBarras: datosActualizados.codigoBarras !== undefined ? String(datosActualizados.codigoBarras).trim() : (actual.codigoBarras || actual.codigo),
      nombre: datosActualizados.nombre !== undefined ? String(datosActualizados.nombre).trim() : actual.nombre,
      categoria: datosActualizados.categoria || actual.categoria,
      marca: datosActualizados.marca !== undefined ? String(datosActualizados.marca).trim() : (actual.marca || ""),
      unidad: datosActualizados.unidad || actual.unidad,
      precioCompra: datosActualizados.precioCompra !== undefined ? Math.max(0, round2(datosActualizados.precioCompra)) : actual.precioCompra,
      precioVenta: datosActualizados.precioVenta !== undefined ? Math.max(0, round2(datosActualizados.precioVenta)) : actual.precioVenta,
      precioMayor: datosActualizados.precioMayor !== undefined ? Math.max(0, round2(datosActualizados.precioMayor)) : (actual.precioMayor || 0),
      stock: nuevoStock,
      stockMinimo: datosActualizados.stockMinimo !== undefined ? Math.max(0, round3(datosActualizados.stockMinimo)) : actual.stockMinimo,
      stockMaximo: datosActualizados.stockMaximo !== undefined ? Math.max(0, round3(datosActualizados.stockMaximo)) : (actual.stockMaximo || 0),
      ubicacion: datosActualizados.ubicacion !== undefined ? String(datosActualizados.ubicacion).trim() : actual.ubicacion,
      descripcion: datosActualizados.descripcion !== undefined ? String(datosActualizados.descripcion).trim() : (actual.descripcion || ""),
      permiteDecimales: datosActualizados.permiteDecimales !== undefined ? Boolean(datosActualizados.permiteDecimales) : actual.permiteDecimales,
      estado: datosActualizados.estado !== undefined ? (datosActualizados.estado === "inactivo" ? "inactivo" : "activo") : (actual.estado || "activo"),
      fechaModificacion: new Date().toISOString()
    };

    // Si el stock cambió directamente en la edición, registrar movimiento de ajuste en Kardex
    if (stockAnterior !== nuevoStock) {
      registrarMovimientoStock({
        productoId: actual.id,
        codigo: actual.codigo,
        nombre: state.productos[idx].nombre,
        tipo: "Ajuste de Conteo Físico",
        cantidad: round3(nuevoStock - stockAnterior),
        stockAnterior: stockAnterior,
        stockNuevo: nuevoStock,
        costoUnitario: state.productos[idx].precioCompra,
        motivo: "Ajuste directo al editar producto",
        referencia: "Edición Manual"
      });
    }

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

  function duplicateProduct(id) {
    const prod = state.productos.find(p => p.id === id);
    if (!prod) return null;

    const correlativo = String(state.productos.length + 1).padStart(4, "0");
    const nuevoCodigo = "FER-" + correlativo;
    const now = new Date().toISOString();

    const clon = {
      ...JSON.parse(JSON.stringify(prod)),
      id: "PROD-" + Date.now() + "-" + Math.floor(Math.random() * 100000),
      codigo: nuevoCodigo,
      codigoBarras: nuevoCodigo,
      nombre: prod.nombre + " (Copia)",
      stock: 0,
      fechaCreacion: now,
      fechaModificacion: now
    };

    state.productos.push(clon);
    persistir(true);
    notify();
    return clon;
  }

  /**
   * REQUISITO: "que el mismo pueda agregar el stock de sus productos"
   * Aumenta el stock del producto de forma atómica y precisa, con registro en Kardex.
   */
  function addStock(id, cantidad, motivo = "", nuevoPrecioCompra = null, tipo = "Ingreso por Compra") {
    const prod = state.productos.find(p => p.id === id);
    if (!prod) return { ok: false, error: "Producto no encontrado en inventario" };

    const cantNum = round3(cantidad);
    if (isNaN(cantNum) || cantNum <= 0) {
      return { ok: false, error: "La cantidad a ingresar debe ser un número positivo" };
    }

    const stockAnterior = prod.stock;
    prod.stock = round3(prod.stock + cantNum);

    if (nuevoPrecioCompra !== null && !isNaN(Number(nuevoPrecioCompra)) && Number(nuevoPrecioCompra) > 0) {
      prod.precioCompra = round2(nuevoPrecioCompra);
    }
    prod.fechaUltimoIngreso = new Date().toISOString();
    prod.ultimoMotivoIngreso = motivo ? String(motivo).trim() : "Reabastecimiento";

    // Registrar en Kardex
    registrarMovimientoStock({
      productoId: prod.id,
      codigo: prod.codigo,
      nombre: prod.nombre,
      tipo: tipo || "Ingreso por Compra",
      cantidad: cantNum,
      stockAnterior: stockAnterior,
      stockNuevo: prod.stock,
      costoUnitario: prod.precioCompra,
      motivo: motivo || "Reabastecimiento de existencias",
      referencia: "Entrada de Almacén"
    });

    persistir(true);
    notify();
    return { ok: true, nuevoStock: prod.stock, producto: prod };
  }

  /**
   * Ajuste de stock por inventario físico / merma / conteo
   */
  function adjustStock(id, nuevoStock, motivo = "Conteo Físico", tipo = "Ajuste de Conteo Físico") {
    const prod = state.productos.find(p => p.id === id);
    if (!prod) return { ok: false, error: "Producto no encontrado en inventario" };

    const stockFinal = Math.max(0, round3(nuevoStock));
    const stockAnterior = prod.stock;
    const delta = round3(stockFinal - stockAnterior);

    prod.stock = stockFinal;
    prod.fechaModificacion = new Date().toISOString();

    registrarMovimientoStock({
      productoId: prod.id,
      codigo: prod.codigo,
      nombre: prod.nombre,
      tipo: tipo || "Ajuste de Conteo Físico",
      cantidad: delta,
      stockAnterior: stockAnterior,
      stockNuevo: stockFinal,
      costoUnitario: prod.precioCompra,
      motivo: motivo || "Ajuste de inventario",
      referencia: "Auditoría de Stock"
    });

    persistir(true);
    notify();
    return { ok: true, nuevoStock: prod.stock, producto: prod };
  }

  // ==========================================================================
  // OPERACIONES MASIVAS (BULK ACTIONS TIPO SHOPIFY/SQUARE)
  // ==========================================================================

  function deleteProductsBatch(idsArray) {
    if (!Array.isArray(idsArray) || idsArray.length === 0) return 0;
    const set = new Set(idsArray);
    const totalAntes = state.productos.length;
    state.productos = state.productos.filter(p => !set.has(p.id));
    const eliminados = totalAntes - state.productos.length;
    if (eliminados > 0) {
      persistir(true);
      notify();
    }
    return eliminados;
  }

  function updateCategoryBatch(idsArray, newCategory) {
    if (!Array.isArray(idsArray) || idsArray.length === 0 || !newCategory) return 0;
    const set = new Set(idsArray);
    let actualizados = 0;
    const now = new Date().toISOString();
    state.productos.forEach(p => {
      if (set.has(p.id)) {
        p.categoria = newCategory;
        p.fechaModificacion = now;
        actualizados++;
      }
    });
    if (actualizados > 0) {
      persistir(true);
      notify();
    }
    return actualizados;
  }

  function adjustPricesBatch(idsArray, { tipo = "porcentaje", valor = 0, redondear = true }) {
    if (!Array.isArray(idsArray) || idsArray.length === 0) return 0;
    const set = new Set(idsArray);
    let actualizados = 0;
    const now = new Date().toISOString();
    const val = Number(valor) || 0;

    state.productos.forEach(p => {
      if (set.has(p.id)) {
        let nuevoPrecio = p.precioVenta;
        if (tipo === "porcentaje") {
          nuevoPrecio = p.precioVenta * (1 + val / 100);
        } else {
          nuevoPrecio = p.precioVenta + val;
        }
        nuevoPrecio = Math.max(0, round2(nuevoPrecio));
        if (redondear) {
          nuevoPrecio = round2(Math.round(nuevoPrecio * 10) / 10);
        }
        p.precioVenta = nuevoPrecio;
        p.fechaModificacion = now;
        actualizados++;
      }
    });
    if (actualizados > 0) {
      persistir(true);
      notify();
    }
    return actualizados;
  }

  function changeStatusBatch(idsArray, nuevoEstado) {
    if (!Array.isArray(idsArray) || idsArray.length === 0) return 0;
    const estadoValido = nuevoEstado === "inactivo" ? "inactivo" : "activo";
    const set = new Set(idsArray);
    let actualizados = 0;
    const now = new Date().toISOString();
    state.productos.forEach(p => {
      if (set.has(p.id)) {
        p.estado = estadoValido;
        p.fechaModificacion = now;
        actualizados++;
      }
    });
    if (actualizados > 0) {
      persistir(true);
      notify();
    }
    return actualizados;
  }

  function getStockMovements(productoId = null, limite = 300) {
    let movs = state.movimientosStock || [];
    if (productoId) {
      movs = movs.filter(m => m.productoId === productoId);
    }
    return movs.slice(0, limite);
  }

  function getKpiInventario() {
    const prods = state.productos || [];
    const total = prods.length;
    const activos = prods.filter(p => p.estado !== "inactivo").length;
    const inactivos = total - activos;

    let valorCosto = 0;
    let valorVenta = 0;
    let bajoStock = 0;
    let agotados = 0;

    prods.forEach(p => {
      const s = Number(p.stock) || 0;
      const sMin = Number(p.stockMinimo) || 5;
      const pc = Number(p.precioCompra) || 0;
      const pv = Number(p.precioVenta) || 0;

      valorCosto += s * pc;
      valorVenta += s * pv;

      if (s <= 0) {
        agotados++;
      } else if (s <= sMin) {
        bajoStock++;
      }
    });

    const margenGlobal = valorCosto > 0 ? (((valorVenta - valorCosto) / valorCosto) * 100) : 0;

    return {
      total,
      activos,
      inactivos,
      valorCosto: round2(valorCosto),
      valorVenta: round2(valorVenta),
      margenGlobal: round2(margenGlobal),
      bajoStock,
      agotados
    };
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
      const stockAnterior = prod.stock;
      prod.stock = Math.max(0, round3(prod.stock - cantidad));

      totalVenta = round2(totalVenta + subtotal);
      totalCosto = round2(totalCosto + costo);

      registrarMovimientoStock({
        productoId: prod.id,
        codigo: prod.codigo,
        nombre: prod.nombre,
        tipo: "Salida por Venta",
        cantidad: -cantidad,
        stockAnterior: stockAnterior,
        stockNuevo: prod.stock,
        costoUnitario: precioCompra,
        motivo: `Venta ${tipoComprobante || 'POS'}`,
        referencia: cliente && cliente !== "Cliente General" ? `Cliente: ${cliente}` : "Venta Mostrador"
      });

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
        const stockAnterior = prod.stock;
        prod.stock = round3(prod.stock + it.cantidad);
        registrarMovimientoStock({
          productoId: prod.id,
          codigo: prod.codigo,
          nombre: prod.nombre,
          tipo: "Devolución por Anulación",
          cantidad: it.cantidad,
          stockAnterior: stockAnterior,
          stockNuevo: prod.stock,
          costoUnitario: it.precioCompra || prod.precioCompra,
          motivo: motivo || "Anulación de venta",
          referencia: venta.numero
        });
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

  function removeCategory(categoria) {
    const idx = state.categorias.indexOf(categoria);
    if (idx !== -1 && state.categorias.length > 1) {
      state.categorias.splice(idx, 1);
      persistir();
      notify();
      return true;
    }
    return false;
  }

  function addUnit(unidad) {
    const u = String(unidad || "").trim();
    if (u && !state.unidades.includes(u)) {
      state.unidades.push(u);
      persistir();
      notify();
      return true;
    }
    return false;
  }

  function removeUnit(unidad) {
    const idx = state.unidades.indexOf(unidad);
    if (idx !== -1 && state.unidades.length > 1) {
      state.unidades.splice(idx, 1);
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
          clientes: Array.isArray(jsonData.clientes) ? jsonData.clientes : [],
          movimientosStock: Array.isArray(jsonData.movimientosStock) ? jsonData.movimientosStock : []
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
    duplicateProduct,
    addStock,
    adjustStock,
    deleteProductsBatch,
    updateCategoryBatch,
    adjustPricesBatch,
    changeStatusBatch,
    getStockMovements,
    getKpiInventario,
    registrarMovimientoStock,
    recordSale,
    annulSale,
    getSalesSummary,
    updateConfig,
    addCategory,
    removeCategory,
    addUnit,
    removeUnit,
    exportBackupJSON,
    importBackupJSON,
    limpiarTodo
  };
})();
