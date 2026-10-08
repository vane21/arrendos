// Pantallas de la app. Cada función devuelve el HTML de la pantalla y conecta sus eventos.
import * as C from './calculos.js';
import { esc, fechaCorta, fechaHora, fechaLarga, nombreMes, normalizar, pesos } from './formato.js';
import { aviso, confirmar, iconos, panel } from './ui.js';
import { ErrorCopia, compartirCopia, crearCopiaManual, leerArchivoCopia, restaurarCopia, conteos } from './copias.js';
import { leerCopia, listarCopias } from './db.js';
import * as F from './formularios.js';

// ---------- Datos derivados que usan varias pantallas ----------
export function contexto(datos, hoy = C.hoyIso()) {
  const porId = (l) => Object.fromEntries(datos[l].map((x) => [x.id, x]));
  const inmuebles = porId('inmuebles'), arrendatarios = porId('arrendatarios'), cuentas = porId('cuentas');
  const cfg = datos.configuracion;
  const contratos = datos.arrendamientos.map((c) => ({
    ...c,
    inmueble: inmuebles[c.inmuebleId],
    arrendatario: arrendatarios[c.arrendatarioId],
    estado: C.estadoContrato(c, hoy),
    pago: C.estadoDePago(c, datos.pagos, hoy, cfg.inicioControlDeuda, cfg.diasAlerta),
    fin: C.alertaFinContrato(c, hoy, cfg.diasAlerta),
    duracion: C.duracionMeses(c),
  }));
  const ocupados = new Set(contratos.filter((c) => c.estado !== 'Finalizado').map((c) => c.inmuebleId));
  const vacantes = datos.inmuebles.filter((i) => !ocupados.has(i.id));
  return { datos, hoy, inmuebles, arrendatarios, cuentas, contratos, vacantes };
}

const chip = (texto, nivel) => (texto ? `<span class="chip" data-nivel="${nivel}">${esc(texto)}</span>` : '');
const nivelPago = (p) => ({ atrasado: 'critico', hoy: 'aviso', pronto: 'aviso' })[p.nivel] || 'neutro';
const cabecera = (titulo, ayuda) => `<header class="cabecera"><h1>${esc(titulo)}</h1><p class="ayuda">${esc(ayuda)}</p></header>`;

// ---------- Bienvenida: primera vez que se abre la app ----------
export function vistaBienvenida(raiz, alTerminar) {
  raiz.innerHTML = `
    <main class="bienvenida">
      <div class="marca">${iconos.arriendos}</div>
      <h1>Contabilidad de Arrendos</h1>
      <p class="ayuda">Para empezar, carga la copia inicial que se creó a partir de tu Excel. Así la app arranca con todos tus inmuebles, contratos, pagos, gastos y préstamos, sin volver a escribir nada.</p>
      <ol class="pasos">
        <li>Busca el archivo <b>Copia_inicial_importacion_2026-09-24.arrendos</b>. Lo puedes pasar al iPhone por iCloud Drive, WhatsApp o correo, y guardarlo en Archivos.</li>
        <li>Toca <b>Elegir copia inicial</b> y selecciónalo.</li>
        <li>La app comprueba que los totales sean iguales a los de tu Excel.</li>
      </ol>
      <label class="boton principal grande" for="archivo-inicial">${iconos.archivo}<span>Elegir copia inicial</span></label>
      <input id="archivo-inicial" type="file" hidden>
      <p class="error" id="error-inicial" hidden></p>
      <p class="nota">Tus datos se guardan solo en este iPhone. La app no los envía a ningún servidor.</p>
    </main>`;
  raiz.querySelector('#archivo-inicial').addEventListener('change', async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    const error = raiz.querySelector('#error-inicial');
    error.hidden = true;
    try {
      const copia = await leerArchivoCopia(archivo);
      const n = conteos(copia);
      const ok = await confirmar({
        titulo: 'Cargar estos datos',
        mensaje: `La copia tiene ${n.inmuebles} inmuebles, ${n.arrendamientos} contratos, ${n.pagos} pagos, ${n.gastos} gastos y ${n.prestamos} préstamos. ¿Cargarlos en la app?`,
        aceptar: 'Cargar datos',
      });
      if (!ok) return;
      const datos = await restaurarCopia(copia);
      vistaValidacion(raiz, datos, copia.validacionImportacion, alTerminar, true);
    } catch (err) {
      error.textContent = err instanceof ErrorCopia ? err.message : 'No se pudieron cargar los datos. Intenta de nuevo.';
      error.hidden = false;
    }
  });
}

// ---------- Validación de la importación ----------
export function vistaValidacion(raiz, datos, esperados, alTerminar, primeraVez = false) {
  if (!esperados) {
    raiz.innerHTML = `<main class="bienvenida"><h1>Datos cargados</h1><p class="ayuda">Esta copia no trae valores para comparar con el Excel.</p><button class="boton principal grande" id="continuar">Entrar a la app</button></main>`;
    raiz.querySelector('#continuar').onclick = alTerminar;
    return;
  }
  const v = C.validarImportacion(datos, esperados);
  const n = conteos(datos);
  raiz.innerHTML = `
    <main class="bienvenida validacion">
      <div class="marca" data-nivel="${v.ok ? 'bien' : 'critico'}">${v.ok ? iconos.ok : iconos.alerta}</div>
      <h1>${v.ok ? 'Tus datos coinciden con el Excel' : 'Hay diferencias con el Excel'}</h1>
      <p class="ayuda">${v.ok
        ? `Se cargaron ${n.inmuebles} inmuebles, ${n.arrendamientos} contratos, ${n.pagos} pagos, ${n.gastos} gastos y ${n.prestamos} préstamos. Los seis totales son iguales a los de tu Excel.`
        : 'Revisa los valores marcados en rojo. Debajo de cada uno está el cálculo que da la diferencia. No continúes hasta resolverlo.'}</p>
      <ul class="lista tarjeta">
        ${v.filas.map((f) => `
          <li class="fila fila-validacion" data-ok="${f.ok}">
            <div>
              <span class="rotulo">${esc(f.nombre)}</span>
              ${f.ok ? '' : `<span class="detalle">Excel: ${pesos(f.esperado)} · Diferencia: ${pesos(f.diferencia)}<br>${esc(f.detalle)}</span>`}
            </div>
            <span class="valor">${pesos(f.obtenido)} <i>${f.ok ? iconos.ok : iconos.alerta}</i></span>
          </li>`).join('')}
      </ul>
      ${primeraVez ? '<p class="nota">La copia inicial quedó guardada en Ajustes › Copias de seguridad. Con ella puedes volver a este punto si algo sale mal.</p>' : ''}
      <button class="boton ${v.ok ? 'principal' : 'secundario'} grande" id="continuar">${v.ok ? (primeraVez ? 'Entrar a la app' : 'Listo') : 'Continuar de todos modos'}</button>
    </main>`;
  raiz.querySelector('#continuar').onclick = alTerminar;
}

// ---------- Inicio ----------
export function vistaInicio(ctx, ir, estado, acciones) {
  const { datos, contratos, hoy } = ctx;
  const R = C.resumen(datos, hoy), D = C.dondeEstaElDinero(datos), mes = C.movimientosDelMes(datos, hoy);
  const porIniciar = contratos.filter((c) => c.estado === 'Aún no inicia').length;
  const activos = contratos.filter((c) => c.estado === 'Activo');
  const porCobrarMes = activos.filter((c) => c.pago.proxima && c.pago.proxima.slice(0, 7) <= mes.mes)
    .reduce((t, c) => t + c.valorMensual - c.pago.abono, 0);
  const deuda = contratos.reduce((t, c) => t + c.pago.deuda, 0);
  const proximos = [...activos].filter((c) => c.pago.proxima).sort((a, b) => a.pago.proxima.localeCompare(b.pago.proxima));
  const conAlerta = contratos.filter((c) => c.pago.alerta || c.fin.alerta).length;
  return {
    html: `
      ${cabecera('Contabilidad de Arrendos', `Hoy es ${fechaLarga(hoy)}.`)}
      <section class="tarjeta destacada">
        <span class="rotulo">Dinero disponible</span>
        <strong class="cifra-grande">${pesos(D.saldoActualTotal)}</strong>
        <div class="cuentas-mini">${D.cuentas.map((c) => `<span><b>${esc(c.nombre)}</b> ${pesos(c.saldoActual)}</span>`).join('')}</div>
      </section>
      <div class="acciones">
        <button class="boton principal" data-accion="pago">${iconos.mas}<span>Registrar pago</span></button>
        <button class="boton secundario" data-accion="arrendamiento">${iconos.mas}<span>Nuevo arrendamiento</span></button>
        <button class="boton secundario pequeno" data-accion="gasto">${iconos.mas}<span>Gasto</span></button>
        <button class="boton secundario pequeno" data-accion="prestamo">${iconos.mas}<span>Préstamo</span></button>
        <button class="boton secundario pequeno ancho-total" data-accion="devolucion">${iconos.mas}<span>Devolver préstamo</span></button>
      </div>
      <section class="indicadores">
        <div class="indicador"><span class="rotulo">Arriendo esperado al mes</span><strong>${pesos(R.totalArriendoMensualEsperado)}</strong><small>${activos.length} activos${porIniciar ? ` y ${porIniciar} por iniciar` : ''} de ${datos.inmuebles.length} inmuebles</small></div>
        <div class="indicador"><span class="rotulo">Recibido en ${nombreMes(mes.mes).split(' ')[0].toLowerCase()}</span><strong>${pesos(mes.recibido)}</strong><small>${mes.pagos} ${mes.pagos === 1 ? 'pago' : 'pagos'}</small></div>
        <div class="indicador"><span class="rotulo">Por cobrar este mes</span><strong>${pesos(porCobrarMes)}</strong><small>${deuda ? `Deuda atrasada ${pesos(deuda)}` : 'Nadie tiene deuda'}</small></div>
        <div class="indicador"><span class="rotulo">Préstamos por cobrar</span><strong>${pesos(R.prestamosPendientes)}</strong><small>${C.estadoPrestamos(datos).pendientes} pendientes</small></div>
      </section>
      <section>
        <div class="titulo-seccion"><h2>Próximos pagos</h2><button class="boton-texto" data-ir="arriendos" data-filtro="alerta">Ver pendientes (${conAlerta})</button></div>
        <ul class="lista tarjeta">${proximos.slice(0, 5).map((c) => `
          <li class="fila" data-contrato="${c.id}">
            <div><span class="principal-texto">${esc(c.inmueble.nombre)}</span><span class="secundario-texto">${esc(c.arrendatario.nombre)} · ${fechaCorta(c.pago.proxima)}</span></div>
            <div class="derecha"><span class="valor">${pesos(c.valorMensual - c.pago.abono)}</span>${chip(c.pago.alerta || c.fin.alerta, nivelPago(c.pago))}</div>
          </li>`).join('') || '<li class="fila vacio-lista">No hay pagos próximos.</li>'}</ul>
      </section>
      <button class="boton secundario ancho" data-ir="movimientos">Ver historial de movimientos</button>`,
    alMontar(raiz) {
      const abrir = { pago: () => F.formularioPago(ctx, acciones), arrendamiento: () => F.formularioArrendamiento(ctx, acciones),
        gasto: () => F.formularioGasto(ctx, acciones), prestamo: () => F.formularioPrestamo(ctx, acciones),
        devolucion: () => F.formularioDevolucion(ctx, acciones) };
      raiz.querySelectorAll('[data-accion]').forEach((b) => b.onclick = abrir[b.dataset.accion]);
      raiz.querySelectorAll('[data-ir]').forEach((b) => b.onclick = () => ir(b.dataset.ir, { filtro: b.dataset.filtro }));
      raiz.querySelectorAll('[data-contrato]').forEach((f) => f.onclick = () => detalleContrato(ctx, acciones, f.dataset.contrato));
    },
  };
}

// ---------- Arriendos ----------
const FILTROS_ARRIENDOS = [['todos', 'Todos'], ['alerta', 'Con alerta'], ['atrasado', 'Atrasados'], ['vacante', 'Sin arrendatario'], ['finalizado', 'Finalizados']];

export function vistaArriendos(ctx, ir, estado = {}, acciones) {
  const filtro = estado.filtro || 'todos';
  return {
    html: `
      ${cabecera('Arriendos', 'Cada inmueble con su arrendatario, el valor y la próxima fecha de pago.')}
      <button class="boton principal ancho" id="nuevo-arrendamiento">${iconos.mas}<span>Nuevo arrendamiento</span></button>
      <label class="buscador">${iconos.buscar}<input id="buscar-arriendos" type="search" placeholder="Buscar inmueble, arrendatario o documento" value="${esc(estado.texto || '')}"></label>
      <div class="filtros" role="tablist">${FILTROS_ARRIENDOS.map(([k, t]) => `<button role="tab" class="filtro" aria-selected="${k === filtro}" data-filtro="${k}">${t}</button>`).join('')}</div>
      <div id="lista-arriendos"></div>`,
    alMontar(raiz) {
      const pintar = () => {
        const texto = normalizar(raiz.querySelector('#buscar-arriendos').value);
        const f = raiz.querySelector('.filtro[aria-selected="true"]').dataset.filtro;
        estado.texto = raiz.querySelector('#buscar-arriendos').value;
        estado.filtro = f;
        let contratos = ctx.contratos.filter((c) => !texto || normalizar(`${c.inmueble.nombre} ${c.inmueble.direccion || ''} ${c.arrendatario.nombre} ${c.arrendatario.documento || ''} ${c.arrendatario.telefono || ''} ${c.observaciones || ''}`).includes(texto));
        if (f === 'finalizado') contratos = contratos.filter((c) => c.estado === 'Finalizado');
        else contratos = contratos.filter((c) => c.estado !== 'Finalizado');
        if (f === 'alerta') contratos = contratos.filter((c) => c.pago.alerta || c.fin.alerta);
        if (f === 'atrasado') contratos = contratos.filter((c) => c.pago.nivel === 'atrasado');
        if (f === 'vacante') contratos = [];
        const vacantes = ['todos', 'vacante'].includes(f) ? ctx.vacantes.filter((i) => !texto || normalizar(`${i.nombre} ${i.direccion || ''}`).includes(texto)) : [];
        contratos.sort((a, b) => a.inmueble.nombre.localeCompare(b.inmueble.nombre));
        const tarjetas = contratos.map((c) => `
          <button class="tarjeta contrato" data-contrato="${c.id}">
            <div class="contrato-arriba"><span class="principal-texto">${esc(c.inmueble.nombre)}</span><span class="valor">${pesos(c.valorMensual)}</span></div>
            <span class="secundario-texto">${esc(c.arrendatario.nombre)}</span>
            <div class="contrato-abajo">
              <span class="secundario-texto">${c.pago.proxima ? `Próximo pago ${fechaCorta(c.pago.proxima)}` : 'Sin cuotas pendientes'}</span>
              <span class="chips">${chip(c.pago.alerta, nivelPago(c.pago))}${chip(c.fin.alerta, c.fin.dias < 0 ? 'critico' : 'aviso')}${c.pago.deuda ? chip(`Debe ${pesos(c.pago.deuda)}`, 'critico') : ''}${chip(c.estado === 'Activo' ? '' : c.estado, 'neutro')}</span>
            </div>
          </button>`).join('');
        const vac = vacantes.map((i) => `<button class="tarjeta contrato vacio" data-inmueble="${i.id}"><span class="principal-texto">${esc(i.nombre)}</span><span class="secundario-texto">Sin arrendatario · Toca para agregar un contrato</span></button>`).join('');
        raiz.querySelector('#lista-arriendos').innerHTML = tarjetas + vac || '<p class="vacio-lista">No hay arriendos que coincidan.</p>';
        raiz.querySelectorAll('[data-contrato]').forEach((b) => b.onclick = () => detalleContrato(ctx, acciones, b.dataset.contrato));
        raiz.querySelectorAll('[data-inmueble]').forEach((b) => b.onclick = () => detalleInmueble(ctx, acciones, b.dataset.inmueble));
      };
      raiz.querySelector('#nuevo-arrendamiento').onclick = () => F.formularioArrendamiento(ctx, acciones);
      raiz.querySelector('#buscar-arriendos').addEventListener('input', pintar);
      raiz.querySelectorAll('.filtro').forEach((b) => b.onclick = () => {
        raiz.querySelectorAll('.filtro').forEach((x) => x.setAttribute('aria-selected', x === b));
        pintar();
      });
      pintar();
    },
  };
}

function detalleInmueble(ctx, acciones, id) {
  const i = ctx.inmuebles[id];
  const anteriores = ctx.contratos.filter((c) => c.inmuebleId === id);
  panel(`
    <h2>${esc(i.nombre)}</h2>
    <p class="secundario-texto">${i.direccion ? esc(i.direccion) : 'Sin dirección registrada'} · Sin arrendatario</p>
    ${i.notas ? `<p class="nota">${esc(i.notas)}</p>` : ''}
    ${anteriores.length ? `<p class="nota">Tuvo ${anteriores.length} contrato(s) anteriores.</p>` : ''}
    <div class="acciones-panel">
      <button class="boton principal ancho" data-a="contrato">${iconos.mas}<span>Nuevo arrendamiento aquí</span></button>
      <button class="boton secundario ancho" data-a="editar">Editar inmueble</button>
    </div>`, (cont, cerrar) => {
    cont.querySelector('[data-a="contrato"]').onclick = () => { cerrar(); F.formularioArrendamiento(ctx, acciones, { inmuebleId: id }); };
    cont.querySelector('[data-a="editar"]').onclick = () => { cerrar(); F.formularioInmueble(ctx, acciones, i); };
  });
}

function detalleContrato(ctx, acciones, id) {
  const c = ctx.contratos.find((x) => x.id === id);
  const pagos = ctx.datos.pagos.filter((p) => p.arrendamientoId === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const total = pagos.reduce((t, p) => t + p.valor, 0);
  const dato = (r, v) => `<div class="dato"><span class="rotulo">${r}</span><span>${v}</span></div>`;
  panel(`
    <h2>${esc(c.inmueble.nombre)}</h2>
    <p class="secundario-texto">${esc(c.arrendatario.nombre)} · ${esc(c.estado)}</p>
    <div class="chips separado">${chip(c.pago.alerta, nivelPago(c.pago))}${chip(c.fin.alerta, 'aviso')}${chip(c.pago.deuda ? `Debe ${pesos(c.pago.deuda)}` : 'Al día', c.pago.deuda ? 'critico' : 'bien')}${c.pago.abono ? chip(`Abono ${pesos(c.pago.abono)}`, 'neutro') : ''}</div>
    <div class="acciones-panel">
      <button class="boton principal" data-a="pago">${iconos.mas}<span>Registrar pago</span></button>
      <button class="boton secundario" data-a="editar">Editar</button>
    </div>
    <div class="datos">
      ${dato('Valor mensual', pesos(c.valorMensual))}
      ${dato('Día de pago', `${c.diaPago} de cada mes`)}
      ${dato('Próximo pago', c.pago.proxima ? fechaLarga(c.pago.proxima) : '—')}
      ${dato('Inicio del contrato', fechaLarga(c.fechaInicio))}
      ${dato('Fin del contrato', `${fechaLarga(c.fechaFin)} (${c.fin.dias >= 0 ? `faltan ${c.fin.dias} días` : 'vencido'})`)}
      ${dato('Duración', `${c.duracion} meses`)}
      ${c.arrendatario.documento ? dato('Documento', esc(c.arrendatario.documento)) : ''}
      ${c.arrendatario.telefono ? dato('Teléfono', esc(c.arrendatario.telefono)) : ''}
      ${c.inmueble.direccion ? dato('Dirección', esc(c.inmueble.direccion)) : ''}
      ${c.deudaInicial ? dato('Deuda anterior', pesos(c.deudaInicial)) : ''}
      ${c.observaciones ? dato('Observaciones', esc(c.observaciones)) : ''}
    </div>
    <div class="titulo-seccion"><h3>Pagos recibidos</h3><span class="valor">${pesos(total)}</span></div>
    <ul class="lista tarjeta">${pagos.map((p) => `<li class="fila tocable" data-pago="${p.id}"><div><span class="principal-texto">${fechaCorta(p.fecha)}</span><span class="secundario-texto">${esc(ctx.cuentas[p.cuentaId].nombre)}${p.observaciones ? ` · ${esc(p.observaciones)}` : ''}</span></div><span class="valor positivo">${pesos(p.valor)}</span></li>`).join('') || '<li class="fila vacio-lista">Aún no hay pagos registrados para este contrato.</li>'}</ul>
    <button class="boton-texto" data-a="inmueble">Editar datos del inmueble</button>`, (cont, cerrar) => {
    cont.querySelector('[data-a="pago"]').onclick = () => { cerrar(); F.formularioPago(ctx, acciones, { arrendamientoId: id }); };
    cont.querySelector('[data-a="editar"]').onclick = () => { cerrar(); F.formularioArrendamiento(ctx, acciones, { contrato: c }); };
    cont.querySelector('[data-a="inmueble"]').onclick = () => { cerrar(); F.formularioInmueble(ctx, acciones, c.inmueble); };
    cont.querySelectorAll('[data-pago]').forEach((f) => f.onclick = () => {
      cerrar();
      F.formularioPago(ctx, acciones, { pago: ctx.datos.pagos.find((p) => p.id === f.dataset.pago) });
    });
  });
}

// ---------- Movimientos ----------
const TIPOS = [['pagos', 'Pagos', 'Registrar pago'], ['gastos', 'Gastos', 'Registrar gasto'], ['prestamos', 'Préstamos', 'Registrar préstamo']];
const CATEGORIA = { gasto_inmueble: 'Gasto de inmueble', apoyo_familiar: 'Apoyo familiar / personal' };

export function vistaMovimientos(ctx, ir, estado = {}, acciones) {
  const tipo = estado.tipo || 'pagos';
  return {
    html: `
      ${cabecera('Movimientos', 'Historial completo de pagos recibidos, gastos y préstamos, agrupado por mes. Toca un registro para editarlo.')}
      <div class="segmentos" role="tablist">${TIPOS.map(([k, t]) => `<button role="tab" class="segmento" aria-selected="${k === tipo}" data-tipo="${k}">${t}</button>`).join('')}</div>
      <button class="boton principal ancho" id="nuevo-mov">${iconos.mas}<span></span></button>
      <div id="resumen-prestamos"></div>
      <label class="buscador">${iconos.buscar}<input id="buscar-mov" type="search" placeholder="Buscar por inmueble, concepto, cuenta o mes" value="${esc(estado.texto || '')}"></label>
      <div id="lista-mov"></div>`,
    alMontar(raiz) {
      const cuenta = (id) => ctx.cuentas[id]?.nombre || 'Sin cuenta';
      const filas = {
        pagos: () => ctx.datos.pagos.map((p) => {
          const c = ctx.contratos.find((x) => x.id === p.arrendamientoId);
          return { id: p.id, fecha: p.fecha, valor: p.valor, signo: 'positivo', titulo: ctx.inmuebles[p.inmuebleId].nombre,
            sub: `${c?.arrendatario.nombre || ''} · ${cuenta(p.cuentaId)}`, nota: p.observaciones, chip: '' };
        }),
        gastos: () => ctx.datos.gastos.map((g) => ({ id: g.id, fecha: g.fecha, valor: g.valor, signo: 'negativo', titulo: g.concepto,
          sub: [g.inmuebleId ? ctx.inmuebles[g.inmuebleId].nombre : 'General', cuenta(g.cuentaId)].join(' · '),
          nota: g.observaciones, chip: chip(CATEGORIA[g.categoria] || 'Sin categoría', g.categoria ? 'neutro' : 'aviso') })),
        prestamos: () => {
          const P = C.estadoPrestamos(ctx.datos);
          const estado = (x) => {
            if (x.estado === 'pagado') return chip('Devuelto', 'bien');
            const r = P.porId[x.id];
            if (r.cubierto) return chip('Devuelto', 'bien');
            return chip(r.abonado ? `Faltan ${pesos(r.falta)}` : 'Pendiente', 'aviso');
          };
          return [
            ...ctx.datos.prestamos.map((x) => ({ id: x.id, fecha: x.fecha, valor: x.valor, signo: 'negativo', titulo: x.motivo,
              sub: `Salió de ${cuenta(x.cuentaSalidaId)}${x.estado === 'pagado' ? ` · volvió a ${cuenta(x.cuentaDevolucionId)} el ${fechaCorta(x.fechaDevolucion)}` : ''}`,
              nota: [x.detalleValor ? `Suma: ${x.detalleValor}` : '', x.observaciones].filter(Boolean).join(' · '),
              chip: estado(x) })),
            ...(ctx.datos.devoluciones || []).map((d) => ({ id: d.id, fecha: d.fecha, valor: d.valor, signo: 'positivo', esDevolucion: true,
              titulo: 'Devolución de préstamos', sub: `Llegó a ${cuenta(d.cuentaId)}`, nota: d.observaciones, chip: chip('Devolución', 'bien') })),
          ];
        },
      };
      const abrirRegistro = (t, id) => {
        if (t === 'pagos') F.formularioPago(ctx, acciones, { pago: ctx.datos.pagos.find((p) => p.id === id) });
        if (t === 'gastos') F.formularioGasto(ctx, acciones, ctx.datos.gastos.find((g) => g.id === id));
        if (t === 'prestamos') {
          const dev = (ctx.datos.devoluciones || []).find((d) => d.id === id);
          if (dev) F.formularioDevolucion(ctx, acciones, dev);
          else F.formularioPrestamo(ctx, acciones, ctx.datos.prestamos.find((x) => x.id === id));
        }
      };
      const pintar = () => {
        const t = raiz.querySelector('.segmento[aria-selected="true"]').dataset.tipo;
        estado.tipo = t;
        estado.texto = raiz.querySelector('#buscar-mov').value;
        raiz.querySelector('#nuevo-mov span').textContent = TIPOS.find(([k]) => k === t)[2];
        const resumenP = raiz.querySelector('#resumen-prestamos');
        if (t === 'prestamos') {
          const P = C.estadoPrestamos(ctx.datos);
          resumenP.innerHTML = `<section class="tarjeta">
            <div class="linea"><span><b>Por devolver</b></span><span class="valor"><b>${pesos(P.porDevolver)}</b></span></div>
            <div class="linea"><span>Ya devuelto con abonos</span><span class="valor positivo">${pesos(P.totalDevuelto)}</span></div>
            <button class="boton secundario ancho" id="nueva-devolucion" ${P.porDevolver ? '' : 'disabled'}>${iconos.mas}<span>Registrar devolución</span></button>
            <p class="nota">Devuelve por partes o todo, a la cuenta que quieras. Se abona primero a los préstamos más antiguos.</p>
          </section>`;
          resumenP.querySelector('#nueva-devolucion').onclick = () => F.formularioDevolucion(ctx, acciones);
        } else resumenP.innerHTML = '';
        const q = normalizar(estado.texto);
        const lista = filas[t]().filter((f) => !q || normalizar(`${f.titulo} ${f.sub} ${f.nota || ''} ${nombreMes(f.fecha.slice(0, 7))} ${f.valor}`).includes(q))
          .sort((a, b) => b.fecha.localeCompare(a.fecha));
        const meses = [...new Set(lista.map((f) => f.fecha.slice(0, 7)))];
        raiz.querySelector('#lista-mov').innerHTML = meses.map((m) => {
          const delMes = lista.filter((f) => f.fecha.startsWith(m));
          return `<section><div class="titulo-seccion"><h2>${nombreMes(m)}</h2><span class="valor">${pesos(delMes.filter((f) => !f.esDevolucion).reduce((s, f) => s + f.valor, 0))}</span></div>
            <ul class="lista tarjeta">${delMes.map((f) => `<li class="fila tocable" data-id="${f.id}"><div><span class="principal-texto">${esc(f.titulo)}</span><span class="secundario-texto">${fechaCorta(f.fecha)} · ${esc(f.sub)}</span>${f.nota ? `<span class="nota-fila">${esc(f.nota)}</span>` : ''}</div>
            <div class="derecha"><span class="valor ${f.signo}">${pesos(f.valor)}</span>${f.chip}</div></li>`).join('')}</ul></section>`;
        }).join('') || '<p class="vacio-lista">No hay movimientos que coincidan.</p>';
        raiz.querySelectorAll('#lista-mov [data-id]').forEach((f) => f.onclick = () => abrirRegistro(t, f.dataset.id));
      };
      raiz.querySelector('#nuevo-mov').onclick = () => {
        const t = raiz.querySelector('.segmento[aria-selected="true"]').dataset.tipo;
        ({ pagos: F.formularioPago, gastos: F.formularioGasto, prestamos: F.formularioPrestamo })[t](ctx, acciones);
      };
      raiz.querySelectorAll('.segmento').forEach((b) => b.onclick = () => {
        raiz.querySelectorAll('.segmento').forEach((x) => x.setAttribute('aria-selected', x === b));
        pintar();
      });
      raiz.querySelector('#buscar-mov').addEventListener('input', pintar);
      pintar();
    },
  };
}

// ---------- Dinero ----------
export function vistaDinero(ctx) {
  const { datos } = ctx;
  const R = C.resumen(datos), D = C.dondeEstaElDinero(datos);
  const linea = (r, v, cls = '') => `<div class="linea"><span>${r}</span><span class="valor ${cls}">${v}</span></div>`;
  return {
    html: `
      ${cabecera('Dinero', `Cuánto hay en cada cuenta: saldo inicial al ${fechaCorta(datos.configuracion.fechaCorte)} más lo registrado después.`)}
      <div class="cuentas">${D.cuentas.map((c) => `
        <section class="tarjeta cuenta">
          <div class="cuenta-arriba"><h2>${esc(c.nombre)}</h2><strong class="cifra">${pesos(c.saldoActual)}</strong></div>
          ${linea('Saldo inicial', pesos(c.saldoInicial))}
          ${linea('+ Recibido', pesos(c.recibido), 'positivo')}
          ${linea('− Gastado', pesos(c.gastado), 'negativo')}
          ${linea('− Prestado', pesos(c.prestado), 'negativo')}
          ${linea('+ Devuelto', pesos(c.devuelto), 'positivo')}
        </section>`).join('')}</div>
      <section class="tarjeta">
        ${linea('<b>Saldo actual total</b>', `<b>${pesos(D.saldoActualTotal)}</b>`)}
        ${linea('Préstamos por cobrar', pesos(R.prestamosPendientes))}
        ${linea('<b>Patrimonio</b> (si te devuelven todo)', `<b>${pesos(D.patrimonio)}</b>`)}
        <p class="comprobacion" data-ok="${D.comprobacionCoincide}">${D.comprobacionCoincide ? `${iconos.ok} Las cuentas cuadran` : `${iconos.alerta} Hay ${pesos(D.diferenciaComprobacion)} en registros sin cuenta`}</p>
      </section>
      <div class="titulo-seccion"><h2>Resumen histórico</h2></div>
      <section class="tarjeta">
        ${linea('Total recaudado', pesos(R.totalRecaudadoHistorico), 'positivo')}
        ${linea('Total gastos', pesos(R.totalGastosHistorico), 'negativo')}
        ${linea('Prestado alguna vez', pesos(R.totalPrestado))}
        ${linea('Ya devuelto', pesos(R.prestamosDevueltos))}
        ${linea('Préstamos pendientes', pesos(R.prestamosPendientes), 'negativo')}
        ${linea('<b>Balance neto</b>', `<b>${pesos(R.balanceNeto)}</b>`)}
        <p class="nota">Recaudado menos gastos menos lo que sigue prestado. No incluye el saldo inicial.</p>
      </section>
      <div class="titulo-seccion"><h2>Recaudado por inmueble</h2></div>
      <section class="tarjeta">${datos.inmuebles.map((i) => linea(esc(i.nombre), pesos(R.recaudadoPorInmueble[i.id]))).join('')}</section>
      <div class="titulo-seccion"><h2>Gastos por categoría</h2></div>
      <section class="tarjeta">
        ${linea('Gastos de los inmuebles', pesos(R.gastosInmueble))}
        ${linea('Apoyo familiar / personal', pesos(R.gastosApoyoFamiliar))}
        ${linea('Sin categoría', pesos(R.gastosSinCategoria))}
      </section>`,
  };
}

// ---------- Ajustes ----------
export function vistaAjustes(ctx, ir, estado, acciones) {
  const cfg = ctx.datos.configuracion;
  return {
    html: `
      ${cabecera('Ajustes', 'Copias de seguridad, comprobación de la importación y configuración.')}
      <div class="titulo-seccion"><h2>Copias de seguridad</h2></div>
      <p class="ayuda">Guarda una copia en Archivos o en iCloud Drive con frecuencia. Con ella puedes recuperar toda la información.</p>
      <div class="acciones">
        <button class="boton principal" id="crear-copia">${iconos.compartir}<span>Crear y guardar copia</span></button>
        <label class="boton secundario" for="archivo-restaurar">${iconos.archivo}<span>Restaurar copia</span></label>
        <input id="archivo-restaurar" type="file" hidden>
      </div>
      <ul class="lista tarjeta" id="lista-copias"><li class="fila">Cargando copias…</li></ul>
      <div class="titulo-seccion"><h2>Importación del Excel</h2></div>
      <button class="tarjeta fila-boton" id="ver-validacion"><span>Ver comprobación contra el Excel</span>${iconos.flecha}</button>
      <div class="titulo-seccion"><h2>Configuración</h2></div>
      <section class="tarjeta">
        <div class="linea"><span>Fecha de corte del saldo inicial</span><span>${fechaCorta(cfg.fechaCorte)}</span></div>
        <div class="linea"><span>Aviso de pago y fin de contrato</span><span>${cfg.diasAlerta} días antes</span></div>
        <div class="linea"><span>Cálculo de deuda desde</span><span>${fechaCorta(cfg.inicioControlDeuda)}</span></div>
        <div class="linea"><span>Abrir con Face ID</span><span class="secundario-texto">Etapa 3d</span></div>
      </section>
      <p class="nota">Versión 0.2.2 (etapa 3b + devoluciones por partes). Tus datos se guardan solo en este iPhone.</p>`,
    async alMontar(raiz) {
      const pintarCopias = async () => {
        const copias = await listarCopias();
        raiz.querySelector('#lista-copias').innerHTML = copias.map((c) => `
          <li class="fila">
            <div><span class="principal-texto">${esc(c.nombre)}</span><span class="secundario-texto">${fechaHora(c.creadaEn)} · ${c.conteos.pagos} pagos, ${c.conteos.gastos} gastos, ${c.conteos.prestamos} préstamos</span></div>
            <div class="derecha">${c.protegida ? chip('Protegida', 'bien') : ''}
              <button class="boton-texto" data-compartir="${c.id}">Guardar</button>
              <button class="boton-texto" data-restaurar="${c.id}">Restaurar</button></div>
          </li>`).join('') || '<li class="fila vacio-lista">Aún no hay copias.</li>';
        raiz.querySelectorAll('[data-compartir]').forEach((b) => b.onclick = async () => {
          const r = await compartirCopia(await leerCopia(b.dataset.compartir));
          if (r === 'descargada') aviso('Copia descargada.');
        });
        raiz.querySelectorAll('[data-restaurar]').forEach((b) => b.onclick = async () => {
          const c = await leerCopia(b.dataset.restaurar);
          await restaurarDesde(c.contenido, `la copia "${c.nombre}" del ${fechaHora(c.creadaEn)}`);
        });
      };
      const restaurarDesde = async (copia, descripcion) => {
        const ok = await confirmar({
          titulo: 'Restaurar copia',
          mensaje: `Se reemplazarán todos los datos actuales por ${descripcion}. Antes se guardará una copia automática de lo que tienes ahora.`,
          aceptar: 'Restaurar', peligro: true,
        });
        if (!ok) return;
        try {
          await restaurarCopia(copia);
          aviso('Copia restaurada.');
          await acciones.recargar('ajustes');
        } catch (err) {
          aviso(err instanceof ErrorCopia ? err.message : 'No se pudo restaurar la copia.', 'error');
        }
      };
      raiz.querySelector('#crear-copia').onclick = async () => {
        const registro = await crearCopiaManual(ctx.datos);
        await pintarCopias();
        const r = await compartirCopia(registro);
        aviso(r === 'cancelada' ? 'Copia creada dentro de la app.' : 'Copia creada.');
      };
      raiz.querySelector('#archivo-restaurar').addEventListener('change', async (e) => {
        const archivo = e.target.files?.[0];
        e.target.value = '';
        if (!archivo) return;
        try {
          const copia = await leerArchivoCopia(archivo);
          await restaurarDesde(copia, `el archivo "${archivo.name}"`);
        } catch (err) {
          aviso(err instanceof ErrorCopia ? err.message : 'No se pudo leer el archivo.', 'error');
        }
      });
      raiz.querySelector('#ver-validacion').onclick = async () => {
        const inicial = (await listarCopias()).find((c) => c.tipo === 'importacion_inicial');
        if (!inicial) { aviso('No hay copia inicial guardada en esta app.', 'error'); return; }
        acciones.pantallaCompleta((cont, volver) => vistaValidacion(cont, inicial.contenido, inicial.contenido.validacionImportacion, volver));
      };
      await pintarCopias();
    },
  };
}
