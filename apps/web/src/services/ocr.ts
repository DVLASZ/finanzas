/**
 * Lectura de comprobantes: manda la foto (ya reducida) al servidor, que la lee con la IA con visión.
 * Nada se guarda: lo leído se convierte en una frase para el bot y la persona confirma la tarjeta.
 */
import type { LecturaOCR } from '../../../../packages/core/src/index.ts';
import { aDataUrl, reducirFoto } from '../lib/imagen.ts';
import { app, hayServidor } from './app.ts';

export async function leerComprobante(foto: Blob): Promise<{ lectura?: LecturaOCR; error?: string }> {
  if (!hayServidor()) return { error: 'Leer comprobantes necesita el servidor. Conéctalo en Ajustes o escribe el gasto.' };
  if (navigator.onLine === false) return { error: 'Leer comprobantes necesita internet. Escribe el gasto.' };
  try {
    const imagen = await aDataUrl(await reducirFoto(foto));
    const r = await fetch(`${app.ajustes.url.replace(/\/$/, '')}/api/ocr`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${app.ajustes.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagen }),
    });
    const d = (await r.json().catch(() => ({}))) as { lectura?: LecturaOCR; error?: string };
    return r.ok && d.lectura ? { lectura: d.lectura } : { error: d.error ?? 'No pude leer el comprobante.' };
  } catch {
    return { error: 'No pude hablar con el servidor.' };
  }
}
