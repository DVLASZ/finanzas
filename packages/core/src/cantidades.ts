/**
 * Cantidades por precio: «3 polas a 4500 cada una» es un gasto de 13.500, no de 4.500. Corre antes de buscar montos y deja
 * la frase con el total, para que el resto del intérprete la lea como cualquier otra.
 *
 * Solo multiplica cuando la frase lo dice: «a», «de a» o «por ... cada una» justo después de «N cosas». Las cifras que no son
 * plata no entran: la fecha «25/11» (va pegada a la barra), «500 megas» o «cuota 2 de 12» (no tienen la forma «N cosas a P»).
 * «2 empanadas 4500 c/u», sin «a», ya lo resuelve lenguaje.ts.
 */
import { valorDeMonto } from './lenguaje.ts';
import { numerosDeDinero } from './voz.ts';

const L = 'A-Za-zÁÉÍÓÚÑÜáéíóúñü';
const PALABRAS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
const CANT = String.raw`\d{1,2}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce`;
const PRECIO = String.raw`\d[\d.,]*(?:\s?(?:k|mil|lucas?|lukas?|barras?))?(?![${L}\d])`;
const CADA = String.raw`c\/u|c\.u\.?|cada\s+un[oa]|cada\s+u|cada`;
const POR_UNIDAD = String.raw`(?:el|la|por)\s+(?:kilo|libra|hora|unidad|litro|metro|paquete|caja|botella|dia|noche|mes|persona)`;
// palabras que dicen que la «cosa» es plata o moneda: «cambié 20 dólares a 4100» es una tasa, no 20 cosas
const NO_COSA = /\b(?:usd|dolar(?:es)?|dlls?|us|pesos?|k|mil|lucas?|lukas?|barras?|palos?|millon(?:es)?)\b/i;

const cantidad = (s: string): number => PALABRAS[s.toLowerCase()] ?? Number(s);
const precio = (s: string): number => valorDeMonto(s);

/** «N cosas a P (cada una)»: el grupo con su total. */
const GRUPO = new RegExp(
  String.raw`(^|\s)(${CANT})\s+([${L}]+(?:\s+[${L}]+){0,4}?)\s+(de\s+a|a|por)\s+(${PRECIO})(?:\s+(${CADA}|${POR_UNIDAD}))?(?![${L}\d])`,
  'gi',
);
/** «... y otras 3 por 2 lucas cada una»: más cosas de la misma compra, que se suman al monto anterior. */
const OTRAS = new RegExp(
  String.raw`(\d[\d.,]*(?:\s?(?:k|mil|lucas?|lukas?|barras?))?)\s+y\s+otr[oa]s\s+(${CANT})(?:\s+[${L}]+)?\s+(?:de\s+a|a|por)\s+(${PRECIO})(?:\s+(?:${CADA}))?(?![${L}\d])`,
  'i',
);
/** «pero una me la regalaron»: esas no se pagaron. */
const REGALO = new RegExp(String.raw`\s*(?:,|\bpero\b|\by\b)?\s*(${CANT})\s+(?:me\s+)?(?:la|las|lo|los)?\s*regal\w*(?![${L}])`, 'i');

/** Reescribe las cantidades por precio de un mensaje con su total. Devuelve el mismo texto si no hay ninguna. */
export function expandirCantidades(texto: string): string {
  // las compras por líneas, las ventas y la alcancía ya leen sus cantidades a su manera
  if (texto.length > 400 || /^\s*compras?\s*:?\s/i.test(texto) || /\b(?:vend|alcanc|met[ií]\b)/i.test(texto)) return texto;
  // «2 millones y medio» es 2.500.000 (numerosDeDinero lo hace con «dos millones y medio», no con la cifra)
  const conMedio = texto.replace(/(?<![\d.,])(\d{1,3})\s+mill[oó]n(?:es)?\s+y\s+medio(?![\p{L}])/giu, (_m, n) => String(Number(n) * 1_000_000 + 500_000));
  const base = numerosDeDinero(conMedio);
  let t = base;

  // «recarga de 500 megas por 6000»: los datos y minutos del plan no son plata; queda la palabra sin la cifra
  t = t.replace(new RegExp(String.raw`(^|\s)\d+\s?(megas?|gigas?|gb|mb|minutos)(?![${L}\d])`, 'gi'), '$1$2');

  // «un billete de 20»: los billetes se nombran en miles
  t = t.replace(new RegExp(String.raw`(^|\s)(${CANT})\s+(billetes?)\s+de\s+(\d{1,3})(\s*mil)?(?![\d.,${L}])`, 'gi'), (_m, ini, q, b, p, mil) => {
    const n = cantidad(q);
    const valor = Number(p) * (Number(p) < 1000 || mil ? 1000 : 1) * n;
    return n === 1 ? `${ini}${q} ${b} de ${valor}` : `${ini}${b} por ${valor}`;
  });

  // «cinco monedas de mil»: la plata está en Monedas
  t = t.replace(new RegExp(String.raw`(^|\s)(${CANT})\s+monedas\s+de\s+(\d{2,4})(?![\d.,${L}])`, 'gi'), (_m, ini, q, p) => `${ini}${cantidad(q) * Number(p)} en monedas`);

  // «compre 2 cositas 5 mil y otras 3 por 2 lucas cada una»: 5.000 más 3 × 2.000
  t = t.replace(OTRAS, (_m, antes, q, p) => String(precio(antes) + cantidad(q) * precio(p)));

  t = t.replace(GRUPO, (todo, ini, q, cosas, marca, p, sufijo) => {
    const n = cantidad(q);
    const unitario = precio(p);
    if (!(n >= 1) || !(unitario > 0) || NO_COSA.test(cosas)) return todo;
    // «3 cosas por 6000» es el total; «por» solo multiplica con «cada una»
    if (/^por$/i.test(marca) && !sufijo) return todo;
    return `${ini}${q} ${cosas} ${n * unitario}`;
  });

  // «pero una me la regalaron»: se resta del grupo anterior
  const reg = REGALO.exec(t);
  if (reg && t !== base) {
    const antes = t.slice(0, reg.index);
    const grupo = new RegExp(String.raw`(^|\s)(${CANT})\s+([${L}]+(?:\s+[${L}]+){0,4}?)\s+(\d+)\s*$`, 'i').exec(antes);
    if (grupo) {
      const n = cantidad(grupo[2]);
      const regaladas = cantidad(reg[1]);
      if (regaladas < n) {
        const total = (Number(grupo[4]) / n) * (n - regaladas);
        t = `${antes.slice(0, grupo.index)}${grupo[1]}${grupo[2]} ${grupo[3]} ${total}${t.slice(reg.index + reg[0].length)}`;
      }
    }
  }
  return t === base ? conMedio : t.replace(/\s+/g, ' ').trim();
}
