/**
 * ============================================================================
 * CONTROLADOR PRINCIPAL DE LA APLICACIÓN (js/app.js)
 * Sistema de Gestión y Punto de Venta para Ferretería - Edición PRO
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  // Estado local del Punto de Venta
  let carrito = [];
  let categoriaSeleccionadaPOS = "";
  let busquedaPOS = "";
  let periodoVentasSeleccionado = "hoy";
  let filtroStockInventario = "";
  let productoEnEdicion = null;
  let productoParaStock = null;
  let ventaActivaParaTicket = null;

  // Iconos amigables por categoría de ferretería
  const ICONOS_CATEGORIAS = {
    "Materiales de Construcción": "🧱",
    "Herramientas Manuales": "🔧",
    "Herramientas Eléctricas": "⚙️",
    "Gasfitería y Tuberías": "🚿",
    "Electricidad e Iluminación": "⚡",
    "Pinturas y Adhesivos": "🎨",
    "Tornillería y Fijaciones": "🔩",
    "Cerrajería y Candados": "🔒",
    "Seguridad Industrial (EPP)": "🦺",
    "Otros": "📦"
  };

  // Elementos principales de la interfaz
  const navBotones = document.querySelectorAll('.nav-btn');
  const secciones = document.querySelectorAll('.modulo-seccion');
  const badgeEstado = document.getElementById('badge-estado-guardado');
  const textoEstado = document.getElementById('texto-estado-guardado');

  // Iniciar reloj digital en tiempo real
  iniciarReloj();

  function iniciarReloj() {
    const el = document.getElementById('reloj-texto');
    if (!el) return;
    const actualizar = () => {
      const ahora = new Date();
      el.textContent = ahora.toLocaleTimeString("es-PE");
    };
    actualizar();
    setInterval(actualizar, 1000);
  }

  // ==========================================================================
  // INICIALIZACIÓN Y SUSCRIPCIÓN AL STORE
  // ==========================================================================

  Store.setSaveCallback((estado) => {
    if (!badgeEstado || !textoEstado) return;
    badgeEstado.className = 'badge-estado ' + estado;
    if (estado === 'guardado') {
      textoEstado.textContent = 'En Línea';
    } else if (estado === 'guardando') {
      textoEstado.textContent = 'Guardando...';
    } else if (estado === 'guardado-local') {
      textoEstado.textContent = 'Modo Local';
    } else {
      textoEstado.textContent = 'Sin guardar';
    }
  });

  Store.subscribe((state) => {
    renderPOS(state);
    renderInventario(state);
    renderResumenVentas(state);
    renderConfiguracion(state);
    actualizarNombreEmpresaCabecera(state);
    actualizarAlertasNavegacion(state);
  });

  Store.init();

  function actualizarNombreEmpresaCabecera(state) {
    const el = document.getElementById('cabecera-nombre-empresa');
    if (el && state.configuracion && state.configuracion.empresa) {
      el.textContent = state.configuracion.empresa;
    }
  }

  function actualizarAlertasNavegacion(state) {
    const badge = document.getElementById('nav-badge-stock-alerta');
    if (!badge) return;
    const prods = state.productos || [];
    const criticos = prods.filter(p => p.stock <= (p.stockMinimo || 5)).length;
    if (criticos > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = criticos;
    } else {
      badge.style.display = 'none';
    }
  }

  // ==========================================================================
  // NAVEGACIÓN ENTRE MÓDULOS (3 WORKSPACES CLAVE)
  // ==========================================================================

  navBotones.forEach(btn => {
    btn.addEventListener('click', () => {
      const seccionDestino = btn.getAttribute('data-seccion');
      if (seccionDestino) cambiarSeccion(seccionDestino);
    });
  });

  function cambiarSeccion(seccionId) {
    navBotones.forEach(b => {
      b.classList.toggle('activo', b.getAttribute('data-seccion') === seccionId);
    });
    secciones.forEach(sec => {
      sec.classList.toggle('activo', sec.id === `seccion-${seccionId}`);
    });

    if (seccionId === 'pos') {
      const inputBusq = document.getElementById('pos-buscar-input');
      if (inputBusq) inputBusq.focus();
    }
  }

  // Atajos de teclado profesionales (F2: Buscar, F4: Cobrar, Alt+1/2/3: Módulos)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      cambiarSeccion('pos');
      document.getElementById('pos-buscar-input')?.focus();
    } else if (e.key === 'F4') {
      e.preventDefault();
      const btnCobrar = document.getElementById('btn-carrito-cobrar');
      if (btnCobrar && !btnCobrar.disabled) btnCobrar.click();
    } else if (e.altKey && e.key === '1') {
      e.preventDefault();
      cambiarSeccion('pos');
    } else if (e.altKey && e.key === '2') {
      e.preventDefault();
      cambiarSeccion('inventario');
    } else if (e.altKey && e.key === '3') {
      e.preventDefault();
      cambiarSeccion('resumen');
    }
  });

  // Botón Ajustes / Configuración en cabecera
  const btnAbrirConfiguracion = document.getElementById('btn-abrir-configuracion');
  if (btnAbrirConfiguracion) {
    btnAbrirConfiguracion.addEventListener('click', () => {
      document.getElementById('modal-configuracion')?.classList.add('activo');
    });
  }

  // ==========================================================================
  // MÓDULO 1: PUNTO DE VENTA (POS / CAJA)
  // ==========================================================================

  function renderPOS(state) {
    const moneda = (state.configuracion && state.configuracion.moneda) || "S/";
    const productos = state.productos || [];
    const categorias = state.categorias || [];

    // Renderizar categorías como chips con iconos
    const contenedorChips = document.getElementById('pos-categorias-chips');
    if (contenedorChips) {
      contenedorChips.innerHTML = `
        <button class="chip-cat ${categoriaSeleccionadaPOS === "" ? 'activo' : ''}" data-cat="">
          <span>🏷️</span> Todas
        </button>
        ${categorias.map(cat => {
          const icono = ICONOS_CATEGORIAS[cat] || "📦";
          return `
            <button class="chip-cat ${categoriaSeleccionadaPOS === cat ? 'activo' : ''}" data-cat="${escapeHtml(cat)}">
              <span>${icono}</span> ${escapeHtml(cat)}
            </button>
          `;
        }).join('')}
      `;

      contenedorChips.querySelectorAll('.chip-cat').forEach(ch => {
        ch.addEventListener('click', () => {
          categoriaSeleccionadaPOS = ch.getAttribute('data-cat') || "";
          renderGridProductosPOS(productos, moneda);
          contenedorChips.querySelectorAll('.chip-cat').forEach(c => c.classList.remove('activo'));
          ch.classList.add('activo');
        });
      });
    }

    renderGridProductosPOS(productos, moneda);
    renderCarritoPOS(state);
  }

  function renderGridProductosPOS(productos, moneda) {
    const grid = document.getElementById('pos-productos-grid');
    if (!grid) return;

    const query = busquedaPOS.toLowerCase().trim();
    const filtrados = productos.filter(p => {
      const matchCat = !categoriaSeleccionadaPOS || p.categoria === categoriaSeleccionadaPOS;
      const matchQuery = !query || 
        (p.nombre && p.nombre.toLowerCase().includes(query)) ||
        (p.codigo && p.codigo.toLowerCase().includes(query)) ||
        (p.categoria && p.categoria.toLowerCase().includes(query));
      return matchCat && matchQuery;
    });

    if (filtrados.length === 0) {
      if (productos.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align:center; padding: 3.5rem 1.5rem; color: #64748b;">
            <div style="font-size:3rem; margin-bottom:0.75rem;">📦</div>
            <h3 style="font-size:1.2rem; color:#0f172a; margin-bottom:0.4rem; font-weight:800;">Catálogo Vacío (Sin datos demo)</h3>
            <p style="font-size:0.9rem; margin-bottom:1.25rem;">Registra los productos de tu ferretería en Inventario para comenzar a despachar.</p>
            <button class="btn btn-primary" id="btn-ir-inventario-desde-pos">+ Registrar Primer Producto</button>
          </div>
        `;
        const btnIr = document.getElementById('btn-ir-inventario-desde-pos');
        if (btnIr) btnIr.addEventListener('click', () => cambiarSeccion('inventario'));
      } else {
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align:center; padding: 2.5rem 1rem; color: #64748b;">
            <p style="font-weight:600;">No se encontraron artículos para "${escapeHtml(busquedaPOS)}".</p>
          </div>
        `;
      }
      return;
    }

    grid.innerHTML = filtrados.map(p => {
      const stock = Number(p.stock) || 0;
      const sinStock = stock <= 0;
      const stockBajo = stock > 0 && stock <= (p.stockMinimo || 5);

      let tagClase = "ok";
      let tagTexto = `Stock: ${stock} ${p.unidad}`;
      if (sinStock) {
        tagClase = "cero";
        tagTexto = `AGOTADO (0)`;
      } else if (stockBajo) {
        tagClase = "alerta";
        tagTexto = `Bajo: ${stock} ${p.unidad}`;
      }

      return `
        <div class="card-pos-producto ${sinStock ? 'agotado' : ''}" data-id="${p.id}" title="${sinStock ? 'Sin stock disponible' : 'Clic para agregar a la venta'}">
          <div class="card-pos-top">
            <span class="card-pos-codigo">${escapeHtml(p.codigo || 'S/C')}</span>
            <span class="stock-tag ${tagClase}">${tagTexto}</span>
          </div>
          <div class="card-pos-nombre">${escapeHtml(p.nombre)}</div>
          <div class="card-pos-bottom">
            <div>
              <div class="card-pos-precio">${moneda} ${(Number(p.precioVenta) || 0).toFixed(2)}</div>
              <small style="font-size:0.75rem; color:#64748b;">por ${escapeHtml(p.unidad)}</small>
            </div>
            <button class="btn btn-primary btn-sm" style="padding:0.25rem 0.55rem; font-size:0.75rem;" ${sinStock ? 'disabled' : ''}>
              + Añadir
            </button>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.card-pos-producto:not(.agotado)').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        agregarAlCarrito(id);
      });
    });
  }

  // Búsqueda en POS con lector de código de barras
  const inputBusqPOS = document.getElementById('pos-buscar-input');
  if (inputBusqPOS) {
    inputBusqPOS.addEventListener('input', (e) => {
      busquedaPOS = e.target.value;
      const state = Store.getState();
      renderGridProductosPOS(state.productos || [], (state.configuracion && state.configuracion.moneda) || "S/");
    });

    inputBusqPOS.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const state = Store.getState();
        const productos = state.productos || [];
        const query = busquedaPOS.toLowerCase().trim();
        const exacto = productos.find(p => (p.codigo && p.codigo.toLowerCase() === query) || (p.nombre && p.nombre.toLowerCase() === query));
        if (exacto && exacto.stock > 0) {
          agregarAlCarrito(exacto.id);
          inputBusqPOS.value = "";
          busquedaPOS = "";
          renderGridProductosPOS(productos, (state.configuracion && state.configuracion.moneda) || "S/");
        }
      }
    });
  }

  function agregarAlCarrito(productoId) {
    const state = Store.getState();
    const prod = (state.productos || []).find(p => p.id === productoId);
    if (!prod) return;

    if (prod.stock <= 0) {
      alert(`El producto "${prod.nombre}" no cuenta con stock.`);
      return;
    }

    const itemExistente = carrito.find(it => it.productoId === productoId);
    if (itemExistente) {
      if (itemExistente.cantidad + 1 > prod.stock) {
        alert(`Stock máximo disponible alcanzado (${prod.stock} ${prod.unidad}).`);
        return;
      }
      itemExistente.cantidad += 1;
    } else {
      carrito.push({
        productoId: prod.id,
        codigo: prod.codigo,
        nombre: prod.nombre,
        categoria: prod.categoria,
        unidad: prod.unidad,
        precioVenta: Number(prod.precioVenta) || 0,
        precioCompra: Number(prod.precioCompra) || 0,
        cantidad: 1,
        stockDisponible: Number(prod.stock) || 0
      });
    }

    renderCarritoPOS(state);
  }

  function renderCarritoPOS(state) {
    const moneda = (state.configuracion && state.configuracion.moneda) || "S/";
    const contenedorItems = document.getElementById('carrito-items-lista');
    const badgeCantidadItems = document.getElementById('carrito-badge-cantidad');
    const elSubtotal = document.getElementById('carrito-subtotal-texto');
    const elTotal = document.getElementById('carrito-total-texto');
    const btnCobrar = document.getElementById('btn-carrito-cobrar');
    const inputRecibido = document.getElementById('pos-pago-recibido');
    const cajaVuelto = document.getElementById('pos-caja-vuelto');
    const textoVuelto = document.getElementById('pos-texto-vuelto');

    if (!contenedorItems) return;

    const totalUnidades = carrito.reduce((sum, it) => sum + it.cantidad, 0);
    const totalVenta = carrito.reduce((sum, it) => sum + (it.cantidad * it.precioVenta), 0);

    if (badgeCantidadItems) badgeCantidadItems.textContent = `${totalUnidades} items`;
    if (elSubtotal) elSubtotal.textContent = `${moneda} ${totalVenta.toFixed(2)}`;
    if (elTotal) elTotal.textContent = `${moneda} ${totalVenta.toFixed(2)}`;

    // Vuelto automático
    if (inputRecibido && cajaVuelto && textoVuelto) {
      const recibido = parseFloat(inputRecibido.value) || 0;
      if (recibido >= totalVenta && totalVenta > 0) {
        cajaVuelto.style.display = 'flex';
        textoVuelto.textContent = `${moneda} ${(recibido - totalVenta).toFixed(2)}`;
      } else {
        cajaVuelto.style.display = 'none';
      }
    }

    if (btnCobrar) {
      btnCobrar.disabled = carrito.length === 0;
    }

    if (carrito.length === 0) {
      contenedorItems.innerHTML = `
        <div style="text-align:center; padding: 2.5rem 1rem; color: #94a3b8;">
          <div style="font-size:2.25rem; margin-bottom:0.4rem;">🛒</div>
          <p style="font-weight:700; color:#334155; font-size:0.95rem;">Caja lista para vender</p>
          <p style="font-size:0.8rem; margin-top:0.25rem;">Haz clic en los productos para agregarlos a la nota</p>
        </div>
      `;
      return;
    }

    contenedorItems.innerHTML = carrito.map((item, index) => {
      const subtotalItem = item.cantidad * item.precioVenta;
      return `
        <div class="carrito-item-row" data-index="${index}">
          <div class="item-desc">
            <h4 title="${escapeHtml(item.nombre)}">${escapeHtml(item.nombre)}</h4>
            <span>${moneda} ${item.precioVenta.toFixed(2)} / ${item.unidad} (Disp: ${item.stockDisponible})</span>
          </div>
          <div class="qty-control">
            <button class="qty-btn btn-restar-qty" data-index="${index}">-</button>
            <input type="number" class="qty-input input-modificar-qty" data-index="${index}" value="${item.cantidad}" min="1" max="${item.stockDisponible}">
            <button class="qty-btn btn-sumar-qty" data-index="${index}">+</button>
          </div>
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <div class="item-precio-col">
              <div class="item-subtotal-val">${moneda} ${subtotalItem.toFixed(2)}</div>
            </div>
            <button class="btn-quitar-item" data-index="${index}" title="Quitar ítem">×</button>
          </div>
        </div>
      `;
    }).join('');

    // Eventos de cantidad
    contenedorItems.querySelectorAll('.btn-restar-qty').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        if (carrito[idx].cantidad > 1) {
          carrito[idx].cantidad -= 1;
        } else {
          carrito.splice(idx, 1);
        }
        renderCarritoPOS(Store.getState());
      });
    });

    contenedorItems.querySelectorAll('.btn-sumar-qty').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        if (carrito[idx].cantidad + 1 <= carrito[idx].stockDisponible) {
          carrito[idx].cantidad += 1;
        } else {
          alert(`Stock insuficiente. Solo quedan ${carrito[idx].stockDisponible} ${carrito[idx].unidad}.`);
        }
        renderCarritoPOS(Store.getState());
      });
    });

    contenedorItems.querySelectorAll('.input-modificar-qty').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.getAttribute('data-index'));
        let val = parseInt(input.value) || 1;
        if (val < 1) val = 1;
        if (val > carrito[idx].stockDisponible) {
          alert(`Cantidad ajustada a la disponibilidad máxima (${carrito[idx].stockDisponible}).`);
          val = carrito[idx].stockDisponible;
        }
        carrito[idx].cantidad = val;
        renderCarritoPOS(Store.getState());
      });
    });

    contenedorItems.querySelectorAll('.btn-quitar-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        carrito.splice(idx, 1);
        renderCarritoPOS(Store.getState());
      });
    });
  }

  // Billetes rápidos para cálculo veloz de vuelto
  const btnBilleteExacto = document.getElementById('btn-billete-exacto');
  if (btnBilleteExacto) {
    btnBilleteExacto.addEventListener('click', () => {
      const totalVenta = carrito.reduce((sum, it) => sum + (it.cantidad * it.precioVenta), 0);
      const input = document.getElementById('pos-pago-recibido');
      if (input) {
        input.value = totalVenta.toFixed(2);
        renderCarritoPOS(Store.getState());
      }
    });
  }

  document.querySelectorAll('.btn-billete[data-monto]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseFloat(btn.getAttribute('data-monto')) || 0;
      const input = document.getElementById('pos-pago-recibido');
      if (input) {
        const actual = parseFloat(input.value) || 0;
        input.value = (actual + val).toFixed(2);
        renderCarritoPOS(Store.getState());
      }
    });
  });

  const inputPagoRecibido = document.getElementById('pos-pago-recibido');
  if (inputPagoRecibido) {
    inputPagoRecibido.addEventListener('input', () => {
      renderCarritoPOS(Store.getState());
    });
  }

  const btnVaciarCarrito = document.getElementById('btn-vaciar-carrito');
  if (btnVaciarCarrito) {
    btnVaciarCarrito.addEventListener('click', () => {
      if (carrito.length > 0 && confirm("¿Limpiar todos los artículos del carrito?")) {
        carrito = [];
        renderCarritoPOS(Store.getState());
      }
    });
  }

  const selectMetodoPago = document.getElementById('pos-metodo-pago');
  const grupoEfectivo = document.getElementById('pos-grupo-efectivo');
  if (selectMetodoPago && grupoEfectivo) {
    selectMetodoPago.addEventListener('change', () => {
      grupoEfectivo.style.display = selectMetodoPago.value === 'Efectivo' ? 'block' : 'none';
    });
  }

  // FINALIZAR VENTA (COBRO INMEDIATO Y DESCUENTO DE STOCK)
  const btnCobrar = document.getElementById('btn-carrito-cobrar');
  if (btnCobrar) {
    btnCobrar.addEventListener('click', () => {
      if (carrito.length === 0) return;

      const totalVenta = carrito.reduce((sum, it) => sum + (it.cantidad * it.precioVenta), 0);
      const clienteNombre = (document.getElementById('pos-cliente-nombre')?.value || "").trim();
      const clienteDoc = (document.getElementById('pos-cliente-doc')?.value || "").trim();
      const tipoComprobante = document.getElementById('pos-tipo-comprobante')?.value || "Nota de Venta";
      const metodoPago = document.getElementById('pos-metodo-pago')?.value || "Efectivo";
      const montoRecibido = parseFloat(document.getElementById('pos-pago-recibido')?.value) || totalVenta;

      if (metodoPago === 'Efectivo' && montoRecibido < totalVenta) {
        alert(`El monto recibido (S/ ${montoRecibido.toFixed(2)}) no puede ser menor al total (S/ ${totalVenta.toFixed(2)}).`);
        return;
      }

      // Procesar venta en Store (DESCUENTA STOCK AUTOMÁTICAMENTE)
      const resultado = Store.recordSale({
        items: carrito,
        cliente: clienteNombre,
        docCliente: clienteDoc,
        tipoComprobante: tipoComprobante,
        metodoPago: metodoPago,
        montoRecibido: montoRecibido
      });

      if (!resultado.ok) {
        alert("No se pudo procesar la venta: " + resultado.error);
        return;
      }

      // Venta exitosa: limpiar carrito y abrir comprobante
      carrito = [];
      if (document.getElementById('pos-cliente-nombre')) document.getElementById('pos-cliente-nombre').value = "";
      if (document.getElementById('pos-cliente-doc')) document.getElementById('pos-cliente-doc').value = "";
      if (document.getElementById('pos-pago-recibido')) document.getElementById('pos-pago-recibido').value = "";

      abrirModalTicket(resultado.venta);
    });
  }

  // ==========================================================================
  // MÓDULO 2: INVENTARIO / PRODUCTOS Y AGREGAR STOCK
  // ==========================================================================

  function renderInventario(state) {
    const moneda = (state.configuracion && state.configuracion.moneda) || "S/";
    const productos = state.productos || [];

    const kpiTotalProd = document.getElementById('inv-kpi-total-prod');
    const kpiValorInv = document.getElementById('inv-kpi-valor-total');
    const kpiBajoStock = document.getElementById('inv-kpi-bajo-stock');
    const kpiAgotados = document.getElementById('inv-kpi-agotados');

    const totalProdCount = productos.length;
    const valorTotalInv = productos.reduce((sum, p) => sum + ((Number(p.stock) || 0) * (Number(p.precioVenta) || 0)), 0);
    const bajoStockCount = productos.filter(p => p.stock > 0 && p.stock <= (p.stockMinimo || 5)).length;
    const agotadosCount = productos.filter(p => (Number(p.stock) || 0) <= 0).length;

    if (kpiTotalProd) kpiTotalProd.textContent = totalProdCount;
    if (kpiValorInv) kpiValorInv.textContent = `${moneda} ${valorTotalInv.toFixed(2)}`;
    if (kpiBajoStock) kpiBajoStock.textContent = bajoStockCount;
    if (kpiAgotados) kpiAgotados.textContent = agotadosCount;

    const selectFiltroCat = document.getElementById('inv-filtro-categoria');
    if (selectFiltroCat) {
      const catActual = selectFiltroCat.value;
      selectFiltroCat.innerHTML = `<option value="">Todas las Categorías</option>` +
        (state.categorias || []).map(c => `<option value="${escapeHtml(c)}" ${catActual === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
    }

    renderTablaInventario(state);
  }

  function renderTablaInventario(state) {
    const tbody = document.getElementById('inv-tabla-tbody');
    if (!tbody) return;

    const moneda = (state.configuracion && state.configuracion.moneda) || "S/";
    const busqueda = (document.getElementById('inv-buscar-input')?.value || "").toLowerCase().trim();
    const catFiltro = document.getElementById('inv-filtro-categoria')?.value || "";

    const filtrados = (state.productos || []).filter(p => {
      const stock = Number(p.stock) || 0;
      const stockMin = Number(p.stockMinimo) || 5;

      const matchBusqueda = !busqueda || 
        (p.nombre && p.nombre.toLowerCase().includes(busqueda)) ||
        (p.codigo && p.codigo.toLowerCase().includes(busqueda)) ||
        (p.categoria && p.categoria.toLowerCase().includes(busqueda));

      const matchCat = !catFiltro || p.categoria === catFiltro;

      let matchStock = true;
      if (filtroStockInventario === 'normal') matchStock = stock > stockMin;
      if (filtroStockInventario === 'bajo') matchStock = stock > 0 && stock <= stockMin;
      if (filtroStockInventario === 'agotado') matchStock = stock <= 0;

      return matchBusqueda && matchCat && matchStock;
    });

    if (filtrados.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding: 3rem 1.5rem; color: #64748b;">
            <div style="font-size:2.5rem; margin-bottom:0.5rem;">📦</div>
            <p style="font-weight:700; font-size:1rem; color:#1e293b;">No hay productos que coincidan</p>
            <p style="font-size:0.85rem; margin-top:0.25rem;">Haz clic en <b>"+ Nuevo Producto"</b> para agregar artículos a tu inventario.</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtrados.map(p => {
      const stock = Number(p.stock) || 0;
      const stockMin = Number(p.stockMinimo) || 5;
      const pCompra = Number(p.precioCompra) || 0;
      const pVenta = Number(p.precioVenta) || 0;
      const margen = pCompra > 0 ? (((pVenta - pCompra) / pCompra) * 100).toFixed(0) : "0";

      let tagClase = "ok";
      let tagTexto = `${stock} ${p.unidad}`;
      let estadoBadge = `<span class="stock-tag ok">Óptimo</span>`;
      if (stock <= 0) {
        tagClase = "cero";
        tagTexto = `0 ${p.unidad}`;
        estadoBadge = `<span class="stock-tag cero">Agotado</span>`;
      } else if (stock <= stockMin) {
        tagClase = "alerta";
        tagTexto = `${stock} ${p.unidad}`;
        estadoBadge = `<span class="stock-tag alerta">Bajo Stock</span>`;
      }

      return `
        <tr>
          <td><code style="font-weight:700; color:#334155; font-family:var(--font-mono);">${escapeHtml(p.codigo || '-')}</code></td>
          <td>
            <div style="font-weight:700; color:#0f172a;">${escapeHtml(p.nombre)}</div>
            ${p.ubicacion ? `<div style="font-size:0.75rem; color:#64748b;">📍 ${escapeHtml(p.ubicacion)}</div>` : ''}
          </td>
          <td><span class="chip-cat" style="font-size:0.75rem; padding:0.15rem 0.5rem;">${escapeHtml(p.categoria || 'Otros')}</span></td>
          <td class="text-right">${moneda} ${pCompra.toFixed(2)}</td>
          <td class="text-right" style="font-weight:800; color:var(--brand-primary);">${moneda} ${pVenta.toFixed(2)}</td>
          <td class="text-right"><span style="font-size:0.8rem; color:#10b981; font-weight:700;">+${margen}%</span></td>
          <td>
            <div style="display:flex; align-items:center; gap:0.45rem;">
              <span class="stock-tag ${tagClase}">${tagTexto}</span>
              <button class="btn btn-outline-primary btn-sm btn-agregar-stock" data-id="${p.id}" title="Reabastecer / Agregar Stock">
                <b>+ Stock</b>
              </button>
            </div>
          </td>
          <td>${estadoBadge}</td>
          <td class="text-right">
            <div style="display:inline-flex; gap:0.35rem;">
              <button class="btn btn-outline btn-sm btn-editar-prod" data-id="${p.id}" title="Editar producto">✏️</button>
              <button class="btn btn-outline btn-sm btn-eliminar-prod" data-id="${p.id}" title="Eliminar producto" style="color:var(--danger);">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-agregar-stock').forEach(btn => {
      btn.addEventListener('click', () => {
        abrirModalAgregarStock(btn.getAttribute('data-id'));
      });
    });

    tbody.querySelectorAll('.btn-editar-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        abrirModalEditarProducto(btn.getAttribute('data-id'));
      });
    });

    tbody.querySelectorAll('.btn-eliminar-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const prod = (Store.getState().productos || []).find(p => p.id === id);
        if (prod && confirm(`¿Eliminar definitivamente "${prod.nombre}" del inventario?`)) {
          Store.deleteProduct(id);
        }
      });
    });
  }

  // Filtros de inventario
  document.getElementById('inv-buscar-input')?.addEventListener('input', () => renderTablaInventario(Store.getState()));
  document.getElementById('inv-filtro-categoria')?.addEventListener('change', () => renderTablaInventario(Store.getState()));

  document.querySelectorAll('.pastilla-stock').forEach(pst => {
    pst.addEventListener('click', () => {
      document.querySelectorAll('.pastilla-stock').forEach(p => p.classList.remove('activa'));
      pst.classList.add('activa');
      filtroStockInventario = pst.getAttribute('data-filtro') || "";
      renderTablaInventario(Store.getState());
    });
  });

  // Modal: Nuevo Producto
  document.getElementById('btn-inv-nuevo-producto')?.addEventListener('click', () => {
    abrirModalNuevoProducto();
  });

  function abrirModalNuevoProducto() {
    productoEnEdicion = null;
    const modal = document.getElementById('modal-producto');
    const titulo = document.getElementById('modal-producto-titulo');
    const form = document.getElementById('form-producto');
    if (!modal || !form) return;

    titulo.textContent = "Nuevo Producto de Ferretería";
    form.reset();
    poblarSelectsProducto();
    modal.classList.add('activo');
    document.getElementById('prod-input-nombre')?.focus();
  }

  function abrirModalEditarProducto(id) {
    const prod = (Store.getState().productos || []).find(p => p.id === id);
    if (!prod) return;

    productoEnEdicion = prod;
    const modal = document.getElementById('modal-producto');
    const titulo = document.getElementById('modal-producto-titulo');
    if (!modal) return;

    titulo.textContent = "Editar Producto: " + prod.nombre;
    poblarSelectsProducto();

    document.getElementById('prod-input-codigo').value = prod.codigo || "";
    document.getElementById('prod-input-nombre').value = prod.nombre || "";
    document.getElementById('prod-select-categoria').value = prod.categoria || "Otros";
    document.getElementById('prod-select-unidad').value = prod.unidad || "Unidad";
    document.getElementById('prod-input-compra').value = prod.precioCompra || 0;
    document.getElementById('prod-input-venta').value = prod.precioVenta || 0;
    document.getElementById('prod-input-stock').value = prod.stock || 0;
    document.getElementById('prod-input-stock-min').value = prod.stockMinimo || 5;
    document.getElementById('prod-input-ubicacion').value = prod.ubicacion || "";

    modal.classList.add('activo');
  }

  function poblarSelectsProducto() {
    const state = Store.getState();
    const selectCat = document.getElementById('prod-select-categoria');
    const selectUni = document.getElementById('prod-select-unidad');

    if (selectCat) {
      selectCat.innerHTML = (state.categorias || []).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    }
    if (selectUni) {
      selectUni.innerHTML = (state.unidades || []).map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');
    }
  }

  // Guardar Formulario Producto
  document.getElementById('form-producto')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const codigo = document.getElementById('prod-input-codigo')?.value.trim();
    const nombre = document.getElementById('prod-input-nombre')?.value.trim();
    const categoria = document.getElementById('prod-select-categoria')?.value;
    const unidad = document.getElementById('prod-select-unidad')?.value;
    const precioCompra = parseFloat(document.getElementById('prod-input-compra')?.value) || 0;
    const precioVenta = parseFloat(document.getElementById('prod-input-venta')?.value) || 0;
    const stock = parseFloat(document.getElementById('prod-input-stock')?.value) || 0;
    const stockMinimo = parseFloat(document.getElementById('prod-input-stock-min')?.value) || 5;
    const ubicacion = document.getElementById('prod-input-ubicacion')?.value.trim();

    if (!nombre) {
      alert("El nombre del producto es obligatorio.");
      return;
    }

    if (productoEnEdicion) {
      Store.updateProduct(productoEnEdicion.id, {
        codigo, nombre, categoria, unidad, precioCompra, precioVenta, stock, stockMinimo, ubicacion
      });
    } else {
      Store.addProduct({
        codigo, nombre, categoria, unidad, precioCompra, precioVenta, stock, stockMinimo, ubicacion
      });
    }

    cerrarModales();
  });

  // Modal: Agregar / Reabastecer Stock (+ Stock)
  function abrirModalAgregarStock(id) {
    const prod = (Store.getState().productos || []).find(p => p.id === id);
    if (!prod) return;

    productoParaStock = prod;
    const modal = document.getElementById('modal-stock');
    if (!modal) return;

    document.getElementById('stock-modal-prod-nombre').textContent = prod.nombre;
    document.getElementById('stock-modal-actual').textContent = `${prod.stock} ${prod.unidad}`;
    document.getElementById('stock-input-cantidad').value = "";
    document.getElementById('stock-input-compra').value = prod.precioCompra || "";
    document.getElementById('stock-preview-nuevo').textContent = `${prod.stock} ${prod.unidad}`;

    modal.classList.add('activo');
    const inputCant = document.getElementById('stock-input-cantidad');
    if (inputCant) {
      inputCant.focus();
      inputCant.oninput = () => {
        const val = parseFloat(inputCant.value) || 0;
        const total = (Number(prod.stock) || 0) + val;
        document.getElementById('stock-preview-nuevo').textContent = `${total} ${prod.unidad} (+${val})`;
      };
    }
  }

  document.getElementById('form-stock')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!productoParaStock) return;

    const cantidad = parseFloat(document.getElementById('stock-input-cantidad')?.value);
    if (isNaN(cantidad) || cantidad <= 0) {
      alert("Ingresa una cantidad mayor a cero.");
      return;
    }

    const nuevoCosto = document.getElementById('stock-input-compra')?.value;
    const motivo = document.getElementById('stock-input-motivo')?.value || "Reabastecimiento";

    const res = Store.addStock(productoParaStock.id, cantidad, motivo, nuevoCosto ? parseFloat(nuevoCosto) : null);
    if (res.ok) {
      cerrarModales();
    } else {
      alert("Error: " + res.error);
    }
  });

  // ==========================================================================
  // MÓDULO 3: RESUMEN Y REPORTES DE VENTAS
  // ==========================================================================

  function renderResumenVentas(state) {
    const moneda = (state.configuracion && state.configuracion.moneda) || "S/";
    const resumen = Store.getSalesSummary(periodoVentasSeleccionado);

    const kpiTotalVentas = document.getElementById('res-kpi-total-ventas');
    const kpiGanancia = document.getElementById('res-kpi-ganancia');
    const kpiCantidadVentas = document.getElementById('res-kpi-cant-ventas');
    const kpiUnidades = document.getElementById('res-kpi-unidades');
    const kpiTicketProm = document.getElementById('res-kpi-ticket-prom');

    if (kpiTotalVentas) kpiTotalVentas.textContent = `${moneda} ${resumen.totalVentas.toFixed(2)}`;
    if (kpiGanancia) kpiGanancia.textContent = `${moneda} ${resumen.totalGanancia.toFixed(2)}`;
    if (kpiCantidadVentas) kpiCantidadVentas.textContent = `${resumen.cantidadTransacciones} ventas`;
    if (kpiUnidades) kpiUnidades.textContent = `${resumen.totalUnidades} unidades`;
    if (kpiTicketProm) kpiTicketProm.textContent = `${moneda} ${resumen.ticketPromedio.toFixed(2)}`;

    // Gráfico de Métodos de Pago
    const contMetodosPago = document.getElementById('res-barras-metodos-pago');
    if (contMetodosPago) {
      const entries = Object.entries(resumen.metodosPago || {});
      if (entries.length === 0) {
        contMetodosPago.innerHTML = `<p style="color:#64748b; font-size:0.85rem;">No hay ventas registradas en el periodo seleccionado.</p>`;
      } else {
        const total = resumen.totalVentas || 1;
        contMetodosPago.innerHTML = entries.map(([metodo, monto]) => {
          const pct = ((monto / total) * 100).toFixed(1);
          return `
            <div class="ranking-item">
              <div class="ranking-meta">
                <span><b>${escapeHtml(metodo)}</b> (${pct}%)</span>
                <span>${moneda} ${monto.toFixed(2)}</span>
              </div>
              <div class="ranking-track">
                <div class="ranking-bar color-primary" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Top Productos más vendidos
    const contTopProductos = document.getElementById('res-top-productos-lista');
    if (contTopProductos) {
      const top = resumen.topProductos || [];
      if (top.length === 0) {
        contTopProductos.innerHTML = `<p style="color:#64748b; font-size:0.85rem;">Aún no hay productos despachados en este periodo.</p>`;
      } else {
        const maxCant = Math.max(...top.map(t => t.cantidad), 1);
        contTopProductos.innerHTML = top.map((t, idx) => {
          const pct = ((t.cantidad / maxCant) * 100).toFixed(0);
          return `
            <div class="ranking-item">
              <div class="ranking-meta">
                <span><b>#${idx + 1} ${escapeHtml(t.nombre)}</b> (${t.cantidad} ${t.unidad})</span>
                <span style="font-weight:800; color:var(--brand-primary);">${moneda} ${t.totalRecaudado.toFixed(2)}</span>
              </div>
              <div class="ranking-track">
                <div class="ranking-bar color-success" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    renderTablaHistorialVentas(state, resumen.ventas || []);
  }

  function renderTablaHistorialVentas(state, ventas) {
    const tbody = document.getElementById('res-tabla-ventas-tbody');
    if (!tbody) return;

    const moneda = (state.configuracion && state.configuracion.moneda) || "S/";
    const busqueda = (document.getElementById('res-buscar-ventas-input')?.value || "").toLowerCase().trim();

    const filtradas = ventas.filter(v => {
      if (!busqueda) return true;
      return (v.numero && v.numero.toLowerCase().includes(busqueda)) ||
        (v.cliente && v.cliente.toLowerCase().includes(busqueda)) ||
        (v.docCliente && v.docCliente.toLowerCase().includes(busqueda)) ||
        (v.metodoPago && v.metodoPago.toLowerCase().includes(busqueda));
    });

    if (filtradas.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding: 2.5rem 1rem; color: #64748b;">
            <p style="font-weight:600;">No hay ventas registradas en el periodo seleccionado.</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtradas.map(v => {
      const fecha = v.fecha ? new Date(v.fecha).toLocaleString("es-PE", { dateStyle: 'short', timeStyle: 'short' }) : "";
      const esAnulada = v.estado === 'ANULADA';
      const itemsResumen = (v.items || []).map(it => `${it.cantidad} ${it.unidad} de ${it.nombre}`).join(', ');

      return `
        <tr class="${esAnulada ? 'fila-anulada' : ''}">
          <td>
            <b style="color:var(--slate-900); font-family:var(--font-mono);">${escapeHtml(v.numero)}</b>
            <div style="font-size:0.75rem; color:#64748b;">${v.tipoComprobante}</div>
          </td>
          <td>${fecha}</td>
          <td>
            <div style="font-weight:700;">${escapeHtml(v.cliente)}</div>
            ${v.docCliente && v.docCliente !== '-' ? `<small style="color:#64748b;">Doc: ${escapeHtml(v.docCliente)}</small>` : ''}
          </td>
          <td style="max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(itemsResumen)}">
            ${escapeHtml(itemsResumen)}
          </td>
          <td><span class="chip-cat" style="font-size:0.75rem;">${escapeHtml(v.metodoPago)}</span></td>
          <td class="text-right" style="font-weight:800; color:var(--brand-primary); font-size:0.95rem;">${moneda} ${(Number(v.total) || 0).toFixed(2)}</td>
          <td class="text-right" style="font-weight:700; color:#10b981;">+${moneda} ${(Number(v.gananciaTotal) || 0).toFixed(2)}</td>
          <td class="text-right">
            <div style="display:inline-flex; gap:0.35rem;">
              <button class="btn btn-outline btn-sm btn-ver-ticket" data-id="${v.id}" title="Ver e Imprimir Ticket">🧾 Ticket</button>
              ${!esAnulada ? `
                <button class="btn btn-outline btn-sm btn-anular-venta" data-id="${v.id}" title="Anular venta y reponer stock" style="color:var(--danger);">✕ Anular</button>
              ` : `
                <span class="stock-tag cero" style="font-size:0.7rem;">ANULADA</span>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-ver-ticket').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const v = (Store.getState().ventas || []).find(x => x.id === id);
        if (v) abrirModalTicket(v);
      });
    });

    tbody.querySelectorAll('.btn-anular-venta').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (confirm("¿Confirmar anulación de venta? El stock de los productos vendidos será regresado automáticamente al inventario.")) {
          const res = Store.annulSale(id);
          if (!res.ok) alert("Error: " + res.error);
        }
      });
    });
  }

  // Filtros de periodo en Resumen
  document.querySelectorAll('.pastilla-periodo').forEach(pst => {
    pst.addEventListener('click', () => {
      document.querySelectorAll('.pastilla-periodo').forEach(p => p.classList.remove('activa'));
      pst.classList.add('activa');
      periodoVentasSeleccionado = pst.getAttribute('data-periodo') || "hoy";
      renderResumenVentas(Store.getState());
    });
  });

  document.getElementById('res-buscar-ventas-input')?.addEventListener('input', () => renderResumenVentas(Store.getState()));

  // Excel handlers
  document.getElementById('btn-exportar-ventas-excel')?.addEventListener('click', () => {
    ExportManager.exportarReporteVentasExcel(periodoVentasSeleccionado);
  });

  document.getElementById('btn-inv-exportar-excel')?.addEventListener('click', () => {
    ExportManager.exportarInventarioExcel();
  });

  document.getElementById('btn-inv-descargar-plantilla')?.addEventListener('click', () => {
    ExportManager.descargarPlantillaExcel();
  });

  const btnImportarExcel = document.getElementById('btn-inv-importar-excel');
  const inputArchivoImportar = document.getElementById('input-archivo-importar-excel');
  if (btnImportarExcel && inputArchivoImportar) {
    btnImportarExcel.addEventListener('click', () => inputArchivoImportar.click());
    inputArchivoImportar.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        ExportManager.importarProductosExcel(file, (res) => {
          if (res.ok) {
            alert(`¡Importación completada! Se registraron ${res.importados} productos en tu catálogo.`);
          } else {
            alert("Error al importar: " + res.error);
          }
          inputArchivoImportar.value = "";
        });
      }
    });
  }

  // ==========================================================================
  // MODAL DE TICKET / IMPRESIÓN
  // ==========================================================================

  function abrirModalTicket(venta) {
    ventaActivaParaTicket = venta;
    const modal = document.getElementById('modal-ticket');
    const contenedorTicket = document.getElementById('ticket-contenido-imprimible');
    const seccionImpresion = document.getElementById('seccion-impresion');
    if (!modal || !contenedorTicket) return;

    const htmlTicket = ExportManager.generarTicketHTML(venta);
    contenedorTicket.innerHTML = htmlTicket;
    if (seccionImpresion) seccionImpresion.innerHTML = htmlTicket;
    modal.classList.add('activo');
  }

  document.getElementById('btn-ticket-imprimir')?.addEventListener('click', () => {
    const contenedorTicket = document.getElementById('ticket-contenido-imprimible');
    const seccionImpresion = document.getElementById('seccion-impresion');
    if (contenedorTicket && seccionImpresion) {
      seccionImpresion.innerHTML = contenedorTicket.innerHTML;
    }
    window.print();
  });

  // ==========================================================================
  // CONFIGURACIÓN Y RESPALDOS
  // ==========================================================================

  function renderConfiguracion(state) {
    const cfg = state.configuracion || {};
    if (document.getElementById('cfg-empresa')) document.getElementById('cfg-empresa').value = cfg.empresa || "";
    if (document.getElementById('cfg-ruc')) document.getElementById('cfg-ruc').value = cfg.ruc || "";
    if (document.getElementById('cfg-direccion')) document.getElementById('cfg-direccion').value = cfg.direccion || "";
    if (document.getElementById('cfg-telefono')) document.getElementById('cfg-telefono').value = cfg.telefono || "";
    if (document.getElementById('cfg-moneda')) document.getElementById('cfg-moneda').value = cfg.moneda || "S/";
    if (document.getElementById('cfg-pie')) document.getElementById('cfg-pie').value = cfg.pieTicket || "";
  }

  document.getElementById('form-configuracion')?.addEventListener('submit', (e) => {
    e.preventDefault();
    Store.updateConfig({
      empresa: document.getElementById('cfg-empresa')?.value.trim(),
      ruc: document.getElementById('cfg-ruc')?.value.trim(),
      direccion: document.getElementById('cfg-direccion')?.value.trim(),
      telefono: document.getElementById('cfg-telefono')?.value.trim(),
      moneda: document.getElementById('cfg-moneda')?.value.trim() || "S/",
      pieTicket: document.getElementById('cfg-pie')?.value.trim()
    });
    alert("Datos de la ferretería guardados correctamente.");
    cerrarModales();
  });

  document.getElementById('btn-descargar-respaldo-json')?.addEventListener('click', () => Store.exportBackupJSON());

  const btnSubirJSON = document.getElementById('btn-subir-respaldo-json');
  const inputSubirJSON = document.getElementById('input-archivo-subir-json');
  if (btnSubirJSON && inputSubirJSON) {
    btnSubirJSON.addEventListener('click', () => inputSubirJSON.click());
    inputSubirJSON.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          const res = Store.importBackupJSON(evt.target.result);
          if (res.ok) {
            alert(`Copia restaurada con éxito: ${res.productos} productos y ${res.ventas} ventas cargadas.`);
            cerrarModales();
          } else {
            alert("Error al restaurar: " + res.error);
          }
          inputSubirJSON.value = "";
        };
        reader.readAsText(file);
      }
    });
  }

  document.getElementById('btn-reiniciar-sistema')?.addEventListener('click', () => {
    if (confirm("ADVERTENCIA: ¿Estás seguro de reiniciar todo el sistema a cero? Se borrarán todos los productos y ventas.")) {
      if (confirm("Confirma nuevamente para proceder con la limpieza total.")) {
        Store.limpiarTodo();
        alert("Sistema reiniciado a cero.");
        cerrarModales();
      }
    }
  });

  // ==========================================================================
  // CIERRE DE MODALES
  // ==========================================================================

  function cerrarModales() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('activo'));
    productoEnEdicion = null;
    productoParaStock = null;
  }

  document.querySelectorAll('.modal-close-btn, .btn-cancelar-modal').forEach(btn => {
    btn.addEventListener('click', cerrarModales);
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cerrarModales();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarModales();
  });

  function escapeHtml(texto) {
    if (texto === null || texto === undefined) return "";
    return String(texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
