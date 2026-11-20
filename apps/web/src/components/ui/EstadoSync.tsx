/**
 * El estado de la sincronización con el servidor. `EstadoSync` es el indicador completo (vive en Ajustes) y `AvisoSync` es la
 * píldora de arriba, que solo aparece cuando pasa algo real: sin internet, cambios sin enviar o sincronizando.
 */
import { Check, WifiOff } from 'lucide-preact';
import { conServidor, estadoSync, pendientes } from '../../state/store.ts';

function leer() {
  const e = estadoSync.value;
  const p = pendientes.value;
  const sinRed = conServidor.value && navigator.onLine === false;
  const texto = !conServidor.value ? 'Solo en este aparato'
    : sinRed ? (p ? `Sin internet · ${p} sin enviar` : 'Sin internet')
    : e === 'sincronizando' ? 'Sincronizando'
    : p ? `${p} sin enviar` : 'Al día';
  const tranquilo = !sinRed && ((e === 'local' && !conServidor.value) || (e === 'ok' && !p));
  const tono = e === 'ok' && !sinRed ? 'text-pos bg-pos/12' : e === 'local' ? 'text-tx2 bg-elev' : 'text-adv bg-adv/12';
  return { e, sinRed, texto, tranquilo, tono };
}

export function EstadoSync() {
  const { e, sinRed, texto, tono } = leer();
  return (
    <span id="estado" class={`estado inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${tono}`} role="status" aria-label={texto}>
      {sinRed ? <WifiOff size={13} /> : e === 'ok' ? <Check size={13} /> : <span class="h-1.5 w-1.5 rounded-full bg-current" />}
      {texto}
    </span>
  );
}

export function AvisoSync() {
  const { e, sinRed, texto, tranquilo, tono } = leer();
  if (tranquilo) return null;
  return (
    <span id="aviso-sync" key={texto} class={`aviso-sync ${tono}`} role="status" aria-live="polite">
      {sinRed ? <WifiOff size={14} /> : e === 'sincronizando' ? <span class="girando" aria-hidden="true" /> : <span class="h-1.5 w-1.5 rounded-full bg-current" />}
      {texto}
    </span>
  );
}
