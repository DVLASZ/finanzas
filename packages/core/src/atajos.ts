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
  tipo: 'fijo';
}

/**
 * Los botones que la app pone sola: solo los pagos fijos que ya tocan, porque esos sí llevan monto y cuenta reales.
 * Todo lo demás lo arma cada persona (atajos de usuario, abajo): una plantilla de montos inventados estorba cuando el
 * pasaje cambia o se paga con Nequi.
 */
export function atajosRapidos(datos: Pick<Datos, 'movimientos' | 'config'>, ahora: Date, max = 4): AtajoRapido[] {
  return recurrentesPendientes(datos.config, datos.movimientos, aLocal(ahora)).slice(0, max)
    .map(r => ({ frase: r.frase, etiqueta: `${r.concepto} ${formatear(r.monto)}`, tipo: 'fijo' as const }));
}

/**
 * Un atajo que arma la persona. En modo «plantilla» al tocarlo el texto queda escrito en el cuadro para ponerle el monto
 * y la cuenta de verdad; en modo «frase» ya trae todo y se arma directo la tarjeta por confirmar.
 */
export interface AtajoUsuario {
  id: string;
  etiqueta: string;
  frase: string;
  modo: 'plantilla' | 'frase';
  /** Oculto: no sale en la barra del chat pero sigue en el editor. */
  oculto?: boolean;
}

export const MAX_ATAJOS = 12;

/** Lo que se guardó en el dispositivo, sin fiarse de su forma: descarta lo roto y recorta lo largo. */
export function limpiarAtajos(x: unknown): AtajoUsuario[] {
  if (!Array.isArray(x)) return [];
  const res: AtajoUsuario[] = [];
  for (const a of x) {
    if (!a || typeof a !== 'object') continue;
    const { id, etiqueta, frase, modo } = a as Record<string, unknown>;
    if (typeof frase !== 'string' || !frase.trim()) continue;
    const f = frase.trim().slice(0, 80);
    res.push({
      id: typeof id === 'string' && id ? id : `a${res.length}-${f.length}`,
      etiqueta: (typeof etiqueta === 'string' && etiqueta.trim() ? etiqueta.trim() : etiquetaDe(f)).slice(0, 24),
      frase: f,
      modo: modo === 'plantilla' ? 'plantilla' : 'frase',
      ...((a as Record<string, unknown>).oculto === true ? { oculto: true } : {}),
    });
  }
  return res.slice(0, MAX_ATAJOS);
}

/** La etiqueta por defecto: lo escrito sin el monto, con mayúscula inicial («recarga nequi 20000» da «Recarga nequi»). */
export function etiquetaDe(frase: string): string {
  const t = frase.replace(/\$?\d[\d.,]*\s*(mil|k)?/gi, '').replace(/\s+/g, ' ').trim() || frase.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Sin monto es una plantilla (se completa a mano); con monto es una frase lista. */
export const modoSugerido = (frase: string): AtajoUsuario['modo'] => (/\d/.test(frase) ? 'frase' : 'plantilla');

/** Cambia de lugar un atajo (dir -1 sube, 1 baja). Devuelve una lista nueva. */
export function moverAtajo(lista: AtajoUsuario[], i: number, dir: -1 | 1): AtajoUsuario[] {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= lista.length || j >= lista.length) return lista;
  const nueva = [...lista];
  [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
  return nueva;
}

/** Lo que más repites y todavía no es un atajo: para agregarlo con un toque desde el editor. */
export function sugerenciasAtajos(movs: Movimiento[], ahora: Date, existentes: AtajoUsuario[], max = 4): string[] {
  const hay = new Set(existentes.map(a => limpiar(a.frase)));
  return atajosFrecuentes(movs, ahora, 12).filter(f => !hay.has(limpiar(f))).slice(0, max);
}
