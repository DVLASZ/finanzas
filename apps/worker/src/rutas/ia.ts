/**
 * Ayuda de la IA: reescribe una frase que las reglas no entendieron. No guarda nada.
 *   POST /api/interpretar
 */
import { aLocal, ESQUEMA_IA, frasesDeRespuesta, instruccionesIA, TOPE_IA_POR_DIA, usoDeIA } from '../../../../packages/core/src/index.ts';
import { json, type Ruta } from '../comun.ts';

/** Modelo de Workers AI que reescribe las frases. Cloudflare retira modelos: se puede cambiar con IA_MODELO sin tocar el código. */
const MODELO_IA = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export const rutaIA: Ruta = async ({ req, url, env, repo }) => {
  if (url.pathname !== '/api/interpretar' || req.method !== 'POST') return null;
  if (!env.AI) return json({ error: 'Este servidor no tiene la ayuda de la IA.' }, 501);
  const cuerpo = (await req.json().catch(() => null)) as { texto?: unknown } | null;
  const texto = typeof cuerpo?.texto === 'string' ? cuerpo.texto.trim() : '';
  if (!texto || texto.length > 400) return json({ error: 'Escribe una frase de hasta 400 letras.' }, 400);
  const datos = await repo.cargar();
  if (datos.config.ia === '0') return json({ error: 'La ayuda de la IA está apagada.' }, 403);
  const tope = Number(env.IA_TOPE) > 0 ? Number(env.IA_TOPE) : TOPE_IA_POR_DIA;
  const nuevo = usoDeIA(datos.config.ia_uso, aLocal(new Date()).slice(0, 10), tope);
  if (!nuevo) return json({ error: 'Hoy ya usaste todas las ayudas. Escríbelo de forma más simple.' }, 429);
  await repo.setConfig('ia_uso', nuevo);
  try {
    const r = (await env.AI.run(env.IA_MODELO || MODELO_IA, {
      messages: [{ role: 'system', content: instruccionesIA(datos) }, { role: 'user', content: texto }],
      max_tokens: 300,
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: ESQUEMA_IA },
    })) as { response?: unknown };
    // la frase de la persona no se guarda en ningún registro
    return json({ frases: frasesDeRespuesta(r?.response ?? r) });
  } catch (e) {
    console.error('ia:', (e as Error).message); // solo el motivo, nunca la frase
    return json({ error: 'La ayuda no respondió. Inténtalo otra vez.', motivo: (e as Error).message.slice(0, 200) }, 502);
  }
};
