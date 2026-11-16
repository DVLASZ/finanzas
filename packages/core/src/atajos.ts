/**
 * Atajos del chat según lo que la persona escribe más: los mensajes que se repiten tal cual en los
 * últimos 90 días (un jornal, el pasaje, «mecato 2000»). Tocar uno lo manda al chat y queda una
 * tarjeta por confirmar, así que nada se guarda sin que pulse Confirmar.
 */
import { formatear } from './dinero.ts';
import { aLocal } from './fechas.ts';
import { recurrentesPendientes } from './recurrentes.ts';
import type { Datos } from './repo.ts';
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

/** Un botón de un toque sobre el cuadro de texto del chat. */
export interface AtajoRapido {
  /** Lo que se manda al chat al tocarlo (queda una tarjeta por confirmar). */
  frase: string;
  /** Lo que dice el botón. */
  etiqueta: string;
  /** De dónde sale: un pago fijo que ya toca, algo que se repite, un atajo de la app o lo último que anotaste. */
  tipo: 'fijo' | 'frecuente' | 'atajo' | 'reciente';
}

/**
 * Los botones rápidos del chat, de lo más urgente a lo más cómodo: primero los pagos fijos que ya tocan, luego lo que
 * se repite, luego los atajos de la app (el pasaje con su monto) y, si hay pocos, lo último que anotaste.
 */
export function atajosRapidos(datos: Pick<Datos, 'movimientos' | 'config' | 'atajos'>, ahora: Date, max = 8): AtajoRapido[] {
  const res: AtajoRapido[] = [];
  const vistos = new Set<string>();
  const agregar = (a: AtajoRapido) => {
    const k = limpiar(a.frase);
    if (!k || vistos.has(k) || res.length >= max) return;
    vistos.add(k); res.push(a);
  };
  for (const r of recurrentesPendientes(datos.config, datos.movimientos, aLocal(ahora))) {
    agregar({ frase: r.frase, etiqueta: `${r.concepto} ${formatear(r.monto)}`, tipo: 'fijo' });
  }
  for (const f of atajosFrecuentes(datos.movimientos, ahora, 6)) agregar({ frase: f, etiqueta: f, tipo: 'frecuente' });
  for (const a of datos.atajos.filter(x => x.monto && x.moneda === 'COP').slice(0, 3)) {
    agregar({ frase: a.palabra, etiqueta: `${a.concepto} ${formatear(a.monto!)}`, tipo: 'atajo' });
  }
  if (res.length < 4) {
    // lo último que anotaste, sin repetir
    const recientes = [...datos.movimientos].filter(m => m.estado === 'ok' && m.origen !== 'excel' && (m.tipo === 'gasto' || m.tipo === 'ingreso'))
      .sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn));
    for (const m of recientes) {
      const t = m.mensajeOriginal?.trim();
      if (t && t.length <= 40 && !t.includes('\n') && /\d/.test(t) && !/\b(ayer|antier|hace|el \d)/i.test(t)) agregar({ frase: t, etiqueta: t, tipo: 'reciente' });
      if (res.length >= 4) break;
    }
  }
  return res;
}
