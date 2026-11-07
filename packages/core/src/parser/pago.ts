// Cómo se pagó en efectivo: con qué billete, el vuelto, monedas, y el pago sin total.
import { type Propuesta } from './tipos.ts';
import { total } from './comun.ts';
import { type MontoHallado } from '../dinero.ts';
import { clasificar, type Reparto } from '../efectivo.ts';
import { type Moneda } from '../tipos.ts';

/**
 * «taxi 6000 billete y 1800 monedas» no trae el total: es lo que se pagó, y el total es la suma.
 * Se reescribe como «taxi 7800 con 6000 en billete y 1800 en monedas». Solo si no hay otra cifra
 * en el mensaje (si la hay, el total ya está dicho y se deja al intérprete de siempre).
 */
export function pagoSinTotal(texto: string): string {
  const re = /(\d[\d.]*)\s*(k|mil)?\s*(?:en\s+)?billetes?\s+y\s+(\d[\d.]*)\s*(k|mil)?\s*(?:en\s+)?(?:monedas?|sencillo)/i;
  const m = texto.match(re);
  if (!m) return texto;
  if (/\d/.test(texto.replace(m[0], ''))) return texto;
  const valor = (n: string, mult?: string) => Number(n.replace(/\./g, '')) * (mult ? 1000 : 1);
  const billete = valor(m[1], m[2]);
  const monedas = valor(m[3], m[4]);
  return texto.replace(m[0], `${billete + monedas} con ${billete} en billete y ${monedas} en monedas`);
}

const RE_VUELTO = /\b(me dieron|me devolvieron|me entregaron|me dio|de vuelto|vuelto|de devuelta|devuelta)\b/;
const RE_CON = /\b(?:pague |pagando |pagado )?con (?:(?:un|una|el|la|billete|billetes|de|del) )*(?=\d)/;
const RE_MARCA_MONEDA = /^\s*(?:en |de )?(?:moned\w*|sencill\w*|suelt\w*|billetes?)/;
const RE_RESTO = /^\s*y (?:el resto|lo demas|lo que falta|el restante)(?: en)? ?(?:moned\w*|sencill\w*|suelt\w*)/;

interface PagoLeido {
  /** Montos que quedan una vez quitados los del pago y los del vuelto. */
  montos: MontoHallado[];
  /** Partes del texto que ya no son concepto ni cuenta. */
  tramos: { inicio: number; fin: number }[];
  hayCon: boolean;
  pagoCon?: number;
  pagoMonedas?: number;
  restoEnMonedas?: boolean;
  vueltoDicho: boolean;
  vuelto: Reparto | null;
}

/**
 * Lee lo que se dice sobre cómo se pagó: «con 5k», «con 2k y 800 en monedas», «con 2k y el resto en
 * monedas», el vuelto («vuelto 2k y 200 monedas», «me dieron 2200») y «justo»/«sin vuelto». `limite`
 * es dónde empieza otra cláusula (reparto con personas) que esto no debe invadir.
 */
export function leerPago(t: string, montos: MontoHallado[], limite = Infinity): PagoLeido {
  const res: PagoLeido = { montos, tramos: [], hayCon: false, vueltoDicho: false, vuelto: null };
  let resto = montos;
  const mv = t.match(RE_VUELTO);
  const finCon = Math.min(mv?.index ?? Infinity, limite, t.length);

  if (mv && (mv.index ?? 0) < limite) {
    const desde = mv.index ?? 0;
    const delVuelto = resto.filter(m => m.inicio >= desde);
    res.vueltoDicho = true;
    res.vuelto = clasificar(t.slice(desde), delVuelto.map(m => ({ valor: m.valor, inicio: m.inicio - desde, fin: m.fin - desde })));
    resto = resto.filter(m => m.inicio < desde);
    res.tramos.push({ inicio: desde, fin: t.length });
  } else {
    const mj = t.match(/\b(sin vuelto|justo|exacto)\b/);
    if (mj) {
      res.vueltoDicho = true;
      res.vuelto = { billetes: 0, monedas: 0 };
      res.tramos.push({ inicio: mj.index ?? 0, fin: (mj.index ?? 0) + mj[0].length });
    }
  }

  const mcon = t.slice(0, finCon).match(RE_CON);
  if (mcon) {
    const ini = mcon.index ?? 0;
    const items = resto.filter(m => m.inicio >= ini && m.inicio < finCon && (m.explicito || RE_MARCA_MONEDA.test(t.slice(m.fin, m.fin + 14))));
    if (items.length) {
      let fin = items[items.length - 1].fin;
      const marca = t.slice(fin, finCon).match(RE_MARCA_MONEDA);
      if (marca) fin += marca[0].length;
      const rest = t.slice(fin, finCon).match(RE_RESTO);
      if (rest) { fin += rest[0].length; res.restoEnMonedas = true; }
      const r = clasificar(t.slice(ini, fin), items.map(m => ({ valor: m.valor, inicio: m.inicio - ini, fin: m.fin - ini })));
      res.hayCon = true;
      res.pagoCon = r.billetes;
      if (!res.restoEnMonedas && r.monedas > 0) res.pagoMonedas = r.monedas;
      res.tramos.push({ inicio: ini, fin });
      resto = resto.filter(m => !items.includes(m));
    }
  }
  res.montos = resto;
  return res;
}

/** Pasa a la propuesta lo que se dijo del pago (solo aplica al efectivo en pesos). */
export function anotarPago(p: Propuesta, pg: PagoLeido, efectivoCOP: boolean, avisos: string[]): void {
  if (!efectivoCOP) {
    if (pg.hayCon || pg.vueltoDicho && pg.vuelto && total(pg.vuelto) > 0) avisos.push('El vuelto solo aplica al efectivo: lo ignoré.');
    return;
  }
  if (pg.hayCon) {
    p.pagoCon = pg.pagoCon;
    if (pg.pagoMonedas) p.pagoMonedas = pg.pagoMonedas;
    if (pg.restoEnMonedas) p.restoEnMonedas = true;
  }
  if (pg.vueltoDicho && pg.vuelto) p.vuelto = pg.vuelto;
}

