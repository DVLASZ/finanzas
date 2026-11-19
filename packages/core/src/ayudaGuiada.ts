/**
 * «Pregúntale cómo decirlo»: la persona escribe su duda con sus palabras («cómo anoto que presté plata») y recibe el ejemplo exacto,
 * con las cuentas de su app, listo para usar. Sin red y sin IA: son reglas por tema, así que responde al instante y sin internet.
 */
import { ejemploDeCuenta } from './entidades.ts';
import { limpiar } from './texto.ts';
import type { Contexto } from './tipos.ts';

export interface RespuestaDeAyuda { tema: string; explicacion: string; ejemplo: string }

type Ctx = Pick<Contexto, 'cuentas' | 'config'>;

const TEMAS: { tema: string; re: RegExp; hacer: (otra: string) => Omit<RespuestaDeAyuda, 'tema'> }[] = [
  { tema: 'Compartido', re: /compart|dividi|vaca|entre (?:varios|amigos|todos)|mitad|medias|partes iguales|cuenta de (?:todos|amigos)|con (?:amigos|mis amigos)|\bentre\b/,
    hacer: () => ({ explicacion: 'Pon el total que se pagó y con quién. Yo calculo tu parte y lo que te deben los demás.', ejemplo: 'pizza 40000 entre ana, luis y yo' }) },
  { tema: 'Préstamo', re: /prest[eé]|me deben|me debe|le fi[eé]|fiar a/,
    hacer: () => ({ explicacion: 'Anota a quién le prestaste. Cuando te pague, escribe «Ana me pagó 40000».', ejemplo: 'presté 40000 a Ana' }) },
  { tema: 'Deuda', re: /\bdebo\b|me fi(?:aron|an)|fiado|deuda|me prestaron|quede debiendo|le debia/,
    hacer: () => ({ explicacion: 'Anota a quién le debes y por qué. Para pagarle después: «pagué 54000 a Pedro».', ejemplo: 'le debo 54000 a Pedro por la bici' }) },
  { tema: 'Cajero', re: /cajero|retir|saque|sacar plata|sacar efectivo/,
    hacer: otra => ({ explicacion: 'Sacar del cajero es pasar plata de una cuenta a efectivo.', ejemplo: `cambio 100000 ${otra} a efectivo` }) },
  { tema: 'Pasar plata', re: /pasar plata|pase de|transfer|mover plata|cambio de cuenta|de una cuenta a otra|entre cuentas|consignar|meter plata/,
    hacer: otra => ({ explicacion: 'Pasar plata de una cuenta a otra no es gasto: solo cambia dónde está.', ejemplo: `cambio 50000 efectivo a ${otra}` }) },
  { tema: 'Ingreso', re: /ingreso|me pagaron|me giraron|me consignaron|me llego|sueldo|quincena|salario|recib[ií]|me cayo|me depositaron/,
    hacer: otra => ({ explicacion: 'Un ingreso lleva el monto, de qué es y, si quieres, la cuenta donde cayó.', ejemplo: `ingreso 50000 trabajo ${otra}` }) },
  { tema: 'Meta', re: /\bmeta|ahorr|alcancia|apartar|guardar plata/,
    hacer: () => ({ explicacion: 'Crea la meta con su total y después aparta de a poco.', ejemplo: 'meta moto 2000000' }) },
  { tema: 'Pago fijo', re: /cada mes|cada quincena|fijo|suscripcion|se repite|recurrente|mensual|arriendo|internet/,
    hacer: () => ({ explicacion: 'Un pago que se repite te avisa cuando toca y queda como botón en el chat.', ejemplo: 'cada mes el 5 internet 60000' }) },
  { tema: 'Corregir', re: /deshacer|me equivoque|equivoc|corregir|cambiar el monto|anular|borrar|quitar|me confundi/,
    hacer: () => ({ explicacion: 'Nada se borra: lo que deshaces queda marcado como anulado.', ejemplo: 'deshacer' }) },
  { tema: 'Otro día', re: /ayer|anteayer|antier|otro dia|fecha|el lunes|hace \d+ dias/,
    hacer: () => ({ explicacion: 'Agrega cuándo fue al final de la frase.', ejemplo: 'almuerzo 12000 ayer' }) },
  { tema: 'Saldos', re: /saldo|cuanto tengo|cuanto llevo|como voy|resumen|cuanto gaste/,
    hacer: () => ({ explicacion: 'Estas palabras sueltas se contestan al instante.', ejemplo: 'saldo' }) },
  { tema: 'Gasto', re: /gast|compr|pagu[eé]|almuerzo|comida|mecato|taxi|bus|anotar|registrar/,
    hacer: otra => ({ explicacion: 'Un gasto es lo que compraste y cuánto. Si dices con qué pagaste, lo uso; si no, es efectivo.', ejemplo: `almuerzo 12000 ${otra}` }) },
];

/** Devuelve el ejemplo que responde a la duda, o null si no se reconoce de qué habla. */
export function ayudaGuiada(duda: string, ctx: Ctx): RespuestaDeAyuda | null {
  const d = limpiar(duda);
  if (!d || d.length < 3) return null;
  const otra = ejemploDeCuenta(ctx);
  const hallado = TEMAS.find(t => t.re.test(d));
  return hallado ? { tema: hallado.tema, ...hallado.hacer(otra) } : null;
}
