/**
 * Ayuda de la IA para frases que las reglas no entienden.
 *
 * La IA no guarda nada ni decide nada. Solo reescribe lo que la persona escribió en frases cortas
 * que el intérprete de siempre sí entiende. Esas frases pasan por el intérprete y por la tarjeta
 * de confirmación como cualquier mensaje, así que lo que la IA se equivoque se ve antes de guardar.
 */
import { ejemploDeCuenta, ejemploDeSaldos, vendeProductos } from './entidades.ts';
import type { Datos } from './repo.ts';

/** Cuántas frases como máximo puede devolver la IA por mensaje. */
export const MAX_FRASES_IA = 5;

/** Esquema de la respuesta que se le pide al modelo. */
export const ESQUEMA_IA = {
  type: 'object',
  properties: { frases: { type: 'array', items: { type: 'string' }, maxItems: MAX_FRASES_IA } },
  required: ['frases'],
};

/** Las instrucciones para el modelo, con las cuentas y categorías de esta instalación. */
export function instruccionesIA(datos: Pick<Datos, 'cuentas' | 'config'>): string {
  const nombres = (tipo: string) => datos.cuentas.filter(c => c.tipo === tipo).map(c => c.nombre);
  const otra = ejemploDeCuenta(datos);
  const l = [
    'Eres el traductor de una app de finanzas personales. La persona escribe como habla y tú lo conviertes en frases cortas que la app entiende.',
    'Respondes solo con JSON: {"frases": ["...", "..."]}. Una frase por cada movimiento de plata, máximo ' + MAX_FRASES_IA + '.',
    'Si lo escrito no habla de plata o no se entiende, responde {"frases": []}. No inventes montos, nombres ni cuentas.',
    '',
    'Formas que la app entiende (sustituye los datos por los de la persona):',
    '- Gasto: "almuerzo 12000", "mecato 5000 ' + otra + '", "taxi de terminal a casa 8000"',
    '- Ingreso: "ingreso 50000 trabajo"',
    '- Prestó plata: "presté 40000 a Ana". Le prestaron: "le debo 54000 a Pedro por la bici"',
    '- Pagó una deuda: "pagué 54000 a Pedro". Le pagaron: "Ana me pagó 40000"',
    '- Pasar plata entre cuentas: "cambio 50000 efectivo a ' + otra + '"',
    '- Regalo: "le regalé 50000 a Jorge"',
    '- Gasto repartido: "almuerzo 25000 pagué por marta 20000" (el gasto total y la parte de Marta) o "pizza 9000 entre ana, luis y yo". Todo el gasto va en UNA sola frase: "almuerzo 25000 pagué 20000 por marta" NO son dos movimientos, y "pagué 20000 por marta" dentro de un gasto no es pagar una deuda.',
    '- Gasto igual entre varios: "pizza 9000 entre ana, luis y yo" (el monto es el total que se pagó). "Hicimos vaca", "a medias", "por los 3" son reparto en partes iguales.',
    '- Jerga: "me fiaron 20k donde Rosa" y "quedé debiendo 15k a Pedro" son "le debo 20000 a Rosa" y "le debo 15000 a Pedro"; "me giraron/consignaron/soltaron 80k" es un ingreso; "Luis me debe 20k" es "presté 20000 a Luis"; "saqué 100k del cajero" es "cambio 100000 ' + otra + ' a efectivo"; "pasé de ' + otra + ' a efectivo 50k" es "cambio 50000 ' + otra + ' a efectivo".',
    '- Si no sabes entre cuántos se repartió o qué cuenta es, no inventes: responde {"frases": []}.',
  ];
  if (vendeProductos(datos)) l.push('- Venta: "vendí 3 botellas de jugo", "15 galletas a granel a Marta"');
  l.push(
    '',
    'Escribe los montos como número completo sin puntos ni símbolos ("cincuenta mil" es 50000, "5 lukas" es 5000, "dos millones" es 2000000).',
    'Las cuentas de esta app son: ' + nombres('dinero').join(', ') + '.',
    'Las categorías son: ' + nombres('categoria').filter(n => n !== 'Descuadre').join(', ') + '.',
    'Ejemplo de saldo inicial: "saldo inicial ' + ejemploDeSaldos(datos) + '".',
  );
  return l.join('\n');
}

/**
 * Lo que devolvió el modelo, ya limpio: una lista de frases cortas, sin saltos de línea.
 * Acepta el objeto o el texto JSON; cualquier otra cosa da una lista vacía.
 */
export function frasesDeRespuesta(bruta: unknown): string[] {
  let obj: unknown = bruta;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return []; }
  }
  const lista = (obj as { frases?: unknown } | null)?.frases;
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((x): x is string => typeof x === 'string')
    .map(x => x.replace(/\s+/g, ' ').trim())
    .filter(x => x.length > 0 && x.length <= 160)
    .slice(0, MAX_FRASES_IA);
}

/** Cuántas veces al día se puede pedir ayuda a la IA (sin pasarse del plan gratuito). */
export const TOPE_IA_POR_DIA = 30;

/**
 * Cuenta de usos del día. El valor guardado es "AAAA-MM-DD:n". Devuelve el nuevo valor o null si ya
 * se llegó al tope.
 */
export function usoDeIA(guardado: string | undefined, hoy: string, tope: number): string | null {
  const [dia, n] = (guardado ?? '').split(':');
  const usados = dia === hoy ? Number(n) || 0 : 0;
  return usados >= tope ? null : `${hoy}:${usados + 1}`;
}
