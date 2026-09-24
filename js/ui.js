// Piezas de interfaz reutilizables: íconos, avisos y ventanas de confirmación.
import { esc } from './formato.js';

const trazo = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const iconos = {
  inicio: trazo('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.8V20h13V9.8"/><path d="M10 20v-5.5h4V20"/>'),
  arriendos: trazo('<path d="M4 20V8.5L12 4l8 4.5V20"/><path d="M9 20v-6h6v6"/><path d="M9 10h.01M15 10h.01"/>'),
  movimientos: trazo('<path d="M7 4v16M7 20l-3-3M7 20l3-3"/><path d="M17 20V4M17 4l-3 3M17 4l3 3"/>'),
  dinero: trazo('<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><path d="M16 14.5h2"/>'),
  ajustes: trazo('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  mas: trazo('<path d="M12 5v14M5 12h14"/>'),
  buscar: trazo('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  flecha: trazo('<path d="m9 6 6 6-6 6"/>'),
  atras: trazo('<path d="m15 6-6 6 6 6"/>'),
  ok: trazo('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  alerta: trazo('<path d="M12 8v5M12 16.5h.01"/><circle cx="12" cy="12" r="9"/>'),
  archivo: trazo('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  compartir: trazo('<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
  candado: trazo('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>'),
};

let temporizador;
export function aviso(texto, tipo = 'ok') {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.dataset.tipo = tipo;
  el.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { el.hidden = true; }, 3200);
}

// Ventana de confirmación propia (no usa confirm() del navegador).
export function confirmar({ titulo, mensaje, aceptar = 'Aceptar', cancelar = 'Cancelar', peligro = false }) {
  return new Promise((resolve) => {
    const capa = document.createElement('div');
    capa.className = 'capa';
    capa.innerHTML = `
      <div class="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
        <h2 id="dlg-t">${esc(titulo)}</h2>
        <p>${esc(mensaje)}</p>
        <div class="dialogo-botones">
          <button class="boton secundario" data-r="0">${esc(cancelar)}</button>
          <button class="boton ${peligro ? 'peligro' : 'principal'}" data-r="1">${esc(aceptar)}</button>
        </div>
      </div>`;
    capa.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b && e.target !== capa) return;
      capa.remove();
      resolve(b?.dataset.r === '1');
    });
    document.body.append(capa);
    capa.querySelector('[data-r="1"]').focus();
  });
}

// Panel que sube desde abajo, para ver el detalle de un registro.
export function panel(html, alAbrir) {
  const capa = document.createElement('div');
  capa.className = 'capa capa-panel';
  capa.innerHTML = `<section class="panel" role="dialog" aria-modal="true">
    <div class="panel-barra"><button class="boton-texto" data-cerrar>Cerrar</button></div>
    <div class="panel-cuerpo">${html}</div></section>`;
  const cerrar = () => capa.remove();
  capa.addEventListener('click', (e) => { if (e.target === capa || e.target.closest('[data-cerrar]')) cerrar(); });
  document.body.append(capa);
  alAbrir?.(capa.querySelector('.panel-cuerpo'), cerrar);
  return cerrar;
}
