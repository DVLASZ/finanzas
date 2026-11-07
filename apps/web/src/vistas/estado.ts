import { $ } from './dom.ts';
import { aMinor, hallarMontos } from '../../../../packages/core/src/index.ts';
import { app, hayServidor, pendientesDeEnviar } from '../app.ts';


/** Actualiza el indicador de conexión / cambios pendientes. */
export function actualizarEstado(): void {
  const el = document.getElementById('estado');
  if (!el) return;
  const p = pendientesDeEnviar();
  if (!hayServidor()) el.textContent = 'Solo en este aparato';
  else if (typeof navigator !== 'undefined' && navigator.onLine === false) el.textContent = p ? `Sin internet · ${p} sin enviar` : 'Sin internet';
  else el.textContent = p ? `${p} sin enviar` : 'Todo guardado';
  el.className = 'estado ' + (!hayServidor() ? 'local' : p || app.ultimoError ? 'pendiente' : 'ok');
}

void aMinor; void hallarMontos;
