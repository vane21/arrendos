// Copias de seguridad (.arrendos): leer, comprobar, restaurar, crear y compartir.
import { eliminarCopia, guardarCopia, guardarDatos, leerDatos, listarCopias } from './db.js';

const MAX_AUTOMATICAS = 10;

const FORMATO = 'contabilidad-arrendos-copia';
const LISTAS = ['cuentas', 'inmuebles', 'arrendatarios', 'arrendamientos', 'pagos', 'gastos', 'prestamos'];

export class ErrorCopia extends Error {}

export async function leerArchivoCopia(archivo) {
  let texto;
  try {
    texto = await archivo.text();
  } catch {
    throw new ErrorCopia('No se pudo leer el archivo. Intenta elegirlo de nuevo.');
  }
  let copia;
  try {
    copia = JSON.parse(texto);
  } catch {
    throw new ErrorCopia('Este archivo no es una copia de Contabilidad de Arrendos. Elige un archivo que termine en .arrendos.');
  }
  comprobarCopia(copia);
  return copia;
}

// Revisa que la copia esté completa y que cada registro apunte a datos que existen.
export function comprobarCopia(copia) {
  if (copia?.formato !== FORMATO) {
    throw new ErrorCopia('Este archivo no es una copia de Contabilidad de Arrendos.');
  }
  if (copia.version > 1) {
    throw new ErrorCopia('Esta copia fue creada con una versión más nueva de la app. Actualiza la app e inténtalo de nuevo.');
  }
  for (const l of LISTAS) {
    if (!Array.isArray(copia[l])) throw new ErrorCopia('La copia está incompleta: faltan datos. No se cambió nada.');
  }
  if (!copia.configuracion?.fechaCorte) throw new ErrorCopia('La copia no tiene la fecha de corte del saldo inicial. No se cambió nada.');
  const ids = (l) => new Set(copia[l].map((x) => x.id));
  const cuentas = ids('cuentas'), inmuebles = ids('inmuebles'), arrendatarios = ids('arrendatarios'), contratos = ids('arrendamientos');
  const malos = [];
  copia.arrendamientos.forEach((c) => { if (!inmuebles.has(c.inmuebleId) || !arrendatarios.has(c.arrendatarioId)) malos.push('un contrato'); });
  copia.pagos.forEach((p) => { if (!contratos.has(p.arrendamientoId) || !inmuebles.has(p.inmuebleId) || !cuentas.has(p.cuentaId)) malos.push(`el pago del ${p.fecha}`); });
  copia.gastos.forEach((g) => { if (!cuentas.has(g.cuentaId) || (g.inmuebleId && !inmuebles.has(g.inmuebleId))) malos.push(`el gasto del ${g.fecha}`); });
  copia.prestamos.forEach((x) => { if (!cuentas.has(x.cuentaSalidaId) || (x.cuentaDevolucionId && !cuentas.has(x.cuentaDevolucionId))) malos.push(`el préstamo del ${x.fecha}`); });
  if (copia.devoluciones != null && !Array.isArray(copia.devoluciones)) throw new ErrorCopia('La copia está incompleta: faltan datos. No se cambió nada.');
  (copia.devoluciones || []).forEach((d) => { if (!cuentas.has(d.cuentaId)) malos.push(`la devolución del ${d.fecha}`); });
  if (malos.length) throw new ErrorCopia(`La copia tiene datos que no cuadran (${malos.slice(0, 3).join(', ')}). No se cambió nada.`);
  return true;
}

export const conteos = (d) => Object.fromEntries([...LISTAS, 'devoluciones'].map((l) => [l, (d[l] || []).length]));

function datosDesdeCopia(copia) {
  const datos = structuredClone(copia);
  for (const k of ['formato', 'version', 'tipo', 'descripcion', 'creadoEn', 'conteos']) delete datos[k];
  datos.devoluciones ??= [];
  return datos;
}

function empaquetar(datos, tipo, descripcion) {
  const copia = { formato: FORMATO, version: 1, tipo, descripcion, creadoEn: new Date().toISOString(), ...structuredClone(datos) };
  delete copia.actualizadoEn;
  copia.conteos = conteos(copia);
  return copia;
}

async function registrarCopia(copia, nombre, protegida = false) {
  const registro = {
    id: `${copia.tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, nombre, tipo: copia.tipo, protegida,
    creadaEn: new Date().toISOString(), conteos: conteos(copia), contenido: copia,
  };
  await guardarCopia(registro);
  if (copia.tipo === 'automatica') {
    const viejas = (await listarCopias()).filter((c) => c.tipo === 'automatica').slice(MAX_AUTOMATICAS);
    for (const c of viejas) await eliminarCopia(c.id);
  }
  return registro;
}

// Copia completa antes de un cambio importante (eliminar o restaurar). Guarda las 10 más recientes.
export async function crearCopiaAutomatica(datos, nombre) {
  return registrarCopia(empaquetar(datos, 'automatica', nombre), nombre);
}

// Carga inicial o restauración. Antes de reemplazar datos existentes guarda una copia de seguridad automática.
export async function restaurarCopia(copia) {
  comprobarCopia(copia);
  const actuales = await leerDatos();
  if (actuales) {
    await crearCopiaAutomatica(actuales, 'Automática antes de restaurar');
  }
  const datos = datosDesdeCopia(copia);
  datos.cargadoEn = new Date().toISOString();
  await guardarDatos(datos);
  if (copia.tipo === 'importacion_inicial') {
    const ya = (await listarCopias()).some((c) => c.tipo === 'importacion_inicial' && c.contenido?.origen?.sha256 === copia.origen?.sha256);
    if (!ya) await registrarCopia(copia, 'Copia inicial (importación del Excel)', true);
  }
  return datos;
}

export async function crearCopiaManual(datos) {
  return registrarCopia(empaquetar(datos, 'manual', 'Copia de seguridad manual'), 'Copia manual');
}

export function nombreArchivo(registro) {
  const f = registro.creadaEn.slice(0, 16).replace('T', '_').replace(':', '-');
  return `Arrendos_${registro.tipo === 'importacion_inicial' ? 'copia_inicial' : 'copia'}_${f}.arrendos`;
}

// Abre el menú de iOS para guardar en Archivos o compartir. Si no está disponible, descarga el archivo.
export async function compartirCopia(registro) {
  const archivo = new File([JSON.stringify(registro.contenido, null, 2)], nombreArchivo(registro), { type: 'application/json' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: 'Copia de Contabilidad de Arrendos' });
      return 'compartida';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelada';
    }
  }
  const url = URL.createObjectURL(archivo);
  const a = Object.assign(document.createElement('a'), { href: url, download: archivo.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'descargada';
}
