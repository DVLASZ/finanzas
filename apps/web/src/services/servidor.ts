/** Estado del servidor y buzón entre apps. */
import { cabeceraJson, llamar, urlBase } from './http.ts';

/** Cómo va el servidor de esta instalación (lo mismo que `npm run salud`). */
export interface SaludServidor { fotos?: { cantidad: number; kb: number }; movimientos: number; ultimoMovimiento: string | null; desdeCuando: string | null; celularesConAvisos: number; ia: { encendida: boolean; uso: string | null }; ahora: string }
export async function leerSalud(): Promise<SaludServidor | string> {
  try { return await llamar<SaludServidor>('GET', '/api/salud'); } catch { return 'No pude hablar con el servidor. Revisa la conexión y el token.'; }
}

/** Buzón entre apps: a quién se le puede avisar, y el aviso. */
export async function destinosDelBuzon(): Promise<string[]> {
  try { return (await llamar<{ destinos: string[] }>('GET', '/api/buzon/destinos')).destinos; } catch { return []; }
}
export async function avisarAOtraApp(destino: string, monto: number, concepto: string, propuesta = ''): Promise<string> {
  try {
    const r = await fetch(`${urlBase()}/api/buzon/enviar`, {
      method: 'POST', headers: cabeceraJson(), body: JSON.stringify({ destino, monto, concepto, ...(propuesta.trim() ? { propuesta: propuesta.trim() } : {}) }),
    });
    const d = (await r.json().catch(() => ({}))) as { ok?: boolean; motivo?: string };
    return r.ok ? (propuesta.trim() ? 'Listo, le dejé el aviso con la propuesta.' : 'Listo, le dejé el aviso.') : d.motivo ?? 'No se pudo enviar.';
  } catch { return 'No pude hablar con el servidor.'; }
}
