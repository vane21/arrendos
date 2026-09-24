// Cálculos de Contabilidad de Arrendos.
// Replican las fórmulas de Contabilidad_Arrendos.xlsx (ver importacion/calculos.py).
// Funciones puras: reciben los datos y devuelven resultados; no tocan la pantalla ni la base de datos.

const DIA_MS = 86400000;

// ---------- Fechas (siempre 'AAAA-MM-DD', calculadas en UTC para evitar desfases de zona horaria) ----------
export const aFecha = (iso) => (iso ? new Date(`${iso}T00:00:00Z`) : null);
export const aIso = (f) => f.toISOString().slice(0, 10);
export const diasEntre = (desde, hasta) => Math.round((hasta - desde) / DIA_MS);
export const sumarDias = (f, n) => new Date(f.getTime() + n * DIA_MS);
export function hoyIso(ahora = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}`;
}

// DATE() de Excel: meses y días fuera de rango se desbordan.
function fechaExcel(anio, mes, dia) {
  return new Date(Date.UTC(anio, mes - 1, 1) + (dia - 1) * DIA_MS);
}

// Día de pago del mes; si el mes es más corto, el último día del mes (regla R2).
export function fechaPagoDelMes(anio, mes, dia) {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes - 1, Math.min(dia, ultimo)));
}

// DATEDIF(inicio, fin, "m")
function mesesCompletos(inicio, fin) {
  let m = (fin.getUTCFullYear() - inicio.getUTCFullYear()) * 12 + fin.getUTCMonth() - inicio.getUTCMonth();
  if (fin.getUTCDate() < inicio.getUTCDate()) m -= 1;
  return m;
}

const suma = (lista, f = (x) => x.valor) => lista.reduce((t, x) => t + f(x), 0);

// ---------- Hoja Arriendos (comportamiento exacto del Excel; se usa para validar) ----------
export function contratoComoExcel(c, hoyStr, diasAlerta = 5) {
  const hoy = aFecha(hoyStr), ini = aFecha(c.fechaInicio), fin = aFecha(c.fechaFin);
  const duracion = mesesCompletos(ini, sumarDias(fin, 1));
  const y = hoy.getUTCFullYear(), m = hoy.getUTCMonth() + 1;
  const esteMes = fechaExcel(y, m, c.diaPago);
  const candidata = esteMes >= hoy ? esteMes : fechaExcel(y, m + 1, c.diaPago);
  const finalizado = candidata > fin;
  const diasPago = finalizado ? null : diasEntre(hoy, candidata);
  let alertaPago = '';
  if (diasPago === 0) alertaPago = '⚠ PAGO HOY';
  else if (diasPago > 0 && diasPago <= diasAlerta) alertaPago = `⚠ PAGO EN ${diasPago} DIA(S)`;
  const diasFin = diasEntre(hoy, fin);
  let alertaFin = '';
  if (diasFin < 0) alertaFin = '🔴 CONTRATO VENCIDO';
  else if (diasFin <= diasAlerta) alertaFin = `⚠ VENCE EN ${diasFin} DIAS`;
  const estado = hoy < ini ? 'Aun no inicia' : hoy > fin ? 'Finalizado' : 'Activo';
  return { duracion, proxima: finalizado ? 'Finalizado' : aIso(candidata), diasPago, alertaPago, diasFin, alertaFin, estado };
}

// ---------- Estado del contrato en la app ----------
export function estadoContrato(c, hoyStr) {
  const hoy = aFecha(hoyStr);
  if (hoy < aFecha(c.fechaInicio)) return 'Aún no inicia';
  if (hoy > aFecha(c.fechaFin)) return 'Finalizado';
  return 'Activo';
}

export function duracionMeses(c) {
  return mesesCompletos(aFecha(c.fechaInicio), sumarDias(aFecha(c.fechaFin), 1));
}

// ---------- Pagos y deuda (regla acordada el 24/09/2026) ----------
// Las cuotas empiezan en el primer día de pago desde el inicio del control.
// Los pagos cubren las cuotas en orden: al pagar, la próxima fecha pasa al mismo día del mes siguiente.
export function estadoDePago(c, pagos, hoyStr, inicioControl, diasAlerta = 5) {
  const hoy = aFecha(hoyStr);
  const inicio = aFecha(inicioControl);
  const desde = new Date(Math.max(inicio, aFecha(c.fechaInicio)));
  const fin = aFecha(c.fechaFin);
  const cuotas = [];
  let anio = desde.getUTCFullYear(), mes = desde.getUTCMonth() + 1;
  for (;;) {
    const f = fechaPagoDelMes(anio, mes, c.diaPago);
    if (f > fin) break;
    if (f >= desde) cuotas.push(f);
    mes += 1;
    if (mes > 12) { mes = 1; anio += 1; }
  }
  const pagado = suma(pagos.filter((p) => p.arrendamientoId === c.id && aFecha(p.fecha) >= inicio));
  const deudaInicial = c.deudaInicial || 0;
  let disponible = pagado - deudaInicial;
  let proxima = null;
  for (const f of cuotas) {
    if (disponible >= c.valorMensual) disponible -= c.valorMensual;
    else { proxima = f; break; }
  }
  const vencidas = cuotas.filter((f) => f < hoy).length;
  const deuda = Math.max(0, deudaInicial + vencidas * c.valorMensual - pagado);
  if (!proxima) return { proxima: null, dias: null, nivel: 'al-dia', alerta: '', deuda, abono: 0 };
  const dias = diasEntre(hoy, proxima);
  let nivel = 'normal', alerta = '';
  if (dias < 0) { nivel = 'atrasado'; alerta = `Atrasado ${-dias} ${-dias === 1 ? 'día' : 'días'}`; }
  else if (dias === 0) { nivel = 'hoy'; alerta = 'Paga hoy'; }
  else if (dias <= diasAlerta) { nivel = 'pronto'; alerta = `Paga en ${dias} ${dias === 1 ? 'día' : 'días'}`; }
  return { proxima: aIso(proxima), dias, nivel, alerta, deuda, abono: Math.max(disponible, 0) };
}

export function alertaFinContrato(c, hoyStr, diasAlerta = 5) {
  const dias = diasEntre(aFecha(hoyStr), aFecha(c.fechaFin));
  if (dias < 0) return { dias, alerta: 'Contrato vencido' };
  if (dias <= diasAlerta) return { dias, alerta: dias === 0 ? 'Contrato vence hoy' : `Contrato vence en ${dias} ${dias === 1 ? 'día' : 'días'}` };
  return { dias, alerta: '' };
}

// ---------- Hoja Resumen ----------
// Con hoy, el arriendo esperado cuenta solo contratos no finalizados (el Excel tenía una fila por contrato vigente).
// Sin hoy, suma todos los contratos, exactamente como la fórmula del Excel (se usa para validar la importación).
export function resumen(datos, hoy = null) {
  const { pagos, gastos, prestamos } = datos;
  const vigentes = hoy ? datos.arrendamientos.filter((c) => c.fechaFin >= hoy) : datos.arrendamientos;
  const recaudado = suma(pagos);
  const totalGastos = suma(gastos);
  const pendiente = suma(prestamos.filter((x) => x.estado === 'pendiente'));
  const porInmueble = Object.fromEntries(
    datos.inmuebles.map((i) => [i.id, suma(pagos.filter((p) => p.inmuebleId === i.id))]));
  const cat = (c) => suma(gastos.filter((g) => (g.categoria || null) === c));
  return {
    totalArriendoMensualEsperado: suma(vigentes, (c) => c.valorMensual),
    totalRecaudadoHistorico: recaudado,
    totalGastosHistorico: totalGastos,
    totalPrestado: suma(prestamos),
    prestamosDevueltos: suma(prestamos.filter((x) => x.estado === 'pagado')),
    prestamosPendientes: pendiente,
    balanceNeto: recaudado - totalGastos - pendiente,
    recaudadoPorInmueble: porInmueble,
    gastosInmueble: cat('gasto_inmueble'),
    gastosApoyoFamiliar: cat('apoyo_familiar'),
    gastosSinCategoria: cat(null),
  };
}

// ---------- Hoja Donde esta el dinero ----------
// Pagos, gastos y salidas de préstamo cuentan solo DESPUÉS de la fecha de corte;
// las devoluciones cuentan DESDE la fecha de corte (incluye el mismo día), igual que el Excel.
export function dondeEstaElDinero(datos) {
  const corte = aFecha(datos.configuracion.fechaCorte);
  const despues = (iso) => aFecha(iso) > corte;
  const devuelto = (x) => x.estado === 'pagado' && x.fechaDevolucion && aFecha(x.fechaDevolucion) >= corte;
  const cuentas = [...datos.cuentas].sort((a, b) => a.orden - b.orden).map((c) => {
    const recibido = suma(datos.pagos.filter((p) => p.cuentaId === c.id && despues(p.fecha)));
    const gastado = suma(datos.gastos.filter((g) => g.cuentaId === c.id && despues(g.fecha)));
    const prestado = suma(datos.prestamos.filter((x) => x.cuentaSalidaId === c.id && despues(x.fecha)));
    const dev = suma(datos.prestamos.filter((x) => x.cuentaDevolucionId === c.id && devuelto(x)));
    return { id: c.id, nombre: c.nombre, saldoInicial: c.saldoInicial, recibido, gastado, prestado,
      devuelto: dev, saldoActual: c.saldoInicial + recibido - gastado - prestado + dev };
  });
  const saldoActualTotal = suma(cuentas, (c) => c.saldoActual);
  const totalSinCuentas = suma(datos.cuentas, (c) => c.saldoInicial)
    + suma(datos.pagos.filter((p) => despues(p.fecha)))
    - suma(datos.gastos.filter((g) => despues(g.fecha)))
    - suma(datos.prestamos.filter((x) => despues(x.fecha)))
    + suma(datos.prestamos.filter(devuelto));
  const pendiente = suma(datos.prestamos.filter((x) => x.estado === 'pendiente'));
  return { cuentas, saldoActualTotal, comprobacionCoincide: saldoActualTotal === totalSinCuentas,
    diferenciaComprobacion: saldoActualTotal - totalSinCuentas, patrimonio: saldoActualTotal + pendiente,
    prestamosPendientes: pendiente };
}

// ---------- Mes actual ----------
export function movimientosDelMes(datos, hoyStr) {
  const mes = hoyStr.slice(0, 7);
  const delMes = (l) => l.filter((x) => x.fecha.slice(0, 7) === mes);
  return { mes, recibido: suma(delMes(datos.pagos)), gastado: suma(delMes(datos.gastos)), pagos: delMes(datos.pagos).length };
}

// ---------- Validación de la importación ----------
const NOMBRES_VALIDACION = {
  totalArriendoMensualEsperado: 'Total arriendo mensual esperado',
  totalRecaudadoHistorico: 'Total recaudado histórico',
  totalGastosHistorico: 'Total gastos histórico',
  prestamosPendientes: 'Préstamos pendientes',
  saldoActualTotal: 'Saldo actual total',
  patrimonio: 'Patrimonio',
};

export function validarImportacion(datos, esperados) {
  const R = resumen(datos), D = dondeEstaElDinero(datos);
  const obtenidos = {
    totalArriendoMensualEsperado: R.totalArriendoMensualEsperado,
    totalRecaudadoHistorico: R.totalRecaudadoHistorico,
    totalGastosHistorico: R.totalGastosHistorico,
    prestamosPendientes: R.prestamosPendientes,
    saldoActualTotal: D.saldoActualTotal,
    patrimonio: D.patrimonio,
  };
  const detalle = {
    totalArriendoMensualEsperado: () => `Suma del valor mensual de ${datos.arrendamientos.length} contratos.`,
    totalRecaudadoHistorico: () => `Suma de ${datos.pagos.length} pagos.`,
    totalGastosHistorico: () => `Suma de ${datos.gastos.length} gastos.`,
    prestamosPendientes: () => `Suma de ${datos.prestamos.filter((x) => x.estado === 'pendiente').length} préstamos con estado Pendiente.`,
    saldoActualTotal: () => D.cuentas.map((c) => `${c.nombre} ${c.saldoActual}`).join(' · ')
      + (D.comprobacionCoincide ? '' : ` · Hay ${D.diferenciaComprobacion} en registros sin cuenta asignada.`),
    patrimonio: () => `Saldo actual ${D.saldoActualTotal} + préstamos pendientes ${R.prestamosPendientes}.`,
  };
  const filas = Object.keys(NOMBRES_VALIDACION).map((k) => ({
    clave: k, nombre: NOMBRES_VALIDACION[k], esperado: esperados[k], obtenido: obtenidos[k],
    ok: esperados[k] === obtenidos[k], diferencia: obtenidos[k] - esperados[k], detalle: detalle[k](),
  }));
  return { ok: filas.every((f) => f.ok), filas };
}
