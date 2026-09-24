// Formatos para mostrar en pantalla (pesos colombianos y fechas en español).
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const pesos = (v) => `$ ${numero.format(v ?? 0)}`;

export function fechaCorta(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES_CORTOS[m - 1]} ${a}`;
}

export function fechaLarga(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

export function nombreMes(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  const n = MESES[m - 1];
  return `${n[0].toUpperCase()}${n.slice(1)} ${a}`;
}

export function fechaHora(isoCompleto) {
  const f = new Date(isoCompleto);
  const p = (n) => String(n).padStart(2, '0');
  return `${f.getDate()} ${MESES_CORTOS[f.getMonth()]} ${f.getFullYear()}, ${p(f.getHours())}:${p(f.getMinutes())}`;
}

// Escapa texto para insertarlo en HTML de forma segura.
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Búsqueda sin distinguir tildes ni mayúsculas.
export const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
