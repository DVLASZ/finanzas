/**
 * Lectura de comprobantes con la IA con visión de Workers AI. No guarda nada: devuelve lo que ve y la app lo
 * convierte en una tarjeta para confirmar.
 *   POST /api/ocr    { imagen: "data:image/jpeg;base64,..." }  ->  { lectura: { monto, fecha, comercio, categoria } }
 */
import { aLocal, INSTRUCCIONES_OCR, leerRespuestaOCR, TOPE_IA_POR_DIA, usoDeIA } from '../../../../packages/core/src/index.ts';
import { json, type Ruta } from '../comun.ts';

/** Modelo con visión del plan gratuito. Se puede cambiar con IA_OCR_MODELO si Cloudflare lo retira. */
const MODELO_OCR = '@cf/llava-hf/llava-1.5-7b-hf';
/** La app baja la foto a 1000 px: unos 150 KB. Más que esto no es un comprobante. */
const MAX_BASE64 = 1_500_000;

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
  const nuevo = usoDeIA(datos.config.ia_uso, aLocal(new Date()).slice(0, 10), tope);
  if (!nuevo) return json({ error: 'Hoy ya usaste todas las lecturas de la IA. Escribe el gasto a mano.' }, 429);
  await repo.setConfig('ia_uso', nuevo);
  try {
    const bytes = Array.from(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
    const r = (await env.AI.run(env.IA_OCR_MODELO || MODELO_OCR, { image: bytes, prompt: INSTRUCCIONES_OCR, max_tokens: 256 })) as { description?: unknown; response?: unknown };
    const lectura = leerRespuestaOCR(r?.description ?? r?.response ?? r);
    // la imagen no se guarda en ningún registro
    return lectura ? json({ lectura }) : json({ error: 'No pude leer el monto en esa foto. Prueba con otra o escríbelo.' }, 422);
  } catch (e) {
    console.error('ocr:', (e as Error).message); // solo el motivo, nunca la imagen
    return json({ error: 'La lectura no respondió. Inténtalo otra vez.', motivo: (e as Error).message.slice(0, 200) }, 502);
  }
};
