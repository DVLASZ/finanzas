// Saldo inicial y arqueo.
import { error, type Propuesta, type Resultado } from './tipos.ts';
import { conOriginales, nombreEn, prepararBase, propuestaBase, recortarBordes, tramosDe, type Base } from './comun.ts';
import { deuda } from './personas.ts';
import { hallarMontos, aMinor } from '../dinero.ts';
import { borrarTramos, ejemploDeSaldos, hallarCuentas } from '../entidades.ts';
import { hallarFecha, hallarFechaLimite } from '../fechas.ts';
import { type Contexto, type Cuenta, type Moneda } from '../tipos.ts';

// ---------------------------------------------------------------------------------------
// Saldo inicial y arqueo
// ---------------------------------------------------------------------------------------

/**
 * «saldo inicial efectivo 85000 nequi 150000 arq 2 usd monedas 12000 le debo sergio 54k antes del 31 de octubre
 *  le debo daniel 8 usd»
 * «arqueo efectivo 85000 nequi 150000 monedas 12000»
 */
export function declaraciones(tipo: 'apertura' | 'ajuste', original: string, t0: string, ctx: Contexto): Resultado {
  const corte = t0.search(/\b(le debo|debo|me debe|me deben)\b/);
  const cabeza = corte >= 0 ? t0.slice(0, corte) : t0;
  const cola = corte >= 0 ? t0.slice(corte) : '';
  const f = hallarFecha(cabeza, ctx.ahora);
  const t = f.resto.replace(/^(apertura|saldo inicial|saldos iniciales|arqueo|cuadre|cuadrar)\b/, ' ').replace(/\s+/g, ' ').trim();

  const cuentas = hallarCuentas(t, ctx);
  const montos = hallarMontos(t);
  const usados = new Set<number>();
  const declarados: NonNullable<Propuesta['declarados']> = [];
  let negativo = false;
  cuentas.forEach((c, i) => {
    const limite = cuentas[i + 1]?.inicio ?? t.length;
    let k = montos.findIndex((m, idx) => !usados.has(idx) && m.inicio >= c.fin && m.inicio < limite);
    if (k < 0) k = montos.findIndex((m, idx) => !usados.has(idx) && m.fin <= c.inicio);
    if (k < 0) return;
    usados.add(k);
    const m = montos[k];
    if (m.negativo) negativo = true;
    const moneda: Moneda = c.id === 'arq' ? 'USD' : 'COP';
    declarados.push({ cuentaId: c.id, monto: aMinor(m.valor, moneda), moneda });
  });

  const deudasIniciales: NonNullable<Propuesta['deudasIniciales']> = [];
  const b = prepararBase(original, t0, ctx);
  if (cola) {
    for (const clausula of cola.split(/(?=\b(?:le debo|debo|me debe|me deben)\b)/)) {
      const c = clausula.trim();
      if (!c) continue;
      const direccion = /^(me debe|me deben)/.test(c) ? 'me_deben' : 'debo';
      const fl = hallarFechaLimite(c, ctx.ahora);
      const ms = hallarMontos(fl.resto).filter(m => m.explicito || m.moneda === 'USD');
      if (!ms.length) continue;
      const m = ms[0];
      const motivoIdx = fl.resto.search(/\b(por|para)\b/);
      const nombreTxt = borrarTramos(motivoIdx >= 0 ? fl.resto.slice(0, motivoIdx) : fl.resto, tramosDe(ms));
      const nombre = nombreEn(
        nombreTxt.split(' ').filter(w => w && !['le', 'debo', 'me', 'debe', 'deben', 'a'].includes(w)), ctx, b,
      );
      if (!nombre) continue;
      const moneda: Moneda = m.moneda ?? 'COP';
      deudasIniciales.push({
        nombre: nombre.escrito, monto: aMinor(m.valor, moneda), moneda, direccion,
        fechaLimite: fl.fecha ?? undefined,
        motivo: motivoIdx >= 0 ? conOriginales(recortarBordes(fl.resto.slice(motivoIdx).split(' ').filter(Boolean)), b) || undefined : undefined,
      });
    }
  }

  if (negativo) return error('Los saldos no pueden ser negativos. Si debes plata, anótala como deuda: «le debo 54k a sergio».');
  if (f.invalida) return error('Esa fecha no existe. Revísala (por ejemplo «el 15/10» o «ayer»).');
  if (!declarados.length && !deudasIniciales.length) {
    return error(tipo === 'apertura'
      ? `Dime cuánta plata tienes. Ejemplo: «saldo inicial ${ejemploDeSaldos(ctx)}».`
      : `Dime cuánta plata tienes ahora. Ejemplo: «arqueo ${ejemploDeSaldos(ctx)}».`);
  }
  const p = propuestaBase(b, tipo, tipo === 'apertura' ? 'Saldo inicial' : 'Arqueo', 0, 'COP');
  p.ocurridoEn = f.fecha;
  p.declarados = declarados;
  p.deudasIniciales = deudasIniciales;
  return { clase: 'movimiento', propuesta: p };
}

