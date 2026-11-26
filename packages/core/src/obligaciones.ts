/**
 * Pagos que todavía no se hacen y plata que todavía no llega: «para el próximo lunes tengo que pagar 95k»,
 * «la tarjeta vence el 28 y debo 450k», «el 20 tenía que pagar el arriendo pero todavía no he pagado»,
 * «el próximo viernes me consignan 1 millón». Nada de eso movió plata: no se anota ni se toca el saldo.
 * Si se sabe el día, se ofrece dejarlo como pago fijo (así el bot lo recuerda cada mes, ver recurrentes.ts).
 */
import type { Resultado } from './parser/tipos.ts';
import { limpiar } from './texto.ts';

const MONTO = /\d[\d.]*(?:\s?(?:k|mil|lucas?|barras?|millon(?:es)?)\b)?|\b(?:un|una) (?:millon|palo)\b/;
const FUTURO = /\b(?:proxim[oa]|siguiente|que viene|el otro mes|la otra semana)\b/;
const DEBE_PAGAR = /\b(?:tengo|tenemos|toca|hay|voy|vamos) (?:que |a )?pagar\b|\b(?:se )?vence\b/;
const PENDIENTE = /\btenia (?:que|q) pagar\b.*\b(?:todavia|aun|no) (?:no )?(?:lo |la )?(?:he|hemos) pagado\b/;
const LLEGA = /\bme (?:consignan|pagan|depositan|transfieren|llegan?|dan|giran|mandan)\b/;
// palabras que no son el concepto del pago
const SOBRA = /^(?:el|la|los|las|lo|de|del|y|pero|para|que|q|tengo|tenemos|toca|hay|voy|vamos|a|pagar|debo|debia|vence|se|mi|mis|todavia|aun|no|he|hemos|pagado|tenia|proximo|proxima|siguiente|otro|otra|mes|semana|viene|lunes|martes|miercoles|jueves|viernes|sabado|domingo|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|k|mil|lucas?|pesos?|un|una|millon|palo)$/;

export function obligacion(texto: string): Resultado | null {
  const t = limpiar(texto);
  if (/[?¿]/.test(texto)) return null;
  const pendiente = PENDIENTE.test(t);
  const futuro = pendiente || DEBE_PAGAR.test(t);
  const ingreso = !futuro && FUTURO.test(t) && LLEGA.test(t);
  if (!futuro && !ingreso) return null;
  // el día («el 20», «el 10 de diciembre») no es el monto
  const diaM = t.match(/\bel (\d{1,2})\b(?![.,]?\d)(?!\s?(?:k|mil|lucas?)\b)/);
  const sinDia = diaM ? t.replace(diaM[0], ' ') : t;
  const monto = sinDia.match(MONTO)?.[0];
  if (!monto) return null;
  if (ingreso) {
    return { clase: 'pregunta', mensaje: 'Esa plata todavía no te llega, así que no anoté nada. Cuando llegue, escribe por ejemplo «me consignaron 1 millón».', opciones: [] };
  }
  const concepto = sinDia.replace(monto, ' ').split(/\s+/).filter(w => w && !SOBRA.test(w) && !/^\d+$/.test(w)).join(' ');
  const que = concepto || 'el pago';
  const cuando = pendiente ? 'Ese pago sigue pendiente' : 'Ese pago todavía no lo has hecho';
  const dia = diaM ? Number(diaM[1]) : 0;
  const fijo = `cada mes el ${dia} ${concepto || 'pago'} ${monto}`;
  const mensaje = `${cuando}, así que no anoté nada ni toqué tu saldo. Cuando lo pagues, escribe por ejemplo «pagué ${monto} ${que}». `
    + (dia >= 1 && dia <= 28
      ? `¿Quieres que te lo recuerde cada mes como pago fijo?`
      : `¿Es un pago de cada mes? Escribe «cada mes el 5 ${concepto || 'arriendo'} ${monto}» con su día y te lo recuerdo.`);
  return { clase: 'pregunta', mensaje, opciones: dia >= 1 && dia <= 28 ? [{ titulo: `Pago fijo el ${dia}`, frase: fijo }] : [] };
}
