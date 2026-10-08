// Crear, editar y eliminar registros. Funciones puras: modifican el objeto de datos que reciben
// (la app les pasa una copia) y lanzan ErrorValidacion con un mensaje claro si algo falta o no cuadra.
import { aFecha } from './calculos.js';
import { normalizar } from './formato.js';

export class ErrorValidacion extends Error {
  constructor(mensaje, campo) { super(mensaje); this.campo = campo; }
}

export const nuevoId = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

// ---------- Validaciones comunes ----------
const texto = (v) => (v == null ? null : String(v).trim() || null);

function obligatorio(v, campo, nombre) {
  if (v == null || v === '') throw new ErrorValidacion(`Falta ${nombre}.`, campo);
  return v;
}
function fechaValida(v, campo, nombre) {
  obligatorio(v, campo, nombre);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(aFecha(v).getTime())) throw new ErrorValidacion(`${nombre[0].toUpperCase()}${nombre.slice(1)} no es una fecha válida.`, campo);
  return v;
}
function valorValido(v, campo, nombre = 'el valor') {
  const n = Number(v);
  if (v === '' || v == null || !Number.isFinite(n)) throw new ErrorValidacion(`Falta ${nombre}.`, campo);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorValidacion(`${nombre[0].toUpperCase()}${nombre.slice(1)} debe ser un número de pesos mayor que cero, sin decimales.`, campo);
  return n;
}
function cuentaValida(datos, id, campo, nombre = 'la cuenta') {
  obligatorio(id, campo, nombre);
  if (!datos.cuentas.some((c) => c.id === id)) throw new ErrorValidacion(`Elige ${nombre}.`, campo);
  return id;
}
function buscar(lista, id, nombre) {
  const x = lista.find((e) => e.id === id);
  if (!x) throw new ErrorValidacion(`No se encontró ${nombre}. Puede que ya se haya eliminado.`);
  return x;
}
function guardarEn(lista, registro) {
  const i = lista.findIndex((x) => x.id === registro.id);
  if (i >= 0) lista[i] = { ...lista[i], ...registro };
  else lista.push(registro);
  return registro.id;
}

// ---------- Pagos ----------
export function guardarPago(datos, f) {
  const contrato = buscar(datos.arrendamientos, obligatorio(f.arrendamientoId, 'arrendamientoId', 'el arrendamiento'), 'el arrendamiento');
  const fecha = fechaValida(f.fecha, 'fecha', 'la fecha del pago');
  const pago = {
    id: f.id || nuevoId(),
    arrendamientoId: contrato.id,
    inmuebleId: contrato.inmuebleId,
    fecha,
    periodo: fecha.slice(0, 7), // mes de la fecha de pago, igual que el Excel
    valor: valorValido(f.valor, 'valor', 'el valor pagado'),
    cuentaId: cuentaValida(datos, f.cuentaId, 'cuentaId', 'el método de pago'),
    observaciones: texto(f.observaciones),
  };
  if (f.id) buscar(datos.pagos, f.id, 'el pago');
  return guardarEn(datos.pagos, pago);
}

export function eliminarPago(datos, id) {
  buscar(datos.pagos, id, 'el pago');
  datos.pagos = datos.pagos.filter((p) => p.id !== id);
}

// ---------- Inmuebles ----------
function nombreInmuebleLibre(datos, nombre, id) {
  if (datos.inmuebles.some((i) => i.id !== id && normalizar(i.nombre) === normalizar(nombre))) {
    throw new ErrorValidacion(`Ya existe un inmueble llamado "${nombre}". Usa otro nombre.`, 'inmuebleNombre');
  }
}

export function guardarInmueble(datos, f) {
  const nombre = obligatorio(texto(f.nombre), 'inmuebleNombre', 'el nombre del inmueble');
  nombreInmuebleLibre(datos, nombre, f.id);
  if (f.id) buscar(datos.inmuebles, f.id, 'el inmueble');
  return guardarEn(datos.inmuebles, { id: f.id || nuevoId(), nombre, direccion: texto(f.direccion), notas: texto(f.notas) });
}

export function eliminarInmueble(datos, id) {
  const inm = buscar(datos.inmuebles, id, 'el inmueble');
  const contratos = datos.arrendamientos.filter((c) => c.inmuebleId === id).length;
  const gastos = datos.gastos.filter((g) => g.inmuebleId === id).length;
  if (contratos || gastos) {
    throw new ErrorValidacion(`No se puede eliminar "${inm.nombre}" porque tiene ${contratos ? `${contratos} contrato(s)` : ''}${contratos && gastos ? ' y ' : ''}${gastos ? `${gastos} gasto(s)` : ''} registrados. Así se conserva el historial.`);
  }
  datos.inmuebles = datos.inmuebles.filter((i) => i.id !== id);
}

// ---------- Arrendamientos (contrato + arrendatario) ----------
export function guardarArrendamiento(datos, f) {
  const existente = f.id ? buscar(datos.arrendamientos, f.id, 'el arrendamiento') : null;

  let inmuebleId = f.inmuebleId;
  if (!inmuebleId) {
    const nombre = obligatorio(texto(f.inmuebleNombre), 'inmuebleNombre', 'el inmueble');
    nombreInmuebleLibre(datos, nombre);
  } else {
    buscar(datos.inmuebles, inmuebleId, 'el inmueble');
  }
  const nombreArrendatario = obligatorio(texto(f.arrendatarioNombre), 'arrendatarioNombre', 'el nombre del arrendatario');
  const valorMensual = valorValido(f.valorMensual, 'valorMensual', 'el valor del arriendo');
  const diaPago = Number(f.diaPago);
  if (!Number.isInteger(diaPago) || diaPago < 1 || diaPago > 31) throw new ErrorValidacion('El día de pago debe ser un número del 1 al 31.', 'diaPago');
  const fechaInicio = fechaValida(f.fechaInicio, 'fechaInicio', 'la fecha de inicio');
  const fechaFin = fechaValida(f.fechaFin, 'fechaFin', 'la fecha final');
  if (fechaFin < fechaInicio) throw new ErrorValidacion('La fecha final debe ser posterior a la fecha de inicio.', 'fechaFin');
  const deudaInicial = f.deudaInicial === '' || f.deudaInicial == null ? 0 : Number(f.deudaInicial);
  if (!Number.isInteger(deudaInicial) || deudaInicial < 0) throw new ErrorValidacion('La deuda anterior debe ser cero o un valor en pesos, sin decimales.', 'deudaInicial');

  if (inmuebleId) {
    const cruce = datos.arrendamientos.find((c) => c.inmuebleId === inmuebleId && c.id !== f.id
      && c.fechaInicio <= fechaFin && fechaInicio <= c.fechaFin);
    if (cruce) {
      const arr = datos.arrendatarios.find((t) => t.id === cruce.arrendatarioId)?.nombre || 'otro arrendatario';
      throw new ErrorValidacion(`Este inmueble ya tiene un contrato con ${arr} en esas fechas. Cambia las fechas o termina primero ese contrato.`, 'fechaInicio');
    }
  } else {
    inmuebleId = guardarInmueble(datos, { nombre: f.inmuebleNombre, direccion: f.inmuebleDireccion });
  }

  const arrendatarioId = existente?.arrendatarioId || nuevoId();
  guardarEn(datos.arrendatarios, {
    id: arrendatarioId, nombre: nombreArrendatario,
    documento: texto(f.arrendatarioDocumento), telefono: texto(f.arrendatarioTelefono),
    notas: existente ? datos.arrendatarios.find((t) => t.id === arrendatarioId)?.notas ?? null : null,
  });
  const id = guardarEn(datos.arrendamientos, {
    id: f.id || nuevoId(), inmuebleId, arrendatarioId, valorMensual, diaPago, fechaInicio, fechaFin,
    observaciones: texto(f.observaciones), deudaInicial,
  });
  // Si se cambió de inmueble, los pagos del contrato siguen al contrato.
  if (existente && existente.inmuebleId !== inmuebleId) {
    datos.pagos.forEach((p) => { if (p.arrendamientoId === id) p.inmuebleId = inmuebleId; });
  }
  return id;
}

export function eliminarArrendamiento(datos, id) {
  const c = buscar(datos.arrendamientos, id, 'el arrendamiento');
  const pagos = datos.pagos.filter((p) => p.arrendamientoId === id).length;
  if (pagos) {
    throw new ErrorValidacion(`Este contrato tiene ${pagos} ${pagos === 1 ? 'pago registrado' : 'pagos registrados'}, así que no se puede eliminar sin perder el historial. Si el contrato terminó, cambia su fecha final.`);
  }
  datos.arrendamientos = datos.arrendamientos.filter((x) => x.id !== id);
  if (!datos.arrendamientos.some((x) => x.arrendatarioId === c.arrendatarioId)) {
    datos.arrendatarios = datos.arrendatarios.filter((t) => t.id !== c.arrendatarioId);
  }
}

// ---------- Gastos ----------
const CATEGORIAS = ['gasto_inmueble', 'apoyo_familiar'];

export function guardarGasto(datos, f) {
  if (f.id) buscar(datos.gastos, f.id, 'el gasto');
  if (f.inmuebleId) buscar(datos.inmuebles, f.inmuebleId, 'el inmueble');
  const categoria = f.categoria || null;
  if (categoria && !CATEGORIAS.includes(categoria)) throw new ErrorValidacion('Elige una categoría de la lista.', 'categoria');
  return guardarEn(datos.gastos, {
    id: f.id || nuevoId(),
    fecha: fechaValida(f.fecha, 'fecha', 'la fecha del gasto'),
    inmuebleId: f.inmuebleId || null,
    concepto: obligatorio(texto(f.concepto), 'concepto', 'el concepto del gasto'),
    valor: valorValido(f.valor, 'valor'),
    cuentaId: cuentaValida(datos, f.cuentaId, 'cuentaId', 'de dónde salió el dinero'),
    categoria,
    observaciones: texto(f.observaciones),
  });
}

export function eliminarGasto(datos, id) {
  buscar(datos.gastos, id, 'el gasto');
  datos.gastos = datos.gastos.filter((g) => g.id !== id);
}

// ---------- Préstamos ----------
export function guardarPrestamo(datos, f) {
  const anterior = f.id ? buscar(datos.prestamos, f.id, 'el préstamo') : null;
  const fecha = fechaValida(f.fecha, 'fecha', 'la fecha del préstamo');
  const valor = valorValido(f.valor, 'valor');
  const devuelto = Boolean(f.devuelto);
  let fechaDevolucion = null, cuentaDevolucionId = null;
  if (devuelto) {
    fechaDevolucion = fechaValida(f.fechaDevolucion, 'fechaDevolucion', 'la fecha de devolución');
    if (fechaDevolucion < fecha) throw new ErrorValidacion('La fecha de devolución no puede ser anterior a la fecha del préstamo.', 'fechaDevolucion');
    cuentaDevolucionId = cuentaValida(datos, f.cuentaDevolucionId, 'cuentaDevolucionId', 'a dónde volvió el dinero');
  }
  return guardarEn(datos.prestamos, {
    id: f.id || nuevoId(),
    fecha,
    motivo: obligatorio(texto(f.motivo), 'motivo', 'el motivo del préstamo'),
    valor,
    detalleValor: anterior && anterior.valor === valor ? anterior.detalleValor ?? null : null,
    estado: devuelto ? 'pagado' : 'pendiente',
    fechaDevolucion,
    cuentaSalidaId: cuentaValida(datos, f.cuentaSalidaId, 'cuentaSalidaId', 'de dónde salió el dinero'),
    cuentaDevolucionId,
    observaciones: texto(f.observaciones),
  });
}

export function eliminarPrestamo(datos, id) {
  buscar(datos.prestamos, id, 'el préstamo');
  datos.prestamos = datos.prestamos.filter((x) => x.id !== id);
}

// ---------- Devoluciones de préstamos ----------
// Dinero que se devuelve a los arriendos, en una o varias partes. Solo importa a qué cuenta llega,
// no de dónde salió el préstamo: se abona a lo que se debe en total.
const pesosTexto = (v) => `$ ${new Intl.NumberFormat('es-CO').format(v)}`;

export function guardarDevolucion(datos, f) {
  datos.devoluciones ??= [];
  if (f.id) buscar(datos.devoluciones, f.id, 'la devolución');
  const fecha = fechaValida(f.fecha, 'fecha', 'la fecha de la devolución');
  const valor = valorValido(f.valor, 'valor', 'el valor devuelto');
  const cuentaId = cuentaValida(datos, f.cuentaId, 'cuentaId', 'a dónde llegó el dinero');
  const prestado = datos.prestamos.filter((x) => x.estado === 'pendiente').reduce((t, x) => t + x.valor, 0);
  const yaDevuelto = datos.devoluciones.filter((d) => d.id !== f.id).reduce((t, d) => t + d.valor, 0);
  const porDevolver = Math.max(prestado - yaDevuelto, 0);
  if (valor > porDevolver) {
    throw new ErrorValidacion(porDevolver
      ? `Solo faltan ${pesosTexto(porDevolver)} por devolver. Escribe un valor igual o menor.`
      : 'No hay préstamos pendientes por devolver.', 'valor');
  }
  return guardarEn(datos.devoluciones, { id: f.id || nuevoId(), fecha, valor, cuentaId, observaciones: texto(f.observaciones) });
}

export function eliminarDevolucion(datos, id) {
  buscar(datos.devoluciones || [], id, 'la devolución');
  datos.devoluciones = datos.devoluciones.filter((d) => d.id !== id);
}
