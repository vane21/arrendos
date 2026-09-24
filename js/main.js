// Arranque de la app y navegación por pestañas.
import { guardarDatos, leerDatos, pedirAlmacenamientoPersistente } from './db.js';
import { crearCopiaAutomatica } from './copias.js';
import { aviso, iconos } from './ui.js';
import { contexto, vistaAjustes, vistaArriendos, vistaBienvenida, vistaDinero, vistaInicio, vistaMovimientos } from './vistas.js';

const PESTANAS = [
  ['inicio', 'Inicio', vistaInicio],
  ['arriendos', 'Arriendos', vistaArriendos],
  ['movimientos', 'Movimientos', vistaMovimientos],
  ['dinero', 'Dinero', vistaDinero],
  ['ajustes', 'Ajustes', vistaAjustes],
];

const raiz = document.getElementById('app');
let datos = null;
let actual = { nombre: 'inicio', estado: {} };

// Aplica un cambio sobre una copia de los datos; si la regla lo rechaza, no se guarda nada.
async function cambiar(fn, mensaje, { copiaAntes = false } = {}) {
  const nuevos = structuredClone(datos);
  const resultado = fn(nuevos);
  if (copiaAntes) await crearCopiaAutomatica(datos, 'Automática antes de eliminar');
  await guardarDatos(nuevos);
  datos = nuevos;
  mostrarPestana(actual.nombre, actual.estado, { conservarScroll: true });
  if (mensaje) aviso(mensaje);
  return resultado;
}

function mostrarPestana(nombre, estado = {}, { conservarScroll = false } = {}) {
  actual = { nombre, estado };
  const scroll = window.scrollY;
  const [, , vista] = PESTANAS.find(([k]) => k === nombre) || PESTANAS[0];
  const ctx = contexto(datos);
  const { html, alMontar } = vista(ctx, mostrarPestana, estado, { recargar, pantallaCompleta, cambiar });
  raiz.innerHTML = `
    <main class="pantalla" id="pantalla">${html}</main>
    <nav class="pestanas" aria-label="Secciones">
      ${PESTANAS.map(([k, t]) => `<button class="pestana" data-pestana="${k}" aria-current="${k === nombre ? 'page' : 'false'}">${iconos[k]}<span>${t}</span></button>`).join('')}
    </nav>`;
  raiz.querySelectorAll('[data-pestana]').forEach((b) => b.onclick = () => mostrarPestana(b.dataset.pestana));
  alMontar?.(raiz.querySelector('#pantalla'));
  window.scrollTo(0, conservarScroll ? scroll : 0);
  try { sessionStorage.setItem('pestana', nombre); } catch { /* sin almacenamiento de sesión */ }
}

// Pantalla sin pestañas (por ejemplo, la comprobación de la importación).
function pantallaCompleta(pintar) {
  const anterior = (() => { try { return sessionStorage.getItem('pestana'); } catch { return null; } })();
  pintar(raiz, () => mostrarPestana(anterior || 'inicio'));
  window.scrollTo(0, 0);
}

async function recargar(pestana = 'inicio') {
  datos = await leerDatos();
  if (!datos) return vistaBienvenida(raiz, () => recargar());
  mostrarPestana(pestana);
}

async function iniciar() {
  datos = await leerDatos();
  if (!datos) {
    vistaBienvenida(raiz, () => recargar('inicio'));
  } else {
    let pestana = 'inicio';
    try { pestana = sessionStorage.getItem('pestana') || 'inicio'; } catch { /* nada */ }
    mostrarPestana(pestana);
  }
  pedirAlmacenamientoPersistente();
  // Funcionamiento sin Internet (solo en la app instalada; la vista previa no lo permite).
  if ('serviceWorker' in navigator && document.documentElement.dataset.instalable === 'si') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

iniciar();
