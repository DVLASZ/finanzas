/** Generador de frases y toques de botón "de la peor forma posible", con semilla fija. Lo usan las pruebas de estrés. */
import type { Salida } from '../packages/core/src/index.ts';

/** Generador pseudoaleatorio con semilla (mulberry32). */
export function azar(semilla: number) {
  let a = semilla >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    r,
    n: (max: number) => Math.floor(r() * max),
    de: <T>(l: readonly T[]): T => l[Math.floor(r() * l.length)],
    si: (p = 0.5) => r() < p,
  };
}

export const MONTOS = ['5000', '5.000', '$5.000', '5k', '5 k', '5K', '5 mil', '5mil', '5 lucas', '5 lukas', '1.5k', '1,5k', '2800', '19500', '100', '50', '0', '00', '-5000', '0.5', '999999999999', '1e6', '1,000,000', '12.34.56', 'cinco mil', 'medio millón', '5 barras', '2 palos',
  '３０００', '٥٠٠٠', '5000000000000000000000', '8 usd', 'us$8', '8 dólares', '32000 = 8 usd', '$', 'k', 'mil', '.', ',', '5,5', '5..000', '5k5'];
const PALABRAS = ['mecato', 'almuerzo', 'taxi', 'pasaje', 'arriendo', 'celular', 'moto', 'reparación', 'gasolina', 'regalo', 'galletas', 'Felipe', 'Rafael', 'Ana', 'ivan', 'Daniel', 'Empresa', 'unidad', 'la', 'de', 'por', 'a', 'en', 'con', 'y', 'el', 'mamá', 'ayer', 'hoy', 'el lunes', 'hace 3 dias', '15/10', '#feria', '#', '@@', '🙂', 'ñandú', 'ÁÉÍÓÚ', '‮', 'x'.repeat(300), "'; DROP TABLE cuentas; --", '<script>alert(1)</script>', '${hola}', '{{x}}', '\\', '"', '`', '\n', '\t', '\0'];
const VERBOS = ['presté', 'le presté', 'me prestó', 'le debo', 'debo', 'me pagó', 'pagué', 'le pagué', 'le regalé', 'vendí', 'compré', 'cambio', 'saqué', 'pasé', 'transferí', 'ingreso', '+', '-', 'saldo inicial', 'arqueo', 'tope', 'quitar tope', 'deshacer', 'editar', 'editar último', 'ayuda', 'deudas', 'saldo', 'mes', 'semana', 'últimos', 'cuánto llevo en mecato'];
const CUENTAS = ['efectivo', 'monedas', 'nequi', 'daviplata', 'arq', 'bancolombia', 'transferencia', 'cooperativa', 'bogota', 'nekui', 'davi'];
const PAGOS = ['con 5k', 'con 2k y 800 en monedas', 'con 10k', 'con 100k', 'con 1', 'con', 'vuelto 200 monedas', 'vuelto 2k y 200', 'vuelto', 'me dieron 2200', 'justo', 'sin vuelto', 'vuelto 99999999', 'con 5k vuelto 5k', 'con 2k y el resto en monedas', 'de vuelto 500'];

export function frase(g: ReturnType<typeof azar>): string {
  const partes: string[] = [];
  const n = 1 + g.n(6);
  for (let i = 0; i < n; i++) {
    const k = g.n(10);
    if (k < 3) partes.push(g.de(MONTOS));
    else if (k < 6) partes.push(g.de(PALABRAS));
    else if (k < 7) partes.push(g.de(VERBOS));
    else if (k < 8) partes.push(g.de(CUENTAS));
    else partes.push(g.de(PAGOS));
  }
  let t = partes.join(g.si(0.9) ? ' ' : g.de(['', '  ', ', ', '\n', ' y ']));
  // ensuciar: mayúsculas, letras repetidas, letras perdidas, espacios al final
  if (g.si(0.15)) t = t.toUpperCase();
  if (g.si(0.15)) t = t.replace(/[aeiou]/g, c => (g.si(0.3) ? '' : c));
  if (g.si(0.1)) t = t.replace(/(.)/g, c => (g.si(0.1) ? c + c : c));
  if (g.si(0.1)) t = '   ' + t + '   ';
  return t;
}

export function botones(g: ReturnType<typeof azar>, ultima: Salida[]): string {
  const ids = ultima.flatMap(s => s.botones?.map(b => b.id) ?? []);
  if (ids.length && g.si(0.8)) return g.de(ids);
  return g.de(['ok', 'no', 'edit', 'undo:inexistente', 'edit:inexistente', 'resp:99', 'resp:0', 'pago:justo', 'pago:10000', 'pago:abc', 'pago:-5', 'xxx', '', 'undo:', 'resp:']);
}

