/** Avisos al celular (notificaciones push). */
import { hayServidor } from './estado.ts';
import { llamar } from './http.ts';

const llaveABytes = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));

/** ¿Este celular ya recibe avisos? */
export async function avisosActivados(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

/** Pide permiso, se suscribe y le cuenta al servidor. Devuelve un mensaje para mostrar. */
export async function activarAvisos(): Promise<string> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'Este navegador no puede mostrar avisos.';
  if (!hayServidor()) return 'Primero conecta la app con el servidor (arriba, en «Conexión»).';
  try {
    if ((await Notification.requestPermission()) !== 'granted') return 'No diste permiso. Puedes darlo en los ajustes del navegador y volver a intentar.';
    const reg = await navigator.serviceWorker.ready;
    const { clave } = await llamar<{ clave: string }>('GET', '/api/push/clave');
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llaveABytes(clave) as BufferSource });
    await llamar('POST', '/api/push/suscribir', { suscripcion: sub.toJSON() });
    return 'Listo, te avisaré en este celular.';
  } catch (e) {
    return `No se pudo activar: ${(e as Error).message}`;
  }
}

export async function apagarAvisos(): Promise<string> {
  try {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) {
      await llamar('POST', '/api/push/baja', { endpoint: sub.endpoint }).catch(() => null);
      await sub.unsubscribe();
    }
    return 'Avisos apagados en este celular.';
  } catch (e) {
    return `No se pudo apagar: ${(e as Error).message}`;
  }
}

/** Manda un aviso de prueba a los celulares suscritos. */
export async function probarAvisos(): Promise<string> {
  try {
    const r = await llamar<{ enviados: number; suscritos: number }>('POST', '/api/push/probar');
    return r.suscritos === 0 ? 'Todavía no hay ningún celular con avisos activados.' : `Mandé la prueba a ${r.enviados} de ${r.suscritos} celulares. Debería llegar en unos segundos.`;
  } catch (e) {
    return `No se pudo probar: ${(e as Error).message}`;
  }
}
