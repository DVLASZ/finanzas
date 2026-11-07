/**
 * Atajos del chat según lo que la persona escribe más: los mensajes que se repiten tal cual en los
 * últimos 90 días (un jornal, el pasaje, «mecato 2000»). Tocar uno lo manda al chat y queda una
 * tarjeta por confirmar, así que nada se guarda sin que pulse Confirmar.
 */
import { limpiar } from './texto.ts';
import type { Movimiento } from './tipos.ts';

export function atajosFrecuentes(movs: Movimiento[], ahora: Date, max = 4): string[] {
  const desde = ahora.getTime() - 90 * 86400000;
  const cuenta = new Map<string, { n: number; texto: string }>();
  for (const m of movs) {
    const texto = m.mensajeOriginal?.trim();
    if (m.estado !== 'ok' || m.origen === 'excel' || !texto || texto.length > 40 || texto.includes('\n')) continue;
    if (new Date(m.creadoEn.replace(' ', 'T') + '-05:00').getTime() < desde) continue;
    if (m.tipo === 'apertura' || m.tipo === 'ajuste') continue;
    // frases sin cifras («ayuda», «lista») no son movimientos que se repitan
    if (!/\d/.test(texto)) continue;
    const clave = limpiar(texto);
    const previo = cuenta.get(clave);
    cuenta.set(clave, { n: (previo?.n ?? 0) + 1, texto: previo?.texto ?? texto });
  }
  return [...cuenta.values()].filter(x => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, max).map(x => x.texto);
}
