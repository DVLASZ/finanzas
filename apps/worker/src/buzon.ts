/**
 * Buzón entre instalaciones: una app deja un aviso en el Worker de otra («Mamá te giró $150.000») y
 * la otra lo ve en su pantalla Buzón y decide si lo anota. No pasan claves de acceso: cada Worker
 * tiene su propia clave de buzón (BUZON_CLAVE), que solo sirve para dejar avisos, no para leer nada.
 *
 *   BUZON_CLAVE     para recibir: quien la tenga puede dejar avisos en este Worker
 *   BUZON_DESTINOS  para enviar: JSON {"julio": {"url": "https://...", "clave": "la BUZON_CLAVE de ese Worker"}}
 *   BUZON_NOMBRE    cómo se presenta esta app al enviar («Mamá»)
 */
import type { Datos } from '../../../packages/core/src/index.ts';
import { urlPublicaHttps } from './seguridad.ts';

export interface EnvBuzon { BUZON_CLAVE?: string; BUZON_DESTINOS?: string; BUZON_NOMBRE?: string }

/** `propuesta` es opcional: una frase para el bot de la app que la recibe («ingreso 150000 mama»). Nunca se guarda sola: la otra persona la confirma. */
export interface AvisoBuzon { id: string; de: string; monto: number; concepto: string; cuando: string; estado: 'nuevo' | 'hecho'; propuesta?: string }

const MAX_AVISOS = 50;

/** Revisa la forma de un aviso que viene de fuera. Devuelve el aviso limpio o el motivo del rechazo. */
export function leerAviso(x: unknown): Omit<AvisoBuzon, 'id' | 'estado'> | string {
  const o = x as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return 'Aviso mal formado';
  if (typeof o.de !== 'string' || !o.de.trim() || o.de.length > 40) return 'Falta quién lo manda (hasta 40 letras)';
  if (!Number.isInteger(o.monto) || (o.monto as number) <= 0 || (o.monto as number) > 2_000_000_000) return 'El monto tiene que ser un número entero mayor que cero';
  if (o.concepto !== undefined && (typeof o.concepto !== 'string' || o.concepto.length > 80)) return 'El concepto es muy largo (hasta 80 letras)';
  if (o.propuesta !== undefined && (typeof o.propuesta !== 'string' || o.propuesta.length > 120 || /[\u0000-\u001f]/.test(o.propuesta))) return 'La frase propuesta es muy larga (hasta 120 letras, en una sola línea)';
  const propuesta = typeof o.propuesta === 'string' ? o.propuesta.trim() : '';
  return { de: o.de.trim(), monto: o.monto as number, concepto: ((o.concepto as string | undefined) ?? '').trim(), cuando: new Date().toISOString(), ...(propuesta ? { propuesta } : {}) };
}

export function leerBuzon(config: Datos['config']): AvisoBuzon[] {
  try {
    const l = JSON.parse(config.buzon ?? '[]');
    return Array.isArray(l) ? l.filter((a): a is AvisoBuzon => a && typeof a.id === 'string' && typeof a.monto === 'number') : [];
  } catch { return []; }
}

/** Agrega un aviso a la lista (los más viejos se van si pasan de 50). Devuelve el JSON nuevo para guardar en la config. */
export function agregarAviso(config: Datos['config'], aviso: Omit<AvisoBuzon, 'id' | 'estado'>): string {
  const nuevo: AvisoBuzon = { ...aviso, id: crypto.randomUUID(), estado: 'nuevo' };
  return JSON.stringify([...leerBuzon(config), nuevo].slice(-MAX_AVISOS));
}

export function destinosDe(env: EnvBuzon): Record<string, { url: string; clave: string }> {
  try {
    const d = JSON.parse(env.BUZON_DESTINOS ?? '{}');
    return d && typeof d === 'object' ? d : {};
  } catch { return {}; }
}

/** Deja un aviso en el buzón de otra instalación. Nunca devuelve su dirección ni su clave. */
export async function enviarAlBuzon(
  env: EnvBuzon, dato: { destino: string; de?: string; monto: number; concepto: string; propuesta?: string }, llamar: typeof fetch = fetch,
): Promise<{ ok: boolean; motivo?: string }> {
  const d = destinosDe(env)[dato.destino];
  if (!d?.url || !d.clave) return { ok: false, motivo: `No tengo configurado el destino «${dato.destino}».` };
  // solo https a un dominio público: nunca a una IP, a localhost ni a una red interna (SSRF)
  if (!urlPublicaHttps(d.url)) return { ok: false, motivo: `El destino «${dato.destino}» no es una dirección https pública.` };
  const aviso = leerAviso({ de: dato.de ?? env.BUZON_NOMBRE ?? 'Otra app', monto: dato.monto, concepto: dato.concepto, propuesta: dato.propuesta });
  if (typeof aviso === 'string') return { ok: false, motivo: aviso };
  try {
    const r = await llamar(`${d.url.replace(/\/$/, '')}/api/buzon`, {
      method: 'POST',
      redirect: 'manual', // la clave del buzón no se manda a donde redirija el otro servidor
      headers: { Authorization: `Bearer ${d.clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(aviso),
    });
    return r.ok ? { ok: true } : { ok: false, motivo: `El otro servidor respondió ${r.status}.` };
  } catch {
    return { ok: false, motivo: 'No pude hablar con el otro servidor.' };
  }
}
