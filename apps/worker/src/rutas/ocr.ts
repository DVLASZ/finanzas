/**
 * Lectura de comprobantes con la IA con visión de Workers AI. No guarda nada: devuelve lo que ve y la app lo
 * convierte en una tarjeta para confirmar.
 *   POST /api/ocr    { imagen: "data:image/jpeg;base64,..." }  ->  { lectura: { monto, fecha, comercio, categoria } }
 */
import { aLocal, INSTRUCCIONES_OCR, leerRespuestaOCR, TOPE_IA_POR_DIA, usoDeIA } from '../../../../packages/core/src/index.ts';
import { json, type Env, type Ruta } from '../comun.ts';

/**
 * Modelo con visión. Llama 3.2 Vision lee mucho mejor el texto de una tirilla que LLaVA 1.5, que inventó montos y
 * fechas. Pide aceptar la licencia de Meta una sola vez por cuenta (ver docs/IA.md). Se puede cambiar con
 * IA_OCR_MODELO si Cloudflare lo retira.
 */
export const MODELO_OCR = '@cf/meta/llama-3.2-11b-vision-instruct';
/** La app manda la foto reducida (unos 450 KB como máximo). Más que esto no es un comprobante. */
const MAX_BASE64 = 900_000;

/** ¿El error es de la licencia de Meta, que se acepta una vez? */
const esDeLicencia = (e: unknown): boolean => /agree|licen[cs]e|5016/i.test((e as Error)?.message ?? '');

async function preguntar(env: Env, modelo: string, dataUrl: string, bytes: () => number[]): Promise<unknown> {
  try {
    return await env.AI!.run(modelo, {
      messages: [{ role: 'user', content: [{ type: 'text', text: INSTRUCCIONES_OCR }, { type: 'image_url', image_url: { url: dataUrl } }] }],
      max_tokens: 500,
      temperature: 0,
    });
  } catch (e) {
    if (esDeLicencia(e)) throw e;
    // algunos modelos solo aceptan la forma {prompt, image}
    return await env.AI!.run(modelo, { prompt: INSTRUCCIONES_OCR, image: bytes(), max_tokens: 500 });
  }
}

export const rutaOCR: Ruta = async ({ req, url, env, repo }) => {
  if (url.pathname !== '/api/ocr' || req.method !== 'POST') return null;
  if (!env.AI) return json({ error: 'Este servidor no tiene la IA para leer comprobantes.' }, 501);
  const cuerpo = (await req.json().catch(() => null)) as { imagen?: unknown } | null;
  const imagen = typeof cuerpo?.imagen === 'string' ? cuerpo.imagen : '';
  const base64 = imagen.replace(/^data:image\/[a-z]+;base64,/, '');
  if (!base64 || base64.length > MAX_BASE64) return json({ error: 'La imagen no sirve o pesa demasiado.' }, 400);
  const datos = await repo.cargar();
  if (datos.config.ia === '0') return json({ error: 'La IA está apagada en Ajustes.' }, 403);
  // cuenta contra el mismo tope diario que la ayuda de frases
  const tope = Number(env.IA_TOPE) > 0 ? Number(env.IA_TOPE) : TOPE_IA_POR_DIA;
  const hoy = aLocal(new Date()).slice(0, 10);
  const nuevo = usoDeIA(datos.config.ia_uso, hoy, tope);
  if (!nuevo) return json({ error: 'Hoy ya usaste todas las lecturas de la IA. Escribe el gasto a mano.' }, 429);
  await repo.setConfig('ia_uso', nuevo);
  try {
    const bytes = () => Array.from(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
    const r = (await preguntar(env, env.IA_OCR_MODELO || MODELO_OCR, `data:image/jpeg;base64,${base64}`, bytes)) as { description?: unknown; response?: unknown };
    const lectura = leerRespuestaOCR(r?.response ?? r?.description ?? r, hoy);
    // la imagen no se guarda en ningún registro
    return lectura ? json({ lectura }) : json({ error: 'No pude leer el monto en esa foto. Prueba con otra o escríbelo.' }, 422);
  } catch (e) {
    console.error('ocr:', (e as Error).message); // solo el motivo, nunca la imagen
    if (esDeLicencia(e)) return json({ error: 'El modelo de lectura pide aceptar su licencia una vez en la cuenta de Cloudflare. Mira docs/IA.md.', motivo: (e as Error).message.slice(0, 200) }, 503);
    return json({ error: 'La lectura no respondió. Inténtalo otra vez.', motivo: (e as Error).message.slice(0, 200) }, 502);
  }
};
