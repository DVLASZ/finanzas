/**
 * Arranque de la app: carga los datos del dispositivo, monta la interfaz y sincroniza cuando hay conexión.
 * Se registra el service worker para que funcione sin internet.
 */
import { render } from 'preact';
import { App } from './App.tsx';
import { aplicar } from './state/apariencia.ts';
import { app, iniciar } from './services/estado.ts';
import { sincronizar } from './services/sincronizacion.ts';
import { accionInicial, activarGestoAtras, imagenCompartida, irA, iniciarHistorial } from './state/nav.ts';
import { iniciarMascara } from './state/privacidad.ts';
import { iniciarBloqueo } from './state/bloqueo.ts';
import { iniciarEstado } from './state/store.ts';
import { iniciarAjusteDeTexto } from './lib/ajustarTexto.ts';

/**
 * Lo que trae la dirección con la que se abrió la app: un acceso directo del ícono («?accion=gasto|voz|saldos») o una
 * imagen compartida desde otra app («?compartido=1», que dejó guardada el service worker).
 */
async function atenderEntradas(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const accion = q.get('accion');
  if (accion === 'saldos') irA('saldos');
  else if (accion === 'gasto' || accion === 'voz') accionInicial.value = accion;
  if (q.get('compartido')) {
    try {
      const cache = await caches.open('finanzas-compartido');
      const r = await cache.match('./imagen');
      if (r) { imagenCompartida.value = await r.blob(); await cache.delete('./imagen'); }
    } catch { /* sin cache: no hay imagen que leer */ }
  }
  if (q.size) history.replaceState(history.state, '', location.pathname);
}

async function arrancar(): Promise<void> {
  aplicar();
  await iniciar();
  await iniciarEstado();
  iniciarHistorial();
  await atenderEntradas();
  activarGestoAtras();
  render(<App />, document.getElementById('raiz')!);
  iniciarAjusteDeTexto(document.getElementById('raiz')!);
  iniciarMascara(document.body);
  void iniciarBloqueo();

  // Sincroniza al abrir, al recuperar la conexión, al volver a la app y cada minuto.
  // Los componentes se pintan solos cuando cambian los datos, no hay que redibujar a mano.
  const sync = () => sincronizar();
  void sync();
  window.addEventListener('online', () => void sync());
  window.addEventListener('offline', () => void iniciarEstado());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void sync(); });
  setInterval(() => { if (!document.hidden && app.repo.cola.length) void sync(); }, 60_000);

  // Botón "Instalar app" (Chrome/Edge/Android)
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    (window as unknown as { __instalar: unknown }).__instalar = e;
  });

  // Funcionar sin conexión: el service worker guarda la app en el dispositivo.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Sin service worker:', err));
  }
}

void arrancar();
