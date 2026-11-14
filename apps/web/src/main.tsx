/**
 * Arranque de la app: carga los datos del dispositivo, monta la interfaz y sincroniza cuando hay conexión.
 * Se registra el service worker para que funcione sin internet.
 */
import { render } from 'preact';
import { App } from './App.tsx';
import { aplicar } from './state/apariencia.ts';
import { app, iniciar, sincronizar } from './services/app.ts';
import { activarGestoAtras, iniciarHistorial } from './state/nav.ts';
import { iniciarEstado } from './state/store.ts';

async function arrancar(): Promise<void> {
  aplicar();
  await iniciar();
  await iniciarEstado();
  iniciarHistorial();
  activarGestoAtras();
  render(<App />, document.getElementById('raiz')!);

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
