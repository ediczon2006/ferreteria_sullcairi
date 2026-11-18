/**
 * ============================================================================
 * CONTROLADOR PRINCIPAL DE LA APLICACIÓN (js/app.js)
 * Sistema de Gestión y Punto de Venta para Ferretería - Edición PRO
 * Arquitectura modular, manejo defensivo de eventos y tipado seguro
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // Estado local del Punto de Venta (en memoria del cliente)
  let carrito = [];
  let categoriaSeleccionadaPOS = "";
  let busquedaPOS = "";
  let periodoVentasSeleccionado = "hoy";
  let filtroStockInventario = "";
  let ordenInventario = "nombre_asc";
  let filtroMarcaInventario = "";
  let filasPorPagina = 25;
  let paginaActual = 1;
  const productosSeleccionados = new Set();
  let productosParaEtiquetas = [];
  let productoFiltroKardex = null;
  let productoEnEdicion = null;
  let productoParaStock = null;
  let ventaActivaParaTicket = null;

  // Mapa de iconos temáticos por categoría ferretera
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

  // Elementos principales de la cabecera
  const navBotones = document.querySelectorAll('.nav-btn');
  const secciones = document.querySelectorAll('.modulo-seccion');
  const badgeEstado = document.getElementById('badge-estado-guardado');
  const textoEstado = document.getElementById('texto-estado-guardado');

  // Reloj digital en tiempo real
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
  // INICIALIZACIÓN Y SUSCRIPCIÓN AL STORE CENTRALIZADO
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
    renderTablaKardex();
    renderListaSeleccionEtiquetas();
    actualizarNombreEmpresaCabecera(state);
    actualizarAlertasNavegacion(state);
  });

  // Inicializar carga de datos desde API o almacenamiento local
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
    const criticos = prods.filter(p => Number(p.stock) <= (Number(p.stockMinimo) || 5)).length;
    if (criticos > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = String(criticos);
    } else {
      badge.style.display = 'none';
    }
  }

  // ==========================================================================
  // ENRUTADOR DE PÁGINAS INDIVIDUALES (MULTI-PAGE ROUTER + HASH NAVIGATION)
  // ==========================================================================

  const TITULOS_PAGINAS = {
    pos: "Punto de Venta (Caja) | Ferretería Sullcairi PRO",
    inventario: "Inventario y Catálogo de Stock | Ferretería Sullcairi PRO",
    producto: "Ficha de Producto | Ferretería Sullcairi PRO",
    kardex: "Kardex y Movimientos de Stock | Ferretería Sullcairi PRO",
    etiquetas: "Estudio de Etiquetas y Códigos de Barras | Ferretería Sullcairi PRO",
    resumen: "Resumen y Reportes de Ventas | Ferretería Sullcairi PRO",
    ajustes: "Configuración y Copias de Seguridad | Ferretería Sullcairi PRO"
  };

  navBotones.forEach(btn => {
    btn.addEventListener('click', () => {
      const seccionDestino = btn.getAttribute('data-seccion');
      if (!seccionDestino) return;
      if (seccionDestino === 'producto' && !productoEnEdicion) {
        abrirModalNuevoProducto();
      } else if (seccionDestino === 'kardex') {
        abrirModalKardex(null);
      } else if (seccionDestino === 'etiquetas') {
        const activos = (Store.getState().productos || []).filter(p => p.estado !== "inactivo");
        abrirModalEtiquetasBarcode(activos);
      } else {
        cambiarSeccion(seccionDestino);
      }
    });
  });

  function cambiarSeccion(seccionId) {
    if (!TITULOS_PAGINAS[seccionId]) seccionId = 'pos';

    navBotones.forEach(b => {
      b.classList.toggle('activo', b.getAttribute('data-seccion') === seccionId);
    });
    secciones.forEach(sec => {
      sec.classList.toggle('activo', sec.id === `seccion-${seccionId}`);
    });

    document.title = TITULOS_PAGINAS[seccionId] || "Sistema Ferretero PRO";
    if (window.location.hash !== `#${seccionId}`) {
      try {
        history.pushState(null, "", `#${seccionId}`);
      } catch (e) {
        window.location.hash = seccionId;
      }
    }

    // Mostrar/ocultar barra flotante de carrito en móvil solo en POS
    const mobCartBar = document.getElementById('pos-mobile-cart-bar');
    if (mobCartBar) {
      mobCartBar.classList.toggle('visible-en-pos', seccionId === 'pos');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (seccionId === 'pos') {
      const inputBusq = document.getElementById('pos-buscar-input');
      if (inputBusq) inputBusq.focus();
    } else if (seccionId === 'kardex') {
      renderTablaKardex();
    } else if (seccionId === 'etiquetas') {
      renderListaSeleccionEtiquetas();
      renderPrevisualizacionEtiquetas();
    } else if (seccionId === 'ajustes') {
      renderConfiguracion(Store.getState());
    }
  }

  // Soporte para botón Atrás/Adelante del navegador
  window.addEventListener('popstate', () => {
    const hash = (window.location.hash || "").replace("#", "").trim();
    if (hash && TITULOS_PAGINAS[hash]) {
      cambiarSeccion(hash);
    }
  });

  // Botones "← Volver" de cada página individual
  document.getElementById('btn-volver-desde-producto')?.addEventListener('click', () => {
    productoEnEdicion = null;
    cambiarSeccion('inventario');
  });
  document.getElementById('btn-cancelar-producto-pag')?.addEventListener('click', () => {
    productoEnEdicion = null;
    cambiarSeccion('inventario');
  });
  document.getElementById('btn-volver-desde-kardex')?.addEventListener('click', () => {
    cambiarSeccion('inventario');
  });
  document.getElementById('btn-volver-desde-etiquetas')?.addEventListener('click', () => {
    cambiarSeccion('inventario');
  });
  document.getElementById('btn-volver-desde-ajustes')?.addEventListener('click', () => {
    cambiarSeccion('pos');
  });

  // Atajos de Teclado Profesionales para todas las páginas
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
      abrirModalNuevoProducto();
    } else if (e.altKey && e.key === '4') {
      e.preventDefault();
      abrirModalKardex(null);
    } else if (e.altKey && e.key === '5') {
      e.preventDefault();
      abrirModalEtiquetasBarcode((Store.getState().productos || []).filter(p => p.estado !== "inactivo"));
    } else if (e.altKey && e.key === '6') {
      e.preventDefault();
      cambiarSeccion('resumen');
    }
  });

  // Botón Ajustes / Configuración en cabecera navega a su página individual
  const btnAbrirConfiguracion = document.getElementById('btn-abrir-configuracion');
  if (btnAbrirConfiguracion) {
    btnAbrirConfiguracion.addEventListener('click', () => {
      cambiarSeccion('ajustes');
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
        <button type="button" class="chip-cat ${categoriaSeleccionadaPOS === "" ? 'activo' : ''}" data-cat="">
          <span>🏷️</span> Todas
        </button>
        ${categorias.map(cat => {
          const icono = ICONOS_CATEGORIAS[cat] || "📦";
          return `
            <button type="button" class="chip-cat ${categoriaSeleccionadaPOS === cat ? 'activo' : ''}" data-cat="${escapeHtml(cat)}">
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
            <p style="font-size:0.9rem; margin-bottom:1.25rem;">Registra los productos de tu ferretería en el módulo de Inventario para empezar a despachar.</p>
            <button type="button" class="btn btn-primary" id="btn-ir-inventario-desde-pos">+ Registrar Primer Producto</button>
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
      const stockBajo = stock > 0 && stock <= (Number(p.stockMinimo) || 5);

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
            <button type="button" class="btn btn-primary btn-sm btn-card-anadir" style="padding:0.25rem 0.55rem; font-size:0.75rem;" ${sinStock ? 'disabled' : ''}>
              + Añadir
            </button>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.card-pos-producto:not(.agotado)').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        if (id) agregarAlCarrito(id);
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
        const exacto = productos.find(p =>
          (p.codigo && p.codigo.toLowerCase() === query) ||
          (p.nombre && p.nombre.toLowerCase() === query)
        );
        if (exacto && Number(exacto.stock) > 0) {
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

    const stockActual = Number(prod.stock) || 0;
    if (stockActual <= 0) {
      alert(`El producto "${prod.nombre}" no cuenta con stock.`);
      return;
    }

    const itemExistente = carrito.find(it => it.productoId === productoId);
    if (itemExistente) {
      if (itemExistente.cantidad + 1 > stockActual) {
        alert(`Stock máximo disponible alcanzado (${stockActual} ${prod.unidad}).`);
        return;
      }
      itemExistente.cantidad = Math.round((itemExistente.cantidad + 1) * 1000) / 1000;
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
        stockDisponible: stockActual
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

    const totalUnidades = Math.round(carrito.reduce((sum, it) => sum + it.cantidad, 0) * 1000) / 1000;
    const totalVenta = Math.round(carrito.reduce((sum, it) => sum + (it.cantidad * it.precioVenta), 0) * 100) / 100;

    if (badgeCantidadItems) badgeCantidadItems.textContent = `${totalUnidades} items`;
    if (elSubtotal) elSubtotal.textContent = `${moneda} ${totalVenta.toFixed(2)}`;
    if (elTotal) elTotal.textContent = `${moneda} ${totalVenta.toFixed(2)}`;

    // Actualizar barra flotante móvil de POS
    const mobResumen = document.getElementById('mob-cart-resumen');
    const mobTotal = document.getElementById('mob-cart-total');
    if (mobResumen) mobResumen.textContent = `🛒 ${totalUnidades} producto${totalUnidades === 1 ? '' : 's'} en caja`;
    if (mobTotal) mobTotal.textContent = `${moneda} ${totalVenta.toFixed(2)} ↓`;

    // Cálculo y visualización de vuelto
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
      const subtotalItem = Math.round(item.cantidad * item.precioVenta * 100) / 100;
      return `
        <div class="carrito-item-row" data-index="${index}">
          <div class="item-desc">
            <h4 title="${escapeHtml(item.nombre)}">${escapeHtml(item.nombre)}</h4>
            <span>${moneda} ${item.precioVenta.toFixed(2)} / ${escapeHtml(item.unidad)} (Disp: ${item.stockDisponible})</span>
          </div>
          <div class="qty-control">
            <button type="button" class="qty-btn btn-restar-qty" data-index="${index}" title="Restar">-</button>
            <input type="number" step="any" min="0.001" max="${item.stockDisponible}" class="qty-input input-modificar-qty" data-index="${index}" value="${item.cantidad}">
            <button type="button" class="qty-btn btn-sumar-qty" data-index="${index}" title="Sumar">+</button>
          </div>
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <div class="item-precio-col">
              <div class="item-subtotal-val">${moneda} ${subtotalItem.toFixed(2)}</div>
            </div>
            <button type="button" class="btn-quitar-item" data-index="${index}" title="Quitar ítem">×</button>
          </div>
        </div>
      `;
    }).join('');

    // Eventos de botones y modificación de cantidades en carrito
    contenedorItems.querySelectorAll('.btn-restar-qty').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (carrito[idx]) {
          if (carrito[idx].cantidad > 1) {
            carrito[idx].cantidad = Math.round((carrito[idx].cantidad - 1) * 1000) / 1000;
          } else {
            carrito.splice(idx, 1);
          }
          renderCarritoPOS(Store.getState());
        }
      });
    });

    contenedorItems.querySelectorAll('.btn-sumar-qty').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (carrito[idx]) {
          const nueva = Math.round((carrito[idx].cantidad + 1) * 1000) / 1000;
          if (nueva <= carrito[idx].stockDisponible) {
            carrito[idx].cantidad = nueva;
            renderCarritoPOS(Store.getState());
          } else {
            alert(`Stock insuficiente. Solo quedan ${carrito[idx].stockDisponible} ${carrito[idx].unidad}.`);
          }
        }
      });
    });

    contenedorItems.querySelectorAll('.input-modificar-qty').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.getAttribute('data-index'), 10);
        if (carrito[idx]) {
          let val = parseFloat(input.value);
          if (isNaN(val) || val <= 0) val = 1;
          val = Math.round(val * 1000) / 1000;
          if (val > carrito[idx].stockDisponible) {
            alert(`Cantidad ajustada a la disponibilidad máxima (${carrito[idx].stockDisponible} ${carrito[idx].unidad}).`);
            val = carrito[idx].stockDisponible;
          }
          carrito[idx].cantidad = val;
          renderCarritoPOS(Store.getState());
        }
      });
    });

    contenedorItems.querySelectorAll('.btn-quitar-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (carrito[idx]) {
          carrito.splice(idx, 1);
          renderCarritoPOS(Store.getState());
        }
      });
    });
  }

  // Botones Rápidos de Billetes en Caja
  const btnBilleteExacto = document.getElementById('btn-billete-exacto');
  if (btnBilleteExacto) {
    btnBilleteExacto.addEventListener('click', () => {
      const totalVenta = Math.round(carrito.reduce((sum, it) => sum + (it.cantidad * it.precioVenta), 0) * 100) / 100;
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
        input.value = val.toFixed(2);
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
      if (carrito.length > 0 && confirm("¿Deseas vaciar todos los artículos de la venta actual?")) {
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

  // ==========================================================================
  // FINALIZAR VENTA (COBRO INMEDIATO Y DESCUENTO DE STOCK)
  // ==========================================================================
  const btnCobrar = document.getElementById('btn-carrito-cobrar');
  if (btnCobrar) {
    btnCobrar.addEventListener('click', () => {
      if (carrito.length === 0) return;

      const totalVenta = Math.round(carrito.reduce((sum, it) => sum + (it.cantidad * it.precioVenta), 0) * 100) / 100;
      const clienteNombre = (document.getElementById('pos-cliente-nombre')?.value || "").trim();
      const clienteDoc = (document.getElementById('pos-cliente-doc')?.value || "").trim();
      const tipoComprobante = document.getElementById('pos-tipo-comprobante')?.value || "Nota de Venta";
      const metodoPago = document.getElementById('pos-metodo-pago')?.value || "Efectivo";

      const valRecibido = parseFloat(document.getElementById('pos-pago-recibido')?.value);
      const montoRecibido = !isNaN(valRecibido) && valRecibido > 0 ? valRecibido : totalVenta;

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

      // Venta completada con éxito: limpiar campos y abrir comprobante
      carrito = [];
      if (document.getElementById('pos-cliente-nombre')) document.getElementById('pos-cliente-nombre').value = "";
      if (document.getElementById('pos-cliente-doc')) document.getElementById('pos-cliente-doc').value = "";
      if (document.getElementById('pos-pago-recibido')) document.getElementById('pos-pago-recibido').value = "";

      abrirModalTicket(resultado.venta);
    });
  }

  // ==========================================================================
  // MÓDULO 2: ADMINISTRACIÓN DE PRODUCTOS, KARDEX E INVENTARIO PRO
  // (Inspirado en Shopify, Square Inventory y ERPs modernos de retail)
  // ==========================================================================

  function renderInventario(state) {
    const moneda = (state.configuracion && state.configuracion.moneda) || "S/";
    const productos = state.productos || [];
    const kpis = Store.getKpiInventario();

    // Actualizar Tarjetas KPIs
    const kpiTotalProd = document.getElementById('inv-kpi-total-prod');
    const kpiValorInv = document.getElementById('inv-kpi-valor-total');
    const kpiBajoStock = document.getElementById('inv-kpi-bajo-stock');
    const kpiAgotados = document.getElementById('inv-kpi-agotados');

    if (kpiTotalProd) kpiTotalProd.textContent = String(kpis.total);
    if (kpiValorInv) kpiValorInv.textContent = `${moneda} ${kpis.valorVenta.toFixed(2)}`;
    if (kpiBajoStock) kpiBajoStock.textContent = String(kpis.bajoStock);
    if (kpiAgotados) kpiAgotados.textContent = String(kpis.agotados);

    // Actualizar Contadores de las Pestañas de Estado (Shopify Style)
    const tabTodos = document.getElementById('tab-cnt-todos');
    const tabNormal = document.getElementById('tab-cnt-normal');
    const tabBajo = document.getElementById('tab-cnt-bajo');
    const tabAgotado = document.getElementById('tab-cnt-agotado');
    const tabInactivo = document.getElementById('tab-cnt-inactivo');

    if (tabTodos) tabTodos.textContent = String(kpis.total);
    if (tabNormal) tabNormal.textContent = String(kpis.activos - kpis.bajoStock - kpis.agotados);
    if (tabBajo) tabBajo.textContent = String(kpis.bajoStock);
    if (tabAgotado) tabAgotado.textContent = String(kpis.agotados);
    if (tabInactivo) tabInactivo.textContent = String(kpis.inactivos);

    // Llenar Filtro de Categorías
    const selectFiltroCat = document.getElementById('inv-filtro-categoria');
    if (selectFiltroCat) {
      const catActual = selectFiltroCat.value;
      selectFiltroCat.innerHTML = `<option value="">Todas las Categorías</option>` +
        (state.categorias || []).map(c => `<option value="${escapeHtml(c)}" ${catActual === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
    }

    // Llenar Filtro de Marcas dinámicas
    const selectFiltroMarca = document.getElementById('inv-filtro-marca');
    if (selectFiltroMarca) {
      const marcaActual = selectFiltroMarca.value;
      const marcasUnicas = Array.from(new Set(productos.map(p => p.marca).filter(Boolean))).sort();
      selectFiltroMarca.innerHTML = `<option value="">Todas las Marcas</option>` +
        marcasUnicas.map(m => `<option value="${escapeHtml(m)}" ${marcaActual === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('');
    }

    renderTablaInventario(state);
  }

  function renderTablaInventario(state) {
    const tbody = document.getElementById('inv-tabla-tbody');
    if (!tbody) return;

    const moneda = (state.configuracion && state.configuracion.moneda) || "S/";
    const busqueda = (document.getElementById('inv-buscar-input')?.value || "").toLowerCase().trim();
    const catFiltro = document.getElementById('inv-filtro-categoria')?.value || "";
    const marcaFiltro = document.getElementById('inv-filtro-marca')?.value || "";

    // Toggle botón limpiar búsqueda
    const btnLimpiarBusq = document.getElementById('btn-limpiar-busqueda-inv');
    if (btnLimpiarBusq) {
      btnLimpiarBusq.style.display = busqueda ? 'block' : 'none';
    }

    // 1. Filtrado Multicriterio
    let filtrados = (state.productos || []).filter(p => {
      const stock = Number(p.stock) || 0;
      const stockMin = Number(p.stockMinimo) || 5;
      const esInactivo = p.estado === "inactivo";

      // Filtro de Pestaña de Estado
      if (filtroStockInventario === 'normal' && (stock <= stockMin || esInactivo)) return false;
      if (filtroStockInventario === 'bajo' && (stock <= 0 || stock > stockMin || esInactivo)) return false;
      if (filtroStockInventario === 'agotado' && (stock > 0 || esInactivo)) return false;
      if (filtroStockInventario === 'inactivo' && !esInactivo) return false;
      if (filtroStockInventario === '' && esInactivo) return false; // "Todos" muestra catálogo activo por defecto

      // Filtro Categoría
      if (catFiltro && p.categoria !== catFiltro) return false;

      // Filtro Marca
      if (marcaFiltro && p.marca !== marcaFiltro) return false;

      // Filtro Búsqueda de texto (código, código de barras, nombre, marca, ubicación)
      if (busqueda) {
        const strNombre = (p.nombre || "").toLowerCase();
        const strCodigo = (p.codigo || "").toLowerCase();
        const strBarcode = (p.codigoBarras || "").toLowerCase();
        const strMarca = (p.marca || "").toLowerCase();
        const strUbicacion = (p.ubicacion || "").toLowerCase();
        const strCat = (p.categoria || "").toLowerCase();

        const coincide = strNombre.includes(busqueda) ||
          strCodigo.includes(busqueda) ||
          strBarcode.includes(busqueda) ||
          strMarca.includes(busqueda) ||
          strUbicacion.includes(busqueda) ||
          strCat.includes(busqueda);

        if (!coincide) return false;
      }

      return true;
    });

    // 2. Ordenamiento por Columna
    filtrados.sort((a, b) => {
      const sA = Number(a.stock) || 0;
      const sB = Number(b.stock) || 0;
      const pVA = Number(a.precioVenta) || 0;
      const pVB = Number(b.precioVenta) || 0;
      const pCA = Number(a.precioCompra) || 0;
      const pCB = Number(b.precioCompra) || 0;
      const margA = pCA > 0 ? ((pVA - pCA) / pCA) : 0;
      const margB = pCB > 0 ? ((pVB - pCB) / pCB) : 0;

      switch (ordenInventario) {
        case "nombre_asc":
          return (a.nombre || "").localeCompare(b.nombre || "");
        case "nombre_desc":
          return (b.nombre || "").localeCompare(a.nombre || "");
        case "stock_asc":
          return sA - sB;
        case "stock_desc":
          return sB - sA;
        case "precio_asc":
          return pVA - pVB;
        case "precio_desc":
          return pVB - pVA;
        case "margen_desc":
          return margB - margA;
        case "compra_asc":
          return pCA - pCB;
        case "compra_desc":
          return pCB - pCA;
        case "categoria":
          return (a.categoria || "").localeCompare(b.categoria || "");
        case "recientes":
        default:
          return new Date(b.fechaCreacion || 0) - new Date(a.fechaCreacion || 0);
      }
    });

    // 3. Paginación Inteligente
    const totalRegistros = filtrados.length;
    let limiteFilas = filasPorPagina === "todos" ? totalRegistros : parseInt(filasPorPagina, 10);
    if (!limiteFilas || limiteFilas < 1) limiteFilas = 25;

    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / limiteFilas));
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;
    if (paginaActual < 1) paginaActual = 1;

    const inicioIdx = (paginaActual - 1) * limiteFilas;
    const finIdx = filasPorPagina === "todos" ? totalRegistros : Math.min(inicioIdx + limiteFilas, totalRegistros);
    const registrosPagina = filtrados.slice(inicioIdx, finIdx);

    // Actualizar Controles de Paginación en DOM
    const pagInfo = document.getElementById('inv-paginacion-info');
    const pagTexto = document.getElementById('inv-pag-actual-texto');
    const btnAnt = document.getElementById('btn-pag-anterior');
    const btnSig = document.getElementById('btn-pag-siguiente');

    if (pagInfo) {
      if (totalRegistros === 0) {
        pagInfo.textContent = "Mostrando 0 productos";
      } else {
        pagInfo.textContent = `Mostrando ${inicioIdx + 1} a ${finIdx} de ${totalRegistros} productos`;
      }
    }
    if (pagTexto) pagTexto.textContent = `Pág. ${paginaActual} de ${totalPaginas}`;
    if (btnAnt) btnAnt.disabled = paginaActual <= 1;
    if (btnSig) btnSig.disabled = paginaActual >= totalPaginas;

    // Sincronizar select de orden
    const selOrden = document.getElementById('inv-select-ordenar');
    if (selOrden && selOrden.value !== ordenInventario) {
      selOrden.value = ordenInventario;
    }

    // 4. Renderizado de Filas
    if (registrosPagina.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center; padding: 3.5rem 1.5rem; color: #64748b;">
            <div style="font-size:2.8rem; margin-bottom:0.6rem;">📦</div>
            <p style="font-weight:800; font-size:1.05rem; color:#1e293b;">No hay productos para el criterio seleccionado</p>
            <p style="font-size:0.85rem; margin-top:0.35rem; color:#64748b;">Haz clic en <b>"+ Nuevo Producto"</b> para registrar artículos o ajusta los filtros superiores.</p>
          </td>
        </tr>
      `;
      actualizarBarraAccionesMasivas();
      return;
    }

    tbody.innerHTML = registrosPagina.map(p => {
      const stock = Number(p.stock) || 0;
      const stockMin = Number(p.stockMinimo) || 5;
      const pCompra = Number(p.precioCompra) || 0;
      const pVenta = Number(p.precioVenta) || 0;
      const margen = pCompra > 0 ? (((pVenta - pCompra) / pCompra) * 100).toFixed(0) : "0";
      const margenNum = Number(margen);
      const esInactivo = p.estado === "inactivo";
      const estaSeleccionado = productosSeleccionados.has(p.id);

      // Color e indicador de margen de utilidad
      let claseMargen = "color:#10b981;"; // Verde > 30%
      if (margenNum < 15) {
        claseMargen = "color:#ef4444;"; // Rojo < 15%
      } else if (margenNum < 30) {
        claseMargen = "color:#f59e0b;"; // Naranja 15-30%
      }

      // Estado de stock y barra visual
      let tagClase = "ok";
      let tagTexto = `${stock} ${p.unidad}`;
      let estadoBadge = `<span class="stock-tag ok">En Stock</span>`;
      let porcentajeBarra = Math.min(100, Math.max(5, (stock / Math.max(stockMin * 3, p.stockMaximo || 20)) * 100));

      if (esInactivo) {
        tagClase = "cero";
        estadoBadge = `<span class="stock-tag" style="background:#f1f5f9; color:#64748b;">Inactivo</span>`;
      } else if (stock <= 0) {
        tagClase = "cero";
        tagTexto = `0 ${p.unidad}`;
        estadoBadge = `<span class="stock-tag cero">Agotado</span>`;
        porcentajeBarra = 0;
      } else if (stock <= stockMin) {
        tagClase = "alerta";
        tagTexto = `${stock} ${p.unidad}`;
        estadoBadge = `<span class="stock-tag alerta">Bajo Stock</span>`;
      }

      return `
        <tr class="${estaSeleccionado ? 'fila-seleccionada' : ''} ${esInactivo ? 'fila-anulada' : ''}">
          <td style="text-align:center;">
            <input type="checkbox" class="chk-prod-item" data-id="${p.id}" ${estaSeleccionado ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px; accent-color:var(--brand-primary);">
          </td>
          <td>
            <div style="display:flex; flex-direction:column; gap:2px;">
              <code style="font-weight:700; color:#334155; font-family:var(--font-mono); font-size:0.85rem;">${escapeHtml(p.codigo || '-')}</code>
              ${p.codigoBarras && p.codigoBarras !== p.codigo ? `<span style="font-size:0.7rem; color:#94a3b8; font-family:var(--font-mono);">🏷️ ${escapeHtml(p.codigoBarras)}</span>` : ''}
            </div>
          </td>
          <td>
            <div style="font-weight:800; color:#0f172a; font-size:0.92rem;">${escapeHtml(p.nombre)}</div>
            <div style="display:flex; align-items:center; gap:0.5rem; margin-top:2px; flex-wrap:wrap;">
              ${p.marca ? `<span class="marca-tag" style="font-size:0.7rem; font-weight:700; background:#f1f5f9; color:#475569; padding:1px 6px; border-radius:4px; border:1px solid #e2e8f0;">${escapeHtml(p.marca)}</span>` : ''}
              ${p.ubicacion ? `<span style="font-size:0.72rem; color:#64748b;">📍 ${escapeHtml(p.ubicacion)}</span>` : ''}
            </div>
          </td>
          <td>
            <span class="chip-cat" style="font-size:0.75rem; padding:0.18rem 0.55rem;">${escapeHtml(p.categoria || 'Otros')}</span>
          </td>
          <td class="text-right" style="font-family:var(--font-mono); color:#475569;">${moneda} ${pCompra.toFixed(2)}</td>
          <td class="text-right">
            <div style="font-weight:900; color:var(--brand-primary); font-family:var(--font-mono); font-size:0.95rem;">${moneda} ${pVenta.toFixed(2)}</div>
            ${p.precioMayor ? `<div style="font-size:0.7rem; color:#64748b;">x Mayor: ${moneda} ${Number(p.precioMayor).toFixed(2)}</div>` : ''}
          </td>
          <td class="text-right">
            <span style="font-size:0.82rem; font-weight:800; font-family:var(--font-mono); ${claseMargen}">+${margen}%</span>
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:0.4rem;">
              <span class="stock-tag ${tagClase}" style="font-weight:800;">${tagTexto}</span>
              <button type="button" class="btn btn-outline btn-sm btn-agregar-stock" data-id="${p.id}" title="Reabastecer o ingresar stock (+ Stock)" style="padding:0.2rem 0.45rem; font-size:0.75rem; border-color:var(--brand-primary); color:var(--brand-primary);">
                <b>+ Stock</b>
              </button>
            </div>
            <div class="stock-nivel-barra" title="Nivel de existencias">
              <div class="stock-nivel-llenado ${tagClase}" style="width:${porcentajeBarra}%;"></div>
            </div>
          </td>
          <td>${estadoBadge}</td>
          <td class="text-right">
            <div style="display:inline-flex; gap:0.25rem;">
              <button type="button" class="btn btn-outline btn-sm btn-editar-prod" data-id="${p.id}" title="Editar ficha de producto">✏️</button>
              <button type="button" class="btn btn-outline btn-sm btn-duplicar-prod" data-id="${p.id}" title="Duplicar / Clonar producto">📄</button>
              <button type="button" class="btn btn-outline btn-sm btn-etiqueta-prod" data-id="${p.id}" title="Imprimir etiqueta con código de barras">🏷️</button>
              <button type="button" class="btn btn-outline btn-sm btn-kardex-prod" data-id="${p.id}" title="Ver historial y movimientos en Kardex">📜</button>
              <button type="button" class="btn btn-outline btn-sm btn-eliminar-prod" data-id="${p.id}" title="Eliminar producto" style="color:var(--danger);">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Bindeo de eventos en elementos de fila
    tbody.querySelectorAll('.chk-prod-item').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = chk.getAttribute('data-id');
        if (chk.checked) {
          productosSeleccionados.add(id);
        } else {
          productosSeleccionados.delete(id);
        }
        actualizarBarraAccionesMasivas();
        actualizarCheckboxMaestro();
      });
    });

    tbody.querySelectorAll('.btn-agregar-stock').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id) abrirModalAgregarStock(id);
      });
    });

    tbody.querySelectorAll('.btn-editar-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id) abrirModalEditarProducto(id);
      });
    });

    tbody.querySelectorAll('.btn-duplicar-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id) {
          const clon = Store.duplicateProduct(id);
          if (clon) {
            abrirModalEditarProducto(clon.id);
          }
        }
      });
    });

    tbody.querySelectorAll('.btn-etiqueta-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const prod = (Store.getState().productos || []).find(p => p.id === id);
        if (prod) {
          abrirModalEtiquetasBarcode([prod]);
        }
      });
    });

    tbody.querySelectorAll('.btn-kardex-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id) abrirModalKardex(id);
      });
    });

    tbody.querySelectorAll('.btn-eliminar-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const prod = (Store.getState().productos || []).find(p => p.id === id);
        if (prod && confirm(`¿Deseas eliminar definitivamente "${prod.nombre}" del catálogo?`)) {
          productosSeleccionados.delete(id);
          Store.deleteProduct(id);
        }
      });
    });

    actualizarBarraAccionesMasivas();
    actualizarCheckboxMaestro();
  }

  function actualizarCheckboxMaestro() {
    const chkMaestro = document.getElementById('inv-chk-todos');
    if (!chkMaestro) return;

    const chksVisibles = Array.from(document.querySelectorAll('.chk-prod-item'));
    if (chksVisibles.length === 0) {
      chkMaestro.checked = false;
      chkMaestro.indeterminate = false;
      return;
    }

    const todosMarcados = chksVisibles.every(c => c.checked);
    const algunoMarcado = chksVisibles.some(c => c.checked);

    chkMaestro.checked = todosMarcados;
    chkMaestro.indeterminate = !todosMarcados && algunoMarcado;
  }

  function actualizarBarraAccionesMasivas() {
    const barra = document.getElementById('inv-barra-bulk');
    const contador = document.getElementById('inv-bulk-contador');
    if (!barra) return;

    const cant = productosSeleccionados.size;
    if (cant > 0) {
      barra.style.display = 'flex';
      if (contador) contador.textContent = `${cant} producto${cant > 1 ? 's' : ''} seleccionado${cant > 1 ? 's' : ''}`;
    } else {
      barra.style.display = 'none';
    }
  }

  // Checkbox Maestro Seleccionar Todos los Visibles
  document.getElementById('inv-chk-todos')?.addEventListener('change', (e) => {
    const marcar = e.target.checked;
    document.querySelectorAll('.chk-prod-item').forEach(chk => {
      chk.checked = marcar;
      const id = chk.getAttribute('data-id');
      if (marcar) {
        productosSeleccionados.add(id);
      } else {
        productosSeleccionados.delete(id);
      }
    });
    actualizarBarraAccionesMasivas();
  });

  // Acciones en Lote (Bulk Actions)
  document.getElementById('btn-bulk-deseleccionar')?.addEventListener('click', () => {
    productosSeleccionados.clear();
    document.querySelectorAll('.chk-prod-item').forEach(c => c.checked = false);
    actualizarCheckboxMaestro();
    actualizarBarraAccionesMasivas();
  });

  document.getElementById('btn-bulk-eliminar')?.addEventListener('click', () => {
    const cant = productosSeleccionados.size;
    if (cant === 0) return;
    if (confirm(`¿Estás seguro de eliminar los ${cant} productos seleccionados? Esta acción es definitiva.`)) {
      Store.deleteProductsBatch(Array.from(productosSeleccionados));
      productosSeleccionados.clear();
      actualizarBarraAccionesMasivas();
    }
  });

  document.getElementById('btn-bulk-exportar')?.addEventListener('click', () => {
    if (productosSeleccionados.size === 0) return;
    ExportManager.exportarInventarioExcel(Array.from(productosSeleccionados));
  });

  document.getElementById('btn-bulk-etiquetas')?.addEventListener('click', () => {
    const prods = (Store.getState().productos || []).filter(p => productosSeleccionados.has(p.id));
    if (prods.length > 0) {
      abrirModalEtiquetasBarcode(prods);
    }
  });

  document.getElementById('btn-bulk-categoria')?.addEventListener('click', () => {
    if (productosSeleccionados.size === 0) return;
    const modal = document.getElementById('modal-bulk-categoria');
    const cnt = document.getElementById('bulk-categoria-contador');
    const sel = document.getElementById('bulk-categoria-select');
    if (!modal) return;

    if (cnt) cnt.textContent = String(productosSeleccionados.size);
    if (sel) {
      sel.innerHTML = (Store.getState().categorias || []).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    }
    modal.classList.add('activo');
  });

  document.getElementById('form-bulk-categoria')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nuevaCat = document.getElementById('bulk-categoria-select')?.value;
    if (nuevaCat && productosSeleccionados.size > 0) {
      Store.updateCategoryBatch(Array.from(productosSeleccionados), nuevaCat);
      cerrarModales();
    }
  });

  document.getElementById('btn-bulk-precios')?.addEventListener('click', () => {
    if (productosSeleccionados.size === 0) return;
    const modal = document.getElementById('modal-bulk-precios');
    const cnt = document.getElementById('bulk-precios-contador');
    if (!modal) return;
    if (cnt) cnt.textContent = String(productosSeleccionados.size);
    modal.classList.add('activo');
  });

  document.getElementById('form-bulk-precios')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const tipo = document.getElementById('bulk-precios-tipo')?.value || "porcentaje";
    const valor = parseFloat(document.getElementById('bulk-precios-valor')?.value) || 0;
    const redondear = document.getElementById('bulk-precios-redondear')?.checked !== false;

    if (productosSeleccionados.size > 0) {
      Store.adjustPricesBatch(Array.from(productosSeleccionados), { tipo, valor, redondear });
      cerrarModales();
    }
  });

  // Filtros y Paginación de Inventario
  document.getElementById('inv-buscar-input')?.addEventListener('input', () => {
    paginaActual = 1;
    renderTablaInventario(Store.getState());
  });

  document.getElementById('btn-limpiar-busqueda-inv')?.addEventListener('click', () => {
    const input = document.getElementById('inv-buscar-input');
    if (input) {
      input.value = "";
      paginaActual = 1;
      renderTablaInventario(Store.getState());
      input.focus();
    }
  });

  document.getElementById('inv-filtro-categoria')?.addEventListener('change', () => {
    paginaActual = 1;
    renderTablaInventario(Store.getState());
  });

  document.getElementById('inv-filtro-marca')?.addEventListener('change', () => {
    paginaActual = 1;
    renderTablaInventario(Store.getState());
  });

  document.getElementById('inv-select-ordenar')?.addEventListener('change', (e) => {
    ordenInventario = e.target.value;
    paginaActual = 1;
    renderTablaInventario(Store.getState());
  });

  document.getElementById('inv-filas-por-pagina')?.addEventListener('change', (e) => {
    filasPorPagina = e.target.value;
    paginaActual = 1;
    renderTablaInventario(Store.getState());
  });

  document.getElementById('btn-pag-anterior')?.addEventListener('click', () => {
    if (paginaActual > 1) {
      paginaActual--;
      renderTablaInventario(Store.getState());
    }
  });

  document.getElementById('btn-pag-siguiente')?.addEventListener('click', () => {
    paginaActual++;
    renderTablaInventario(Store.getState());
  });

  // Pestañas de Estado con Contadores (Shopify Style)
  document.querySelectorAll('.pastilla-stock').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.pastilla-stock').forEach(t => t.classList.remove('activo'));
      tab.classList.add('activo');
      filtroStockInventario = tab.getAttribute('data-filtro') || "";
      paginaActual = 1;
      renderTablaInventario(Store.getState());
    });
  });

  // Encabezados Ordenables de Tabla (Click en th.sortable)
  document.querySelectorAll('.tabla-general th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-col');
      if (col === 'nombre') {
        ordenInventario = ordenInventario === 'nombre_asc' ? 'nombre_desc' : 'nombre_asc';
      } else if (col === 'stock') {
        ordenInventario = ordenInventario === 'stock_asc' ? 'stock_desc' : 'stock_asc';
      } else if (col === 'venta') {
        ordenInventario = ordenInventario === 'precio_desc' ? 'precio_asc' : 'precio_desc';
      } else if (col === 'compra') {
        ordenInventario = ordenInventario === 'compra_desc' ? 'compra_asc' : 'compra_desc';
      } else if (col === 'margen') {
        ordenInventario = 'margen_desc';
      } else if (col === 'categoria') {
        ordenInventario = 'categoria';
      } else if (col === 'codigo') {
        ordenInventario = 'recientes';
      }
      renderTablaInventario(Store.getState());
    });
  });

  // ==========================================================================
  // PÁGINA INDIVIDUAL: FICHA DE PRODUCTO CON CALCULADORA Y BARCODE EN VIVO
  // ==========================================================================

  const inputCompraProd = document.getElementById('prod-input-compra');
  const inputMargenProd = document.getElementById('prod-input-margen');
  const inputVentaProd = document.getElementById('prod-input-venta');

  function actualizarVistaPreviaEtiquetaProducto() {
    const previewCont = document.getElementById('prod-live-barcode-preview');
    if (!previewCont) return;

    const codigo = document.getElementById('prod-input-codigo')?.value.trim() || "FER-0001";
    const codigoBarras = document.getElementById('prod-input-barcode')?.value.trim() || codigo;
    const nombre = document.getElementById('prod-input-nombre')?.value.trim() || "Nombre del Producto";
    const categoria = document.getElementById('prod-select-categoria')?.value || "General";
    const marca = document.getElementById('prod-input-marca')?.value.trim() || "";
    const unidad = document.getElementById('prod-select-unidad')?.value || "Unidad";
    const precioVenta = parseFloat(document.getElementById('prod-input-venta')?.value) || 0;

    const htmlSticker = ExportManager.generarEtiquetasHTML([{
      producto: {
        codigo,
        codigoBarras,
        nombre,
        categoria,
        marca,
        unidad,
        precioVenta
      },
      copias: 1
    }]);
    previewCont.innerHTML = htmlSticker;
  }

  function actualizarCalculadoraMargen(origen = 'costo') {
    const costo = parseFloat(inputCompraProd?.value) || 0;
    const margenDeseado = parseFloat(inputMargenProd?.value) || 0;
    let venta = parseFloat(inputVentaProd?.value) || 0;

    if (origen === 'costo' || origen === 'margen') {
      if (costo > 0) {
        venta = Math.round((costo * (1 + margenDeseado / 100)) * 100) / 100;
        if (inputVentaProd) inputVentaProd.value = venta.toFixed(2);
      }
    } else if (origen === 'venta') {
      if (costo > 0 && venta > 0) {
        const nuevoMargen = Math.round((((venta - costo) / costo) * 100) * 10) / 10;
        if (inputMargenProd) inputMargenProd.value = nuevoMargen.toFixed(1);
      }
    }

    const ganancia = Math.round((venta - costo) * 100) / 100;
    const margenCalc = costo > 0 ? (((venta - costo) / costo) * 100).toFixed(1) : "0.0";

    const prevCosto = document.getElementById('calc-preview-costo');
    const prevGanancia = document.getElementById('calc-preview-ganancia');
    const prevMargen = document.getElementById('calc-preview-margen');

    if (prevCosto) prevCosto.textContent = `S/ ${costo.toFixed(2)}`;
    if (prevGanancia) {
      prevGanancia.textContent = `${ganancia >= 0 ? '+' : ''} S/ ${ganancia.toFixed(2)}`;
      prevGanancia.className = `margen-stat-val ${ganancia >= 0 ? 'ganancia-positiva' : 'ganancia-negativa'}`;
    }
    if (prevMargen) {
      prevMargen.textContent = `${Number(margenCalc) >= 0 ? '+' : ''}${margenCalc}%`;
      prevMargen.className = `margen-stat-val ${Number(margenCalc) >= 0 ? 'ganancia-positiva' : 'ganancia-negativa'}`;
    }

    actualizarVistaPreviaEtiquetaProducto();
  }

  inputCompraProd?.addEventListener('input', () => actualizarCalculadoraMargen('costo'));
  inputMargenProd?.addEventListener('input', () => actualizarCalculadoraMargen('margen'));
  inputVentaProd?.addEventListener('input', () => actualizarCalculadoraMargen('venta'));

  ['prod-input-codigo', 'prod-input-barcode', 'prod-input-nombre', 'prod-input-marca', 'prod-select-categoria', 'prod-select-unidad'].forEach(idCampo => {
    const el = document.getElementById(idCampo);
    if (el) {
      el.addEventListener('input', actualizarVistaPreviaEtiquetaProducto);
      el.addEventListener('change', actualizarVistaPreviaEtiquetaProducto);
    }
  });

  document.getElementById('btn-autogenerar-codigo')?.addEventListener('click', () => {
    const inputCod = document.getElementById('prod-input-codigo');
    if (inputCod) {
      const correlativo = String((Store.getState().productos || []).length + 1).padStart(4, "0");
      inputCod.value = "FER-" + correlativo;
      actualizarVistaPreviaEtiquetaProducto();
    }
  });

  document.getElementById('btn-inv-nuevo-producto')?.addEventListener('click', () => {
    abrirModalNuevoProducto();
  });

  function abrirModalNuevoProducto() {
    productoEnEdicion = null;
    const titulo = document.getElementById('modal-producto-titulo');
    const form = document.getElementById('form-producto');
    if (!form) return;

    if (titulo) titulo.textContent = "➕ Nuevo Producto de Ferretería";
    form.reset();
    poblarSelectsProducto();

    const correlativo = String((Store.getState().productos || []).length + 1).padStart(4, "0");
    const codInput = document.getElementById('prod-input-codigo');
    if (codInput) codInput.value = "FER-" + correlativo;

    if (inputMargenProd) inputMargenProd.value = "30.0";
    if (inputCompraProd) inputCompraProd.value = "0.00";
    if (inputVentaProd) inputVentaProd.value = "0.00";
    actualizarCalculadoraMargen('costo');

    cambiarSeccion('producto');
    document.getElementById('prod-input-nombre')?.focus();
  }

  function abrirModalEditarProducto(id) {
    const prod = (Store.getState().productos || []).find(p => p.id === id);
    if (!prod) return;

    productoEnEdicion = prod;
    const titulo = document.getElementById('modal-producto-titulo');
    if (titulo) titulo.textContent = "✏️ Editar Producto: " + prod.nombre;
    poblarSelectsProducto();

    const setVal = (elemId, val) => {
      const el = document.getElementById(elemId);
      if (el) el.value = val !== undefined && val !== null ? val : "";
    };

    setVal('prod-input-codigo', prod.codigo);
    setVal('prod-input-barcode', prod.codigoBarras || prod.codigo);
    setVal('prod-select-estado', prod.estado || "activo");
    setVal('prod-input-nombre', prod.nombre);
    setVal('prod-select-categoria', prod.categoria || "Otros");
    setVal('prod-input-marca', prod.marca || "");
    setVal('prod-select-unidad', prod.unidad || "Unidad");
    setVal('prod-input-compra', prod.precioCompra);
    setVal('prod-input-venta', prod.precioVenta);
    setVal('prod-input-mayor', prod.precioMayor || "");
    setVal('prod-input-stock', prod.stock);
    setVal('prod-input-stock-min', prod.stockMinimo);
    setVal('prod-input-stock-max', prod.stockMaximo || "");
    setVal('prod-input-ubicacion', prod.ubicacion);
    setVal('prod-input-descripcion', prod.descripcion || "");

    const chkFrac = document.getElementById('prod-chk-fraccionada');
    if (chkFrac) chkFrac.checked = prod.permiteDecimales !== false;

    actualizarCalculadoraMargen('venta');
    cambiarSeccion('producto');
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

  document.getElementById('form-producto')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const codigo = document.getElementById('prod-input-codigo')?.value.trim();
    const codigoBarras = document.getElementById('prod-input-barcode')?.value.trim();
    const estado = document.getElementById('prod-select-estado')?.value || "activo";
    const nombre = document.getElementById('prod-input-nombre')?.value.trim();
    const categoria = document.getElementById('prod-select-categoria')?.value;
    const marca = document.getElementById('prod-input-marca')?.value.trim();
    const unidad = document.getElementById('prod-select-unidad')?.value;
    const precioCompra = parseFloat(document.getElementById('prod-input-compra')?.value) || 0;
    const precioVenta = parseFloat(document.getElementById('prod-input-venta')?.value) || 0;
    const precioMayor = parseFloat(document.getElementById('prod-input-mayor')?.value) || 0;
    const permiteDecimales = document.getElementById('prod-chk-fraccionada')?.checked !== false;
    const stock = parseFloat(document.getElementById('prod-input-stock')?.value) || 0;
    const stockMinimo = parseFloat(document.getElementById('prod-input-stock-min')?.value) || 5;
    const stockMaximo = parseFloat(document.getElementById('prod-input-stock-max')?.value) || 0;
    const ubicacion = document.getElementById('prod-input-ubicacion')?.value.trim();
    const descripcion = document.getElementById('prod-input-descripcion')?.value.trim();

    if (!nombre) {
      alert("El nombre del producto es obligatorio.");
      return;
    }

    const payload = {
      codigo, codigoBarras, estado, nombre, categoria, marca, unidad,
      precioCompra, precioVenta, precioMayor, permiteDecimales,
      stock, stockMinimo, stockMaximo, ubicacion, descripcion
    };

    if (productoEnEdicion) {
      Store.updateProduct(productoEnEdicion.id, payload);
    } else {
      Store.addProduct(payload);
    }

    productoEnEdicion = null;
    cambiarSeccion('inventario');
  });

  // ==========================================================================
  // MODAL RÁPIDO: REABASTECIMIENTO Y AJUSTE DE STOCK (+ STOCK)
  // ==========================================================================

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
    const selectTipo = document.getElementById('stock-select-tipo');

    const actualizarPreviewStock = () => {
      const val = parseFloat(inputCant?.value) || 0;
      const tipo = selectTipo?.value || "Ingreso por Compra";
      let total = prod.stock;
      if (tipo === "Merma / Daño" || tipo === "Uso Interno") {
        total = Math.max(0, Math.round(((Number(prod.stock) || 0) - val) * 1000) / 1000);
        document.getElementById('stock-preview-nuevo').textContent = `${total} ${prod.unidad} (-${val})`;
      } else if (tipo === "Ajuste de Conteo Físico") {
        total = val;
        document.getElementById('stock-preview-nuevo').textContent = `${total} ${prod.unidad} (Fijado a ${val})`;
      } else {
        total = Math.round(((Number(prod.stock) || 0) + val) * 1000) / 1000;
        document.getElementById('stock-preview-nuevo').textContent = `${total} ${prod.unidad} (+${val})`;
      }
    };

    if (inputCant) {
      inputCant.focus();
      inputCant.oninput = actualizarPreviewStock;
    }
    if (selectTipo) {
      selectTipo.onchange = actualizarPreviewStock;
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

    const tipo = document.getElementById('stock-select-tipo')?.value || "Ingreso por Compra";
    const nuevoCosto = document.getElementById('stock-input-compra')?.value;
    const motivo = document.getElementById('stock-input-motivo')?.value || tipo;

    let res;
    if (tipo === "Ajuste de Conteo Físico") {
      res = Store.adjustStock(productoParaStock.id, cantidad, motivo, tipo);
    } else if (tipo === "Merma / Daño" || tipo === "Uso Interno") {
      const nuevoStock = Math.max(0, productoParaStock.stock - cantidad);
      res = Store.adjustStock(productoParaStock.id, nuevoStock, motivo, tipo);
    } else {
      res = Store.addStock(productoParaStock.id, cantidad, motivo, nuevoCosto ? parseFloat(nuevoCosto) : null, tipo);
    }

    if (res && res.ok) {
      cerrarModales();
    } else {
      alert("Error: " + (res?.error || "No se pudo actualizar el stock"));
    }
  });

  // ==========================================================================
  // PÁGINA INDIVIDUAL: KARDEX / AUDITORÍA DE MOVIMIENTOS DE STOCK
  // ==========================================================================

  document.getElementById('btn-inv-abrir-kardex')?.addEventListener('click', () => {
    abrirModalKardex(null);
  });

  document.getElementById('btn-kardex-ver-todos')?.addEventListener('click', () => {
    abrirModalKardex(null);
  });

  function abrirModalKardex(productoId = null) {
    productoFiltroKardex = productoId;
    renderTablaKardex();
    cambiarSeccion('kardex');
  }

  function renderTablaKardex() {
    const tbody = document.getElementById('kardex-tabla-tbody');
    if (!tbody) return;

    const subtitulo = document.getElementById('kardex-subtitulo-filtro');
    const btnVerTodos = document.getElementById('btn-kardex-ver-todos');

    if (productoFiltroKardex) {
      const prod = (Store.getState().productos || []).find(p => p.id === productoFiltroKardex);
      if (subtitulo) subtitulo.innerHTML = `Filtrando historial del producto: <b>${escapeHtml(prod ? prod.nombre : productoFiltroKardex)}</b>`;
      if (btnVerTodos) btnVerTodos.style.display = 'inline-flex';
    } else {
      if (subtitulo) subtitulo.textContent = "Trazabilidad completa de entradas por compra, salidas por venta, devoluciones y ajustes físicos.";
      if (btnVerTodos) btnVerTodos.style.display = 'none';
    }

    const todosMovs = Store.getStockMovements(productoFiltroKardex, 1000);

    // Actualizar KPIs de la página Kardex
    const kpiTotal = document.getElementById('kardex-kpi-total');
    const kpiEntradas = document.getElementById('kardex-kpi-entradas');
    const kpiSalidas = document.getElementById('kardex-kpi-salidas');
    const kpiAjustes = document.getElementById('kardex-kpi-ajustes');

    const cntEntradas = todosMovs.filter(m => m.tipo && m.tipo.includes("Ingreso")).length;
    const cntSalidas = todosMovs.filter(m => m.tipo && m.tipo.includes("Salida")).length;
    const cntAjustes = todosMovs.length - cntEntradas - cntSalidas;

    if (kpiTotal) kpiTotal.textContent = String(todosMovs.length);
    if (kpiEntradas) kpiEntradas.textContent = String(cntEntradas);
    if (kpiSalidas) kpiSalidas.textContent = String(cntSalidas);
    if (kpiAjustes) kpiAjustes.textContent = String(cntAjustes);

    const busqueda = (document.getElementById('kardex-buscar-input')?.value || "").toLowerCase().trim();
    const filtroTipo = document.getElementById('kardex-filtro-tipo')?.value || "";
    let movs = todosMovs;

    if (filtroTipo) {
      movs = movs.filter(m => m.tipo && m.tipo.includes(filtroTipo));
    }
    if (busqueda) {
      movs = movs.filter(m =>
        (m.nombre && m.nombre.toLowerCase().includes(busqueda)) ||
        (m.codigo && m.codigo.toLowerCase().includes(busqueda)) ||
        (m.motivo && m.motivo.toLowerCase().includes(busqueda)) ||
        (m.referencia && m.referencia.toLowerCase().includes(busqueda))
      );
    }

    if (movs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding:3rem 1.5rem; color:#64748b;">
            <div style="font-size:2.4rem; margin-bottom:0.4rem;">📜</div>
            <p style="font-weight:700; color:#1e293b;">No hay movimientos registrados en el Kardex para este criterio</p>
            <p style="font-size:0.82rem; margin-top:0.2rem;">Cada ingreso de stock, venta o ajuste quedará auditado automáticamente aquí.</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = movs.map(m => {
      let claseBadge = "ajuste";
      if (m.tipo.includes("Ingreso")) claseBadge = "ingreso";
      else if (m.tipo.includes("Salida")) claseBadge = "salida";
      else if (m.tipo.includes("Devolución")) claseBadge = "devolucion";

      const deltaPositivo = Number(m.cantidad) >= 0;
      const claseDelta = deltaPositivo ? "kardex-delta-positivo" : "kardex-delta-negativo";
      const signo = deltaPositivo ? "+" : "";

      return `
        <tr>
          <td style="font-size:0.78rem; color:#475569; white-space:nowrap;">${m.fecha ? m.fecha.replace("T", " ").slice(0, 19) : "-"}</td>
          <td><code style="font-family:var(--font-mono); font-weight:700;">${escapeHtml(m.codigo)}</code></td>
          <td style="font-weight:700; color:#0f172a;">${escapeHtml(m.nombre)}</td>
          <td><span class="kardex-badge ${claseBadge}">${escapeHtml(m.tipo)}</span></td>
          <td class="text-right ${claseDelta}">${signo}${m.cantidad}</td>
          <td class="text-right" style="font-family:var(--font-mono); color:#64748b;">${m.stockAnterior}</td>
          <td class="text-right" style="font-family:var(--font-mono); font-weight:800; color:#0f172a;">${m.stockNuevo}</td>
          <td>
            <div style="font-size:0.82rem; color:#334155;">${escapeHtml(m.motivo || '-')}</div>
            ${m.referencia ? `<div style="font-size:0.72rem; color:#94a3b8;">${escapeHtml(m.referencia)}</div>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('kardex-buscar-input')?.addEventListener('input', renderTablaKardex);
  document.getElementById('kardex-filtro-tipo')?.addEventListener('change', renderTablaKardex);
  document.getElementById('btn-kardex-exportar-excel')?.addEventListener('click', () => {
    ExportManager.exportarKardexExcel(productoFiltroKardex);
  });

  // ==========================================================================
  // PÁGINA INDIVIDUAL: ESTUDIO E IMPRESIÓN DE ETIQUETAS CON CÓDIGO DE BARRAS
  // ==========================================================================

  document.getElementById('btn-inv-abrir-etiquetas')?.addEventListener('click', () => {
    const todosActivos = (Store.getState().productos || []).filter(p => p.estado !== "inactivo");
    abrirModalEtiquetasBarcode(todosActivos.slice(0, 20));
  });

  function abrirModalEtiquetasBarcode(productos) {
    productosParaEtiquetas = Array.isArray(productos) ? productos : [];
    renderListaSeleccionEtiquetas();
    renderPrevisualizacionEtiquetas();
    cambiarSeccion('etiquetas');
  }

  function renderListaSeleccionEtiquetas() {
    const listaCont = document.getElementById('etiquetas-lista-productos');
    if (!listaCont) return;

    const todosProds = (Store.getState().productos || []).filter(p => p.estado !== "inactivo");
    if (todosProds.length === 0) {
      listaCont.innerHTML = `<div style="padding:1.5rem; text-align:center; color:#64748b; font-size:0.85rem;">No hay productos activos en el catálogo.</div>`;
      return;
    }

    const idsActivos = new Set(productosParaEtiquetas.map(p => p.id));
    listaCont.innerHTML = todosProds.map(p => {
      const marcado = idsActivos.has(p.id);
      return `
        <label class="item-seleccion-etiqueta">
          <div style="display:flex; align-items:center; gap:0.55rem;">
            <input type="checkbox" class="chk-etiqueta-item" data-id="${p.id}" ${marcado ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--brand-primary);">
            <div>
              <div style="font-weight:700; color:#0f172a;">${escapeHtml(p.nombre)}</div>
              <div style="font-size:0.72rem; color:#64748b; font-family:var(--font-mono);">${escapeHtml(p.codigo)}</div>
            </div>
          </div>
          <span style="font-weight:800; font-size:0.82rem; color:var(--brand-primary);">S/ ${Number(p.precioVenta || 0).toFixed(2)}</span>
        </label>
      `;
    }).join('');

    listaCont.querySelectorAll('.chk-etiqueta-item').forEach(chk => {
      chk.addEventListener('change', () => {
        const marcadosIds = new Set(
          Array.from(listaCont.querySelectorAll('.chk-etiqueta-item:checked')).map(c => c.getAttribute('data-id'))
        );
        productosParaEtiquetas = todosProds.filter(p => marcadosIds.has(p.id));
        renderPrevisualizacionEtiquetas();
      });
    });
  }

  document.getElementById('btn-etiquetas-sel-todos')?.addEventListener('click', () => {
    productosParaEtiquetas = (Store.getState().productos || []).filter(p => p.estado !== "inactivo");
    renderListaSeleccionEtiquetas();
    renderPrevisualizacionEtiquetas();
  });

  document.getElementById('btn-etiquetas-limpiar')?.addEventListener('click', () => {
    productosParaEtiquetas = [];
    renderListaSeleccionEtiquetas();
    renderPrevisualizacionEtiquetas();
  });

  function renderPrevisualizacionEtiquetas() {
    const contenedor = document.getElementById('etiquetas-preview-contenedor');
    const inputCopias = document.getElementById('etiquetas-input-copias');
    const resumenTotal = document.getElementById('etiquetas-resumen-total');
    if (!contenedor) return;

    const copias = Math.max(1, parseInt(inputCopias?.value, 10) || 1);
    const totalStickers = productosParaEtiquetas.length * copias;
    if (resumenTotal) {
      resumenTotal.textContent = `${totalStickers} etiqueta${totalStickers === 1 ? '' : 's'} lista${totalStickers === 1 ? '' : 's'}`;
    }

    if (productosParaEtiquetas.length === 0) {
      contenedor.innerHTML = `
        <div style="text-align:center; padding:3.5rem 1rem; color:#64748b;">
          <div style="font-size:2.5rem; margin-bottom:0.5rem;">🏷️</div>
          <p style="font-weight:700; color:#1e293b;">Selecciona uno o más productos en la lista izquierda</p>
          <p style="font-size:0.82rem; margin-top:0.25rem;">Las etiquetas con códigos de barras Code-128 se generarán aquí al instante.</p>
        </div>
      `;
      return;
    }

    const items = productosParaEtiquetas.map(p => ({ producto: p, copias: copias }));
    const htmlEtiquetas = ExportManager.generarEtiquetasHTML(items);
    contenedor.innerHTML = htmlEtiquetas;
  }

  document.getElementById('etiquetas-input-copias')?.addEventListener('input', renderPrevisualizacionEtiquetas);
  document.getElementById('etiquetas-select-formato')?.addEventListener('change', renderPrevisualizacionEtiquetas);

  document.getElementById('btn-imprimir-etiquetas-barcode')?.addEventListener('click', () => {
    const contenedor = document.getElementById('etiquetas-preview-contenedor');
    const seccionImpresion = document.getElementById('seccion-impresion');
    if (!contenedor || !seccionImpresion || productosParaEtiquetas.length === 0) {
      alert("Selecciona al menos un producto para imprimir sus etiquetas.");
      return;
    }

    seccionImpresion.innerHTML = contenedor.innerHTML;
    window.print();
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

    // Top Productos Más Vendidos
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
                <span><b>#${idx + 1} ${escapeHtml(t.nombre)}</b> (${t.cantidad} ${escapeHtml(t.unidad)})</span>
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
            <div style="font-size:0.75rem; color:#64748b;">${escapeHtml(v.tipoComprobante)}</div>
          </td>
          <td>${escapeHtml(fecha)}</td>
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
              <button type="button" class="btn btn-outline btn-sm btn-ver-ticket" data-id="${v.id}" title="Ver e Imprimir Ticket">🧾 Ticket</button>
              ${!esAnulada ? `
                <button type="button" class="btn btn-outline btn-sm btn-anular-venta" data-id="${v.id}" title="Anular venta y reponer stock" style="color:var(--danger);">✕ Anular</button>
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

  // Filtros de Periodo en Resumen
  document.querySelectorAll('.pastilla-periodo').forEach(pst => {
    pst.addEventListener('click', () => {
      document.querySelectorAll('.pastilla-periodo').forEach(p => p.classList.remove('activa'));
      pst.classList.add('activa');
      periodoVentasSeleccionado = pst.getAttribute('data-periodo') || "hoy";
      renderResumenVentas(Store.getState());
    });
  });

  document.getElementById('res-buscar-ventas-input')?.addEventListener('input', () => renderResumenVentas(Store.getState()));

  // Exportar Excel de Ventas e Inventario
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
  // PÁGINA INDIVIDUAL: CONFIGURACIÓN, CATEGORÍAS Y RESPALDOS
  // ==========================================================================

  function renderConfiguracion(state) {
    const cfg = state.configuracion || {};
    const campos = [
      ['cfg-empresa', cfg.empresa || ""],
      ['cfg-ruc', cfg.ruc || ""],
      ['cfg-direccion', cfg.direccion || ""],
      ['cfg-telefono', cfg.telefono || ""],
      ['cfg-moneda', cfg.moneda || "S/"],
      ['cfg-pie', cfg.pieTicket || ""]
    ];
    campos.forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el) {
        el.value = val;
      }
    });

    // Renderizar chips de categorías editables
    const contCat = document.getElementById('lista-chips-categorias');
    if (contCat) {
      contCat.innerHTML = (state.categorias || []).map(cat => `
        <span class="chip-editable">
          <span>${escapeHtml(cat)}</span>
          <button type="button" class="btn-quitar-cat" data-cat="${escapeHtml(cat)}" title="Eliminar categoría">✕</button>
        </span>
      `).join('');

      contCat.querySelectorAll('.btn-quitar-cat').forEach(btn => {
        btn.addEventListener('click', () => {
          const cat = btn.getAttribute('data-cat');
          if (cat && confirm(`¿Eliminar la categoría "${cat}"?`)) {
            Store.removeCategory(cat);
          }
        });
      });
    }

    // Renderizar chips de unidades editables
    const contUni = document.getElementById('lista-chips-unidades');
    if (contUni) {
      contUni.innerHTML = (state.unidades || []).map(uni => `
        <span class="chip-editable">
          <span>${escapeHtml(uni)}</span>
          <button type="button" class="btn-quitar-uni" data-uni="${escapeHtml(uni)}" title="Eliminar unidad">✕</button>
        </span>
      `).join('');

      contUni.querySelectorAll('.btn-quitar-uni').forEach(btn => {
        btn.addEventListener('click', () => {
          const uni = btn.getAttribute('data-uni');
          if (uni && confirm(`¿Eliminar la unidad de medida "${uni}"?`)) {
            Store.removeUnit(uni);
          }
        });
      });
    }
  }

  document.getElementById('btn-agregar-categoria')?.addEventListener('click', () => {
    const input = document.getElementById('input-nueva-categoria');
    const val = input?.value.trim();
    if (val) {
      if (Store.addCategory(val)) {
        input.value = "";
      } else {
        alert("La categoría ya existe en la lista.");
      }
    }
  });

  document.getElementById('btn-agregar-unidad')?.addEventListener('click', () => {
    const input = document.getElementById('input-nueva-unidad');
    const val = input?.value.trim();
    if (val) {
      if (Store.addUnit(val)) {
        input.value = "";
      } else {
        alert("La unidad de medida ya existe en la lista.");
      }
    }
  });

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
    alert("Datos comerciales de la ferretería guardados correctamente.");
  });

  document.getElementById('btn-guardar-config-negocio')?.addEventListener('click', () => {
    document.getElementById('form-configuracion')?.requestSubmit?.();
  });

  // Barra flotante móvil de POS desplaza hacia la caja registradora
  document.getElementById('pos-mobile-cart-bar')?.addEventListener('click', () => {
    document.querySelector('.pos-carrito-caja')?.scrollIntoView({ behavior: 'smooth' });
  });

  // Inicializar página según el hash actual de la URL
  const hashInicial = (window.location.hash || "").replace("#", "").trim();
  if (hashInicial && TITULOS_PAGINAS[hashInicial]) {
    cambiarSeccion(hashInicial);
  } else {
    cambiarSeccion('pos');
  }

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

  // Disparadores explícitos para botones de envío de modales
  document.getElementById('btn-guardar-producto-modal')?.addEventListener('click', () => {
    document.getElementById('form-producto')?.requestSubmit?.();
  });
  document.getElementById('btn-confirmar-stock')?.addEventListener('click', () => {
    document.getElementById('form-stock')?.requestSubmit?.();
  });
  document.getElementById('btn-aplicar-bulk-precios')?.addEventListener('click', () => {
    document.getElementById('form-bulk-precios')?.requestSubmit?.();
  });
  document.getElementById('btn-aplicar-bulk-categoria')?.addEventListener('click', () => {
    document.getElementById('form-bulk-categoria')?.requestSubmit?.();
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
