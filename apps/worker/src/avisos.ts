/**
 * Avisos al celular: quién los manda y cuándo.
 *
 *   mañana (8 am)   deudas por vencer, gastos que toca anotar, días sin registrar, resúmenes
 *   tarde (6 pm)    cierre del día (¿la billetera tiene lo que dice la app?) y cuentas en negativo
 *   al momento      una meta lograda y un giro que llega por el buzón
 *   los domingos    si el respaldo en la nube falla
 *   de noche        «¿Anotaste los gastos de hoy?», a la hora que cada quien elige (solo si hoy no anotó nada)
 *
 * Cada aviso se manda a todos los celulares suscritos. Lo que ya no existe (404 o 410) se borra de la lista.
 */
import {
  aLocal, calcularAlertas, leerMetas, tocaRecordar, type Datos, type Op,
} from '../../../packages/core/src/index.ts';
import { crearLlavesVapid, enviarAviso, type LlavesVapid, type Suscripcion } from './push.ts';
import type { D1Repo } from './d1repo.ts';

export interface AvisoCelular { titulo: string; cuerpo: string }

/** Las llaves del servidor para los avisos: se crean la primera vez que hacen falta. */
export async function llavesVapid(repo: D1Repo): Promise<LlavesVapid> {
  const guardadas = await repo.leerSecreto<LlavesVapid>('vapid');
  if (guardadas) return guardadas;
  const nuevas = await crearLlavesVapid();
  await repo.guardarSecreto('vapid', nuevas);
  return nuevas;
}

/** Lo que dice cada alerta en la pantalla de bloqueo: el tema y nada más (sin montos, nombres ni categorías). El detalle está en la app. */
export const TEXTO_GENERICO: Record<string, string> = {
  'saldo-inicial': 'Falta decir cuánta plata tienes.',
  'saldo-negativo': 'Una de tus cuentas quedó en negativo. Ábrela para revisar.',
  'cierre-dia': 'Es hora de cuadrar la billetera del día.',
  'resumen-semana': 'Recordatorio de revisión semanal.',
  'resumen-mes': 'Tu resumen del mes está listo.',
  liquidez: 'Revisa tu proyección de liquidez.',
  stock: 'Se está acabando un producto.',
  proyeccion: 'Revisa tu ritmo de gasto del mes.',
  tope: 'Revisa tus topes del mes.',
};

/** Manda un aviso a todos los celulares. Devuelve cuántos lo recibieron y cuántos se quitaron de la lista. */
export async function mandarAviso(repo: D1Repo, aviso: AvisoCelular): Promise<{ enviados: number; quitados: number }> {
  const subs = (await repo.leerSecreto<Suscripcion[]>('suscripciones')) ?? [];
  if (!subs.length) return { enviados: 0, quitados: 0 };
  const llaves = await llavesVapid(repo);
  let enviados = 0;
  const vivas: Suscripcion[] = [];
  for (const s of subs) {
    const estado = await enviarAviso(s, aviso, llaves);
    if (estado === 'ok') enviados++;
    if (estado !== 'caducada') vivas.push(s);
  }
  if (vivas.length !== subs.length) await repo.guardarSecreto('suscripciones', vivas);
  return { enviados, quitados: subs.length - vivas.length };
}

/** Tarea de la mañana o de la tarde: manda lo que corresponda y calla si no hay nada. */
export async function avisarAlCelular(
  repo: D1Repo, ahora: Date, momento: 'manana' | 'tarde' = 'manana',
): Promise<{ enviados: number; quitados: number }> {
  const subs = (await repo.leerSecreto<Suscripcion[]>('suscripciones')) ?? [];
  if (!subs.length) return { enviados: 0, quitados: 0 };
  const todas = calcularAlertas(await repo.cargar(), ahora);
  const hoyEsDia1 = aLocal(ahora).slice(8, 10) === '01';
  const alertas = momento === 'tarde'
    ? todas.filter(a => a.id === 'cierre-dia' || a.id === 'saldo-negativo')
    : todas.filter(a => a.id !== 'tope' && (a.nivel !== 'info' || a.id === 'resumen-semana' || (a.id === 'resumen-mes' && hoyEsDia1))
      && a.id !== 'saldo-inicial' && a.id !== 'saldo-negativo' && a.id !== 'cierre-dia');
  if (!alertas.length) return { enviados: 0, quitados: 0 };
  const titulo = momento === 'tarde'
    ? (alertas.some(a => a.id === 'saldo-negativo') ? 'Una cuenta quedó en negativo' : 'Cuenta la billetera')
    : alertas.length === 1 ? 'Un aviso de tus finanzas' : `${alertas.length} avisos de tus finanzas`;
  const cuerpo = [...new Set(alertas.map(a => TEXTO_GENERICO[a.id ?? ''] ?? 'Ábrelo en la app para verlo.'))].slice(0, 2).join(' ');
  return mandarAviso(repo, { titulo, cuerpo });
}

/** El recordatorio de la noche: se manda en la media hora elegida si hoy no se anotó nada. Devuelve si salió. */
export async function avisarRecordatorio(repo: D1Repo, ahora: Date): Promise<boolean> {
  const datos = await repo.cargar();
  if (!tocaRecordar(datos.config.recordatorio, datos.movimientos, ahora)) return false;
  const r = await mandarAviso(repo, { titulo: '¿Anotaste los gastos de hoy?', cuerpo: 'Tómate un minuto y deja el día al día. Toca para abrir el chat.' });
  return r.enviados > 0;
}

/** Cuando una meta de ahorro llega a su valor (o lo pasa) se avisa una vez; si baja y vuelve a llegar, otra vez. */
export async function avisarMetas(repo: D1Repo, datos: Datos, ops: Op[]): Promise<void> {
  if (!ops.some(o => o.op === 'config' && o.clave === 'metas')) return;
  const metas = leerMetas(datos.config);
  const avisadas = new Set((await repo.leerSecreto<string[]>('avisos_metas')) ?? []);
  const llegaron = metas.filter(m => m.meta > 0 && m.apartado >= m.meta && !avisadas.has(m.nombre));
  const siguen = new Set(metas.filter(m => m.meta > 0 && m.apartado >= m.meta).map(m => m.nombre));
  const nuevas = [...siguen];
  if (nuevas.length !== avisadas.size || nuevas.some(n => !avisadas.has(n))) await repo.guardarSecreto('avisos_metas', nuevas);
  if (!llegaron.length) return;
  await mandarAviso(repo, { titulo: 'Meta lograda', cuerpo: llegaron.length === 1 ? 'Llegaste a una de tus metas de ahorro.' : 'Llegaste a varias de tus metas de ahorro.' });
}

/** Cuánto ocupan las fotos de recibos antes de avisar: 3 GB de los 5 GB que da la base gratis. */
export const LIMITE_FOTOS_BYTES = 3_000_000_000;

/** Avisa (como mucho una vez por semana) si las fotos de recibos se acercan al límite gratis de la base. */
export async function avisarFotos(repo: D1Repo, ahora = new Date(), limite = LIMITE_FOTOS_BYTES): Promise<boolean> {
  const bytes = await repo.bytesDeFotos();
  if (bytes < limite) return false;
  const hoy = aLocal(ahora).slice(0, 10);
  const ultimo = await repo.leerSecreto<string>('avisos_fotos');
  if (ultimo && Date.parse(hoy) - Date.parse(ultimo) < 7 * 86400000) return false;
  await repo.guardarSecreto('avisos_fotos', hoy);
  await mandarAviso(repo, { titulo: 'Las fotos ocupan mucho', cuerpo: 'Las fotos de recibos se acercan al límite gratis de la base. Quita las que no necesites desde el detalle de cada movimiento.' });
  return true;
}
