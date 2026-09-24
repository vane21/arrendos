// Almacenamiento local en el iPhone (IndexedDB). Nada sale del teléfono.
// "datos": toda la información de la app en un solo registro (volumen pequeño: cientos de filas).
// "copias": copias de seguridad guardadas dentro de la app.

const NOMBRE = 'contabilidad-arrendos';
const VERSION = 1;
let conexion = null;
const memoria = { datos: null, copias: new Map() }; // respaldo si el navegador bloquea IndexedDB

function abrir() {
  if (conexion) return conexion;
  conexion = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('estado')) db.createObjectStore('estado');
        if (!db.objectStoreNames.contains('copias')) db.createObjectStore('copias', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  }).catch(() => null);
  return conexion;
}

function operar(almacen, modo, accion) {
  return abrir().then((db) => {
    if (!db) return undefined;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(almacen, modo);
      const req = accion(tx.objectStore(almacen));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    });
  });
}

export const almacenamientoDisponible = async () => Boolean(await abrir());

export async function leerDatos() {
  const db = await abrir();
  if (!db) return memoria.datos;
  return (await operar('estado', 'readonly', (s) => s.get('datos'))) ?? null;
}

export async function guardarDatos(datos) {
  datos.actualizadoEn = new Date().toISOString();
  const db = await abrir();
  if (!db) { memoria.datos = datos; return; }
  await operar('estado', 'readwrite', (s) => s.put(datos, 'datos'));
}

export async function guardarCopia(copia) {
  const db = await abrir();
  if (!db) { memoria.copias.set(copia.id, copia); return; }
  await operar('copias', 'readwrite', (s) => s.put(copia));
}

export async function listarCopias() {
  const db = await abrir();
  const lista = db ? await operar('copias', 'readonly', (s) => s.getAll()) : [...memoria.copias.values()];
  return (lista || []).sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
}

export async function leerCopia(id) {
  const db = await abrir();
  if (!db) return memoria.copias.get(id);
  return operar('copias', 'readonly', (s) => s.get(id));
}

// Pide a iOS que no borre los datos de la app (se concede normalmente cuando está en la pantalla de inicio).
export async function pedirAlmacenamientoPersistente() {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* sin soporte */ }
  return false;
}

export async function eliminarCopia(id) {
  const db = await abrir();
  if (!db) { memoria.copias.delete(id); return; }
  await operar('copias', 'readwrite', (s) => s.delete(id));
}
