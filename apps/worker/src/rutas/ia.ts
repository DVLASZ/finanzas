/**
 * Ayuda de la IA: reescribe una frase que las reglas no entendieron. No guarda nada.
 *   POST /api/interpretar
 */
import {
  aLocal, contextoDe, ESQUEMA_IA, instruccionesIA, leerFrasesIA, TOPE_IA_POR_DIA, usoDeIA, validarFrasesIA,
} from '../../../../packages/core/src/index.ts';
import { json, type Ruta } from '../comun.ts';

/** Modelo de Workers AI que reescribe las frases. Cloudflare retira modelos: se puede cambiar con IA_MODELO sin tocar el código. */
const MODELO_IA = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/** Cuánto se espera al modelo antes de rendirse. */
const ESPERA_IA_MS = 20_000;

type Db = { prepare(sql: string): { bind(...v: unknown[]): { run(): Promise<{ meta?: { changes?: number } }>; first<T>(): Promise<T | null> } } };

/**
 * Cambia el contador del día solo si nadie lo tocó desde que se leyó (compara el valor viejo en la misma
 * sentencia), así dos peticiones a la vez no se pisan. Devuelve si el cambio entró.
 */
async function cambiarUso(db: Db, de: string | undefined, a: string): Promise<boolean> {
  const r = de === undefined
    ? await db.prepare("INSERT OR IGNORE INTO config (clave, valor) VALUES ('ia_uso', ?)").bind(a).run()
    : await db.prepare("UPDATE config SET valor = ? WHERE clave = 'ia_uso' AND valor = ?").bind(a, de).run();
  return (r.meta?.changes ?? 0) > 0;
}

/** Aparta un uso del día. Null si ya se llegó al tope. */
async function apartarUso(db: Db, hoy: string, tope: number): Promise<{ antes: string | undefined; nuevo: string } | 'tope' | 'ocupado'> {
  for (let intento = 0; intento < 4; intento++) {
    const fila = await db.prepare("SELECT valor FROM config WHERE clave = 'ia_uso'").bind().first<{ valor: string }>();
    const antes = fila?.valor;
    const nuevo = usoDeIA(antes, hoy, tope);
    if (!nuevo) return 'tope';
    if (await cambiarUso(db, antes, nuevo)) return { antes, nuevo };
  }
  return 'ocupado';
}

/** El modelo falló: se devuelve el uso apartado (si nadie más lo movió en el medio). */
async function devolverUso(db: Db, apartado: { antes: string | undefined; nuevo: string }): Promise<void> {
  const [dia, n] = apartado.nuevo.split(':');
  if (Number(n) <= 1) await db.prepare("DELETE FROM config WHERE clave = 'ia_uso' AND valor = ?").bind(apartado.nuevo).run();
  else await cambiarUso(db, apartado.nuevo, `${dia}:${Number(n) - 1}`);
}

/** Espera al modelo, pero no más de `ms`. */
function conLimite<T>(p: Promise<T>, ms: number): Promise<T> {
  let reloj: ReturnType<typeof setTimeout>;
  const tarde = new Promise<never>((_, no) => { reloj = setTimeout(() => no(new Error('tiempo')), ms); });
  return Promise.race([p, tarde]).finally(() => clearTimeout(reloj));
}

export const rutaIA: Ruta = async ({ req, url, env, repo }) => {
  if (url.pathname !== '/api/interpretar' || req.method !== 'POST') return null;
  if (!env.AI) return json({ error: 'Este servidor no tiene la ayuda de la IA.' }, 501);
  const cuerpo = (await req.json().catch(() => null)) as { texto?: unknown } | null;
  const texto = typeof cuerpo?.texto === 'string' ? cuerpo.texto.trim() : '';
  if (!texto || texto.length > 400) return json({ error: 'Escribe una frase de hasta 400 letras.' }, 400);
  const datos = await repo.cargar();
  if (datos.config.ia === '0') return json({ error: 'La ayuda de la IA está apagada.' }, 403);
  const tope = Number(env.IA_TOPE) > 0 ? Number(env.IA_TOPE) : TOPE_IA_POR_DIA;
  const ahora = new Date();
  const apartado = await apartarUso(env.DB as unknown as Db, aLocal(ahora).slice(0, 10), tope);
  if (apartado === 'tope') return json({ error: 'Hoy ya usaste todas las ayudas. Escríbelo de forma más simple.' }, 429);
  if (apartado === 'ocupado') return json({ error: 'La ayuda está ocupada. Inténtalo otra vez.' }, 502);
  // si la IA falla, el uso apartado se devuelve: no se cobra una ayuda que no ayudó
  const fallar = async (motivo: string) => {
    await devolverUso(env.DB as unknown as Db, apartado).catch(() => {});
    return json({ error: 'La ayuda no respondió. Inténtalo otra vez.', motivo }, 502);
  };
  try {
    const espera = Number(env.IA_ESPERA_MS) > 0 ? Number(env.IA_ESPERA_MS) : ESPERA_IA_MS;
    const r = (await conLimite(Promise.resolve(env.AI.run(env.IA_MODELO || MODELO_IA, {
      messages: [{ role: 'system', content: instruccionesIA(datos) }, { role: 'user', content: texto }],
      max_tokens: 300,
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: ESQUEMA_IA },
    })), espera)) as { response?: unknown };
    const frases = leerFrasesIA(r?.response ?? r);
    if (!frases) return fallar('respuesta sin formato');
    // la frase de la persona no se guarda en ningún registro
    return json({ frases: validarFrasesIA(frases, texto, contextoDe(datos, ahora)) });
  } catch (e) {
    const tarde = (e as Error).message === 'tiempo';
    console.error('ia:', tarde ? 'tiempo agotado' : 'el modelo falló'); // nunca la frase ni el texto interno del modelo
    return fallar(tarde ? 'tardó demasiado' : 'el modelo falló');
  }
};
