// Formularios para registrar, editar y eliminar información.
import * as C from './calculos.js';
import * as R from './registros.js';
import { esc, fechaCorta, nombreMes, pesos } from './formato.js';
import { confirmar, panel } from './ui.js';

const CATEGORIAS = [['gasto_inmueble', 'Gasto de inmueble'], ['apoyo_familiar', 'Apoyo familiar / personal'], ['', 'Sin categoría']];

// ---------- Piezas de formulario ----------
const campo = (etiqueta, control, ayuda = '') => `<label class="campo"><span class="etiqueta">${etiqueta}</span>${control}${ayuda ? `<small>${ayuda}</small>` : ''}</label>`;
const entrada = (name, valor = '', extra = '') => `<input name="${name}" id="f-${name}" value="${esc(valor ?? '')}" ${extra}>`;
const dinero = (name, valor) => `<div class="pesos"><span>$</span><input name="${name}" id="f-${name}" inputmode="numeric" autocomplete="off" data-pesos value="${valor ? new Intl.NumberFormat('es-CO').format(valor) : ''}" placeholder="0"></div>`;
const fecha = (name, valor) => entrada(name, valor, 'type="date"');
const notas = (valor) => campo('Observaciones <i>(opcional)</i>', `<textarea name="observaciones" id="f-observaciones" rows="2">${esc(valor ?? '')}</textarea>`);

function opcionesUnicas(name, opciones, elegido) {
  return `<div class="opciones" role="radiogroup">${opciones.map(([v, t]) => `
    <label class="opcion"><input type="radio" name="${name}" value="${esc(v)}" ${v === (elegido ?? '') ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>`;
}
const cuentas = (ctx, name, elegido) => opcionesUnicas(name, ctx.datos.cuentas.map((c) => [c.id, c.nombre]), elegido);

function leerFormulario(form) {
  const v = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'radio') { if (el.checked) v[el.name] = el.value; else v[el.name] ??= ''; continue; }
    if (el.type === 'checkbox') { v[el.name] = el.checked; continue; }
    v[el.name] = el.dataset.pesos !== undefined ? el.value.replace(/\D/g, '') : el.value;
  }
  return v;
}

function prepararPesos(form) {
  form.querySelectorAll('[data-pesos]').forEach((el) => el.addEventListener('input', () => {
    const d = el.value.replace(/\D/g, '');
    el.value = d ? new Intl.NumberFormat('es-CO').format(Number(d)) : '';
  }));
}

// Abre un formulario en un panel. alGuardar recibe los valores y los aplica con acciones.cambiar.
function abrir({ titulo, ayuda, cuerpo, textoGuardar = 'Guardar', alGuardar, eliminar, alMontar }) {
  panel(`
    <form class="formulario" novalidate>
      <h2>${esc(titulo)}</h2>
      <p class="ayuda">${esc(ayuda)}</p>
      <p class="error" role="alert" hidden></p>
      ${cuerpo}
      <button class="boton principal grande" type="submit">${esc(textoGuardar)}</button>
      ${eliminar ? `<button class="boton peligro-texto ancho" type="button" data-eliminar>${esc(eliminar.texto)}</button>` : ''}
    </form>`, (cont, cerrar) => {
    const form = cont.querySelector('form');
    const error = form.querySelector('.error');
    prepararPesos(form);
    const mostrarError = (e) => {
      form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
      error.textContent = e instanceof R.ErrorValidacion ? e.message : 'No se pudo guardar. Revisa los datos e inténtalo de nuevo.';
      error.hidden = false;
      const el = e.campo && form.querySelector(`[name="${e.campo}"]`);
      if (el) { el.setAttribute('aria-invalid', 'true'); el.focus({ preventScroll: true }); }
      error.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    form.addEventListener('input', (ev) => {
      if (ev.target.getAttribute('aria-invalid')) { ev.target.removeAttribute('aria-invalid'); error.hidden = true; }
    });
    form.addEventListener('change', (ev) => {
      if (ev.target.getAttribute('aria-invalid')) { ev.target.removeAttribute('aria-invalid'); error.hidden = true; }
    });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await alGuardar(leerFormulario(form));
        cerrar();
      } catch (e) {
        if (!(e instanceof R.ErrorValidacion)) console.error(e);
        mostrarError(e);
      }
    });
    form.querySelector('[data-eliminar]')?.addEventListener('click', async () => {
      const si = await confirmar({ titulo: eliminar.titulo, mensaje: eliminar.mensaje, aceptar: 'Eliminar', peligro: true });
      if (!si) return;
      try { await eliminar.accion(); cerrar(); } catch (e) { mostrarError(e); }
    });
    alMontar?.(form, cerrar);
  });
}

const opcionesContrato = (ctx, elegido) => ctx.contratos
  .filter((c) => c.estado !== 'Finalizado' || c.id === elegido)
  .sort((a, b) => a.inmueble.nombre.localeCompare(b.inmueble.nombre))
  .map((c) => `<option value="${c.id}" ${c.id === elegido ? 'selected' : ''}>${esc(c.inmueble.nombre)} · ${esc(c.arrendatario.nombre)}</option>`).join('');

// ---------- Registrar pago ----------
export function formularioPago(ctx, acciones, { pago, arrendamientoId } = {}) {
  const p = pago || { arrendamientoId, fecha: ctx.hoy, cuentaId: '' };
  const contrato = ctx.contratos.find((c) => c.id === p.arrendamientoId);
  abrir({
    titulo: pago ? 'Editar pago' : 'Registrar pago',
    ayuda: 'Ingresa aquí los datos de un pago recibido para actualizar automáticamente el saldo del arrendamiento.',
    cuerpo: `
      ${campo('Arrendamiento', `<select name="arrendamientoId" id="f-arrendamientoId"><option value="">Elige el inmueble…</option>${opcionesContrato(ctx, p.arrendamientoId)}</select>`)}
      ${campo('Fecha del pago', fecha('fecha', p.fecha))}
      ${campo('Valor pagado', dinero('valor', p.valor ?? contrato?.valorMensual))}
      ${campo('Método de pago', cuentas(ctx, 'cuentaId', p.cuentaId))}
      ${notas(p.observaciones)}
      <p class="resultado" id="resultado-pago"></p>`,
    textoGuardar: pago ? 'Guardar cambios' : 'Registrar pago',
    alGuardar: (v) => acciones.cambiar((d) => R.guardarPago(d, { ...v, id: pago?.id }), pago ? 'Pago actualizado.' : 'Pago registrado.'),
    eliminar: pago && {
      texto: 'Eliminar pago', titulo: 'Eliminar pago',
      mensaje: `Se eliminará el pago de ${pesos(pago.valor)} del ${fechaCorta(pago.fecha)}. Esta acción no se puede deshacer, pero antes se guardará una copia automática.`,
      accion: () => acciones.cambiar((d) => R.eliminarPago(d, pago.id), 'Pago eliminado.', { copiaAntes: true }),
    },
    alMontar(form) {
      const valor = form.elements.valor;
      let valorTocado = Boolean(pago);
      valor.addEventListener('input', () => { valorTocado = true; });
      const actualizar = () => {
        const c = ctx.contratos.find((x) => x.id === form.elements.arrendamientoId.value);
        if (c && !valorTocado) valor.value = new Intl.NumberFormat('es-CO').format(c.valorMensual);
        const f = form.elements.fecha.value;
        const monto = Number(valor.value.replace(/\D/g, ''));
        const res = form.querySelector('#resultado-pago');
        if (!c || !f || !monto) { res.textContent = ''; return; }
        const otros = ctx.datos.pagos.filter((x) => x.id !== pago?.id);
        const despues = C.estadoDePago(c, [...otros, { arrendamientoId: c.id, fecha: f, valor: monto }], ctx.hoy, ctx.datos.configuracion.inicioControlDeuda);
        res.textContent = `Periodo: ${nombreMes(f.slice(0, 7))}. ${despues.proxima ? `Con este pago, el próximo pago de ${c.arrendatario.nombre} queda para el ${fechaCorta(despues.proxima)}${despues.abono ? ` (lleva un abono de ${pesos(despues.abono)})` : ''}.` : 'Con este pago queda al día hasta el final del contrato.'}`;
      };
      form.addEventListener('input', actualizar);
      form.addEventListener('change', actualizar);
      actualizar();
    },
  });
}

// ---------- Nuevo arrendamiento / editar ----------
export function formularioArrendamiento(ctx, acciones, { contrato, inmuebleId } = {}) {
  const c = contrato || { inmuebleId: inmuebleId || '', deudaInicial: 0 };
  const arr = contrato ? contrato.arrendatario : {};
  const inmuebles = [...ctx.datos.inmuebles].sort((a, b) => a.nombre.localeCompare(b.nombre));
  abrir({
    titulo: contrato ? 'Editar arrendamiento' : 'Nuevo arrendamiento',
    ayuda: contrato ? 'Cambia los datos del contrato o del arrendatario. Los pagos registrados se conservan.' : 'Registra un contrato nuevo. La duración, la próxima fecha de pago y las alertas se calculan solas.',
    cuerpo: `
      <h3 class="grupo">Inmueble</h3>
      ${campo('Inmueble', `<select name="inmuebleId" id="f-inmuebleId">
        <option value="">＋ Nuevo inmueble…</option>
        ${inmuebles.map((i) => `<option value="${i.id}" ${i.id === c.inmuebleId ? 'selected' : ''}>${esc(i.nombre)}</option>`).join('')}</select>`)}
      <div id="nuevo-inmueble">
        ${campo('Nombre del inmueble', entrada('inmuebleNombre', '', 'placeholder="Ej. Apartamento Centro"'))}
        ${campo('Dirección <i>(opcional)</i>', entrada('inmuebleDireccion'))}
      </div>
      <h3 class="grupo">Arrendatario</h3>
      ${campo('Nombre', entrada('arrendatarioNombre', arr.nombre, 'autocomplete="off"'))}
      ${campo('Documento <i>(opcional)</i>', entrada('arrendatarioDocumento', arr.documento, 'inputmode="numeric"'))}
      ${campo('Teléfono <i>(opcional)</i>', entrada('arrendatarioTelefono', arr.telefono, 'type="tel"'))}
      <h3 class="grupo">Contrato</h3>
      ${campo('Valor del arriendo mensual', dinero('valorMensual', c.valorMensual))}
      ${campo('Día de pago', entrada('diaPago', c.diaPago, 'type="number" min="1" max="31" inputmode="numeric" placeholder="1 a 31"'), 'Si el mes tiene menos días, el pago cae el último día del mes.')}
      <div class="dos-columnas">
        ${campo('Fecha de inicio', fecha('fechaInicio', c.fechaInicio))}
        ${campo('Fecha final', fecha('fechaFin', c.fechaFin))}
      </div>
      <p class="resultado" id="duracion"></p>
      ${campo('Deuda anterior', dinero('deudaInicial', c.deudaInicial), 'Lo que el arrendatario ya debía al empezar a usar la app. Normalmente es 0.')}
      ${notas(c.observaciones)}`,
    textoGuardar: contrato ? 'Guardar cambios' : 'Crear arrendamiento',
    alGuardar: (v) => acciones.cambiar((d) => R.guardarArrendamiento(d, { ...v, id: contrato?.id }), contrato ? 'Arrendamiento actualizado.' : 'Arrendamiento creado.'),
    eliminar: contrato && {
      texto: 'Eliminar arrendamiento', titulo: 'Eliminar arrendamiento',
      mensaje: `Se eliminará el contrato de ${arr.nombre} en ${contrato.inmueble.nombre}. El inmueble se conserva. Antes se guardará una copia automática.`,
      accion: () => acciones.cambiar((d) => R.eliminarArrendamiento(d, contrato.id), 'Arrendamiento eliminado.', { copiaAntes: true }),
    },
    alMontar(form) {
      const bloque = form.querySelector('#nuevo-inmueble');
      const actualizar = () => {
        bloque.hidden = Boolean(form.elements.inmuebleId.value);
        const i = form.elements.fechaInicio.value, f = form.elements.fechaFin.value;
        form.querySelector('#duracion').textContent = i && f && f >= i ? `Duración: ${C.duracionMeses({ fechaInicio: i, fechaFin: f })} meses.` : '';
      };
      form.addEventListener('change', actualizar);
      form.addEventListener('input', actualizar);
      actualizar();
    },
  });
}

// ---------- Inmueble ----------
export function formularioInmueble(ctx, acciones, inmueble) {
  abrir({
    titulo: 'Editar inmueble',
    ayuda: 'Cambia el nombre o la dirección. El historial de pagos y gastos se conserva.',
    cuerpo: `${campo('Nombre del inmueble', entrada('inmuebleNombre', inmueble.nombre))}
      ${campo('Dirección <i>(opcional)</i>', entrada('direccion', inmueble.direccion))}
      ${campo('Notas <i>(opcional)</i>', `<textarea name="notas" rows="2">${esc(inmueble.notas ?? '')}</textarea>`)}`,
    alGuardar: (v) => acciones.cambiar((d) => R.guardarInmueble(d, { id: inmueble.id, nombre: v.inmuebleNombre, direccion: v.direccion, notas: v.notas }), 'Inmueble actualizado.'),
    eliminar: {
      texto: 'Eliminar inmueble', titulo: 'Eliminar inmueble',
      mensaje: `Se eliminará "${inmueble.nombre}". Solo es posible si no tiene contratos ni gastos. Antes se guardará una copia automática.`,
      accion: () => acciones.cambiar((d) => R.eliminarInmueble(d, inmueble.id), 'Inmueble eliminado.', { copiaAntes: true }),
    },
  });
}

// ---------- Gasto ----------
export function formularioGasto(ctx, acciones, gasto) {
  const g = gasto || { fecha: ctx.hoy, categoria: 'gasto_inmueble' };
  const inmuebles = [...ctx.datos.inmuebles].sort((a, b) => a.nombre.localeCompare(b.nombre));
  abrir({
    titulo: gasto ? 'Editar gasto' : 'Registrar gasto',
    ayuda: 'Anota lo que se pagó con el dinero de los arriendos (arreglos, mantenimiento o apoyo familiar). Se descuenta de la cuenta que elijas.',
    cuerpo: `
      ${campo('Fecha', fecha('fecha', g.fecha))}
      ${campo('Concepto', entrada('concepto', g.concepto, 'placeholder="Ej. Arreglo de tubería"'))}
      ${campo('Valor', dinero('valor', g.valor))}
      ${campo('¿De dónde salió el dinero?', cuentas(ctx, 'cuentaId', g.cuentaId))}
      ${campo('Inmueble <i>(opcional)</i>', `<select name="inmuebleId" id="f-inmuebleId"><option value="">General (ningún inmueble)</option>${inmuebles.map((i) => `<option value="${i.id}" ${i.id === g.inmuebleId ? 'selected' : ''}>${esc(i.nombre)}</option>`).join('')}</select>`)}
      ${campo('Categoría', opcionesUnicas('categoria', CATEGORIAS, g.categoria ?? ''))}
      ${notas(g.observaciones)}`,
    textoGuardar: gasto ? 'Guardar cambios' : 'Registrar gasto',
    alGuardar: (v) => acciones.cambiar((d) => R.guardarGasto(d, { ...v, id: gasto?.id }), gasto ? 'Gasto actualizado.' : 'Gasto registrado.'),
    eliminar: gasto && {
      texto: 'Eliminar gasto', titulo: 'Eliminar gasto',
      mensaje: `Se eliminará el gasto "${gasto.concepto}" de ${pesos(gasto.valor)}. Antes se guardará una copia automática.`,
      accion: () => acciones.cambiar((d) => R.eliminarGasto(d, gasto.id), 'Gasto eliminado.', { copiaAntes: true }),
    },
  });
}

// ---------- Préstamo ----------
export function formularioPrestamo(ctx, acciones, prestamo, { devolver = false } = {}) {
  const x = prestamo || { fecha: ctx.hoy, motivo: 'Préstamo personal', estado: 'pendiente' };
  const devuelto = x.estado === 'pagado' || devolver;
  abrir({
    titulo: devolver ? 'Marcar como devuelto' : prestamo ? 'Editar préstamo' : 'Registrar préstamo',
    ayuda: devolver ? 'Indica cuándo se devolvió y a qué cuenta volvió el dinero. Puede ser una cuenta distinta a la de salida.'
      : 'Registra el dinero que sacas para uso personal. Se descuenta de la cuenta de salida y vuelve a sumar cuando lo marques como devuelto.',
    cuerpo: `
      ${campo('Fecha', fecha('fecha', x.fecha))}
      ${campo('Motivo', entrada('motivo', x.motivo))}
      ${campo('Valor', dinero('valor', x.valor), x.detalleValor ? `En el Excel estaba escrito como ${esc(x.detalleValor)}.` : '')}
      ${campo('¿De dónde salió?', cuentas(ctx, 'cuentaSalidaId', x.cuentaSalidaId))}
      <label class="interruptor"><input type="checkbox" name="devuelto" id="f-devuelto" ${devuelto ? 'checked' : ''}><span>Ya fue devuelto</span></label>
      <div id="bloque-devolucion">
        ${campo('Fecha de devolución', fecha('fechaDevolucion', x.fechaDevolucion || ctx.hoy))}
        ${campo('¿A dónde volvió el dinero?', cuentas(ctx, 'cuentaDevolucionId', x.cuentaDevolucionId))}
      </div>
      ${notas(x.observaciones)}`,
    textoGuardar: devolver ? 'Marcar como devuelto' : prestamo ? 'Guardar cambios' : 'Registrar préstamo',
    alGuardar: (v) => acciones.cambiar((d) => R.guardarPrestamo(d, { ...v, id: prestamo?.id }),
      devolver ? 'Préstamo marcado como devuelto.' : prestamo ? 'Préstamo actualizado.' : 'Préstamo registrado.'),
    eliminar: prestamo && !devolver && {
      texto: 'Eliminar préstamo', titulo: 'Eliminar préstamo',
      mensaje: `Se eliminará el préstamo de ${pesos(prestamo.valor)} del ${fechaCorta(prestamo.fecha)}. Antes se guardará una copia automática.`,
      accion: () => acciones.cambiar((d) => R.eliminarPrestamo(d, prestamo.id), 'Préstamo eliminado.', { copiaAntes: true }),
    },
    alMontar(form) {
      const bloque = form.querySelector('#bloque-devolucion');
      const actualizar = () => { bloque.hidden = !form.elements.devuelto.checked; };
      form.elements.devuelto.addEventListener('change', actualizar);
      actualizar();
    },
  });
}
