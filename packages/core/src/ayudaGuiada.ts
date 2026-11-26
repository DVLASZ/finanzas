/**
 * «Pregúntale cómo decirlo»: la persona escribe su duda con sus palabras («cómo anoto que presté plata») y recibe el ejemplo
 * exacto, con las cuentas de su app, listo para usar. Sin red y sin IA: cada tema es un dato (palabras y frases clave), la duda
 * se reduce a raíces y gana el tema con más coincidencias. Responde al instante y sin internet.
 */
import { ejemploDeCuenta } from './entidades.ts';
import { limpiar } from './texto.ts';
import type { Contexto } from './tipos.ts';

export interface RespuestaDeAyuda { id: string; tema: string; explicacion: string; ejemplos: string[] }

type Ctx = Pick<Contexto, 'cuentas' | 'config'>;

/** `palabras` son raíces (hasta 5 letras, la duda se corta igual); `frases` valen doble. `{cuenta}` se cambia por una cuenta real. */
export interface TemaDeAyuda { id: string; tema: string; palabras: string[]; frases?: string[]; explicacion: string; ejemplos: string[] }

/** El orden desempata: si dos temas puntúan igual, sale primero el que está antes. */
export const TEMAS_AYUDA: TemaDeAyuda[] = [
  { id: 'compartido', tema: 'Compartido', palabras: ['compa', 'divid', 'vaca', 'amigo', 'mitad', 'medias', 'parte', 'igual', 'entre'],
    frases: ['entre varios', 'entre amigos', 'entre todos', 'cuenta de todos', 'partes iguales'],
    explicacion: 'Pon el total que se pagó y con quién. Yo calculo tu parte y lo que te deben los demás.',
    ejemplos: ['pizza 40000 entre ana, luis y yo'] },
  { id: 'prestamo', tema: 'Préstamo', palabras: ['prest', 'deben'], frases: ['me deben', 'me debe', 'le fie', 'fiar a'],
    explicacion: 'Anota a quién le prestaste. Cuando te pague, escribe «Ana me pagó 40000».',
    ejemplos: ['presté 40000 a Ana', 'Ana me pagó 40000'] },
  { id: 'deuda', tema: 'Deuda', palabras: ['debo', 'deuda', 'fiado', 'fiaro', 'debie', 'debia'], frases: ['me fiaron', 'me prestaron', 'le debo', 'quede debiendo'],
    explicacion: 'Anota a quién le debes y por qué. Para pagarle después: «pagué 54000 a Pedro».',
    ejemplos: ['le debo 54000 a Pedro por la bici', 'pagué 54000 a Pedro', 'deudas'] },
  { id: 'abono', tema: 'Abono parcial', palabras: ['abon', 'parci', 'cuota', 'pagu'], frases: ['le pague', 'me pago', 'pago parcial', 'una parte', 'de a poco', 'poco a poco'],
    explicacion: 'Pagar una parte de una deuda o cobrar solo una parte de un préstamo es un abono. La deuda baja y lo que falta queda anotado.',
    ejemplos: ['le pagué 20000 a Pedro', 'Ana me pagó 10000'] },
  { id: 'cajero', tema: 'Cajero', palabras: ['cajer', 'retir', 'saque', 'sacar', 'saco'], frases: ['sacar plata', 'saque plata', 'sacar efectivo'],
    explicacion: 'Sacar del cajero es pasar plata de una cuenta a efectivo.',
    ejemplos: ['cambio 100000 {cuenta} a efectivo'] },
  { id: 'pasar', tema: 'Pasar plata', palabras: ['pasar', 'paso', 'trans', 'mover', 'consi', 'meter'], frases: ['pasar plata', 'paso plata', 'pase de', 'mover plata', 'cambio de cuenta', 'de una cuenta a otra', 'entre cuentas', 'entre mis cuentas', 'meter plata'],
    explicacion: 'Pasar plata de una cuenta a otra no es gasto: solo cambia dónde está.',
    ejemplos: ['cambio 50000 efectivo a {cuenta}'] },
  { id: 'ingreso', tema: 'Ingreso', palabras: ['ingre', 'sueld', 'quinc', 'salar', 'llego', 'giraro', 'cayo', 'depos', 'entra', 'nomin', 'honor', 'chamb', 'traba', 'activ'],
    frases: ['me pagaron', 'me giraron', 'me consignaron', 'me llego', 'me cayo', 'me depositaron', 'recibi', 'me ingresa', 'me entra', 'me paguen', 'me pagan', 'me van a pagar', 'me hicieron un pago', 'me hicieron una transferencia', 'me transfirieron', 'me dieron plata', 'me regalaron', 'pago de una actividad', 'pago por un trabajo', 'plata que entra', 'plata que me entra', 'plata que recibo', 'recibo plata', 'me llega plata', 'por un trabajo', 'por una actividad', 'por mi trabajo', 'que me hicieron', 'me pago', 'me entro', 'me ingreso', 'me entraron', 'me ingresaron', 'me llegaron', 'meto plata'],
    explicacion: 'Un ingreso lleva el monto, de qué es y, si quieres, la cuenta donde cayó.',
    ejemplos: ['ingreso 50000 actividad', 'me pagaron 80k congreso {cuenta}', 'ingreso 50000 trabajo {cuenta}'] },
  { id: 'meta', tema: 'Meta', palabras: ['meta', 'ahorr', 'alcan', 'apart'], frases: ['guardar plata'],
    explicacion: 'Crea la meta con su total y después aparta de a poco.',
    ejemplos: ['meta moto 2000000', 'ahorré 50000 para moto'] },
  { id: 'fijo', tema: 'Pago fijo', palabras: ['fijo', 'recur', 'suscr', 'repit', 'mensu', 'arrie', 'inter'], frases: ['cada mes', 'cada quincena', 'se repite'],
    explicacion: 'Un pago que se repite te avisa cuando toca y queda como botón en el chat.',
    ejemplos: ['cada mes el 5 internet 60000'] },
  { id: 'pausar', tema: 'Pausar o cancelar un pago fijo', palabras: ['paus', 'cance', 'termi', 'fin', 'reanu', 'suscr', 'fijo', 'arrie', 'inter', 'netfl'],
    explicacion: 'Pausa un pago fijo para que deje de avisar, reanúdalo cuando vuelva, ponle fecha de fin o quítalo del todo. Lo ya pagado no se toca.',
    ejemplos: ['pausar recurrente claude', 'reanudar recurrente claude', 'fin recurrente claude 21/12/2026', 'quitar recurrente claude'] },
  { id: 'personas', tema: 'Personas', palabras: ['perso', 'nombr', 'conta', 'renom', 'herma', 'famil', 'primo', 'prima', 'abuel', 'novio', 'novia', 'sobri'],
    frases: ['anotar a', 'agregar a mi', 'registrar a mi', 'una persona', 'nueva persona', 'agregar persona', 'a una persona', 'registrar a', 'borrar una persona', 'borro una persona', 'elimino una persona', 'eliminar una persona', 'quitar una persona', 'quito una persona'],
    explicacion: 'Una persona es alguien a quien le prestas, le debes o con quien compartes. Agrégala con su nombre, cámbiale el nombre cuando quieras, y si escribes solo su nombre ves cómo van las cuentas con ella.',
    ejemplos: ['agregar persona Sofia', 'nueva persona Laura', 'registrar a Sofia', 'renombrar persona Sofia a Sofi', 'Sofia'] },
  { id: 'etiquetas', tema: 'Etiquetas y subcategorías', palabras: ['#', 'hasht', 'etiqu', 'subca', 'agrup'], frases: ['tag'],
    explicacion: 'Con # juntas varios gastos de un mismo plan (un cumpleaños, un viaje) y después ves cuánto costó todo. Una subcategoría parte una categoría en pedazos más finos.',
    ejemplos: ['almuerzo 12000 #cumple-ana', 'subcategoria restaurante de comida'] },
  { id: 'comprobantes', tema: 'Comprobantes', palabras: ['recib', 'foto', 'escan', 'adjun', 'image', 'subir'],
    explicacion: 'Para guardar el comprobante de un movimiento, ábrelo en Movimientos y toca Tomar foto o Subir imagen: la foto se reduce y queda guardada en el servidor. Y el botón del escáner del chat lee un comprobante con IA y deja el gasto listo para anotar.',
    ejemplos: ['mecato 4500'] },
  { id: 'topes', tema: 'Topes', palabras: ['tope', 'limit', 'presu'],
    explicacion: 'Un tope es lo máximo que quieres gastar en una categoría. Te aviso cuando te acercas. Para quitarlo, dilo igual.',
    ejemplos: ['tope mecato 100000', 'quitar tope mecato'] },
  { id: 'corregir', tema: 'Corregir o eliminar', palabras: ['deshac', 'equivo', 'corre', 'anula', 'borr', 'confu', 'edit', 'cambi', 'categ', 'elimi', 'anul', 'quita'],
    frases: ['me equivoque', 'puse mal', 'quitar un gasto', 'quito un gasto', 'quitar un movimiento', 'cambiar el monto', 'cambiar la categoria', 'cambio la categoria', 'me confundi', 'editar un gasto', 'edito un gasto', 'editar un movimiento', 'edito un movimiento', 'cambiar un gasto', 'cambio un gasto', 'borrar un gasto', 'borro un gasto', 'borrar un movimiento', 'borro un movimiento', 'corregir un gasto', 'corrijo un gasto'],
    explicacion: 'Nada se borra: lo que deshaces queda marcado como anulado. Para cambiar el monto o la categoría de lo último, edítalo.',
    ejemplos: ['deshacer', 'editar último'] },
  { id: 'otrodia', tema: 'Otro día', palabras: ['ayer', 'antie', 'fecha', 'lunes', 'dias'], frases: ['anteayer', 'otro dia'],
    explicacion: 'Agrega cuándo fue al final de la frase.',
    ejemplos: ['almuerzo 12000 ayer'] },
  { id: 'saldos', tema: 'Saldos', palabras: ['saldo', 'resum', 'total'], frases: ['cuanto tengo', 'cuanto llevo', 'como voy', 'cuanto gaste', 'cuanto he gastado', 'total del mes', 'total de gastos', 'gastos del mes', 'resumen del mes', 'cuanto me queda', 'cuanto debo en total'],
    explicacion: 'Estas palabras sueltas se contestan al instante.',
    ejemplos: ['saldo', 'semana'] },
  { id: 'gasto', tema: 'Gasto', palabras: ['gasto', 'gaste', 'compr', 'almue', 'comid', 'mecat', 'taxi', 'bus', 'pague'], frases: ['un gasto', 'mi gasto'],
    explicacion: 'Un gasto es lo que compraste y cuánto. Si dices con qué pagaste, lo uso; si no, es efectivo.',
    ejemplos: ['almuerzo 12000', 'almuerzo 12000 {cuenta}', 'café 4k'] },
  { id: 'acerca', tema: 'Para qué sirve', palabras: ['sirv', 'funcion', 'app', 'aplic', 'hace', 'empez', 'comen', 'inici', 'primer'],
    frases: ['para que sirve', 'que puedo hacer', 'que puedo escribir', 'que hace', 'como funciona', 'como empiezo', 'por donde empiezo'],
    explicacion: 'Es tu cuaderno de plata. Me escribes lo que gastas o lo que te llega, como hablas, y yo lo anoto. Después ves cuánto tienes, quién te debe y en qué se va la plata.',
    ejemplos: ['almuerzo 12000', 'me pagaron 500k de nómina', 'saldo'] }
];

const VACIAS = new Set([
  'como', 'hago', 'puedo', 'quiero', 'un', 'una', 'el', 'la', 'los', 'las', 'de', 'del', 'que', 'para', 'mi', 'mis', 'se', 'lo', 'y', 'o', 'me', 'al',
  'en', 'es', 'por', 'con', 'a', 'ya', 'si', 'no', 'uso', 'usar', 'pongo', 'poner', 'hacer', 'hace', 'plata', 'dinero', 'lana', 'anoto', 'anotar',
  'cuando', 'donde', 'cual', 'esto', 'esta', 'voy',
]);

/** Palabras distintas que significan lo mismo, para no depender de cómo las escriba la persona. */
const SINONIMOS: Record<string, string> = {
  // «comprobante» y «compré» empiezan igual: se llevan a «recib» para no confundir el tema de comprobantes con el de gastos
  comprobante: 'recib', comprobantes: 'recib', factura: 'recib', facturas: 'recib', boleta: 'recib', fotografia: 'foto',
};

function raiz(palabra: string): string {
  if (palabra.startsWith('#')) return '#';
  return SINONIMOS[palabra] ?? palabra.slice(0, 5);
}

/** La raíz de la duda coincide con la del tema si es igual, o si empieza por ella (raíz de 4 letras o más: «pagu» cubre «pague»). */
const coincide = (deLaDuda: string, deTema: string): boolean =>
  deLaDuda === deTema || (deTema.length >= 4 && deLaDuda.startsWith(deTema));

function puntuar(t: TemaDeAyuda, d: string, raices: string[]): number {
  let p = 0;
  for (const r of new Set(t.palabras.map(raiz))) if (raices.some(x => coincide(x, r))) p += 1;
  for (const f of t.frases ?? []) if (d.includes(f)) p += 2;
  return p;
}

function armar(t: TemaDeAyuda, ctx?: Ctx): RespuestaDeAyuda {
  const cuenta = ctx ? ejemploDeCuenta(ctx) : 'nequi';
  return { id: t.id, tema: t.tema, explicacion: t.explicacion, ejemplos: t.ejemplos.map(e => e.replace('{cuenta}', cuenta)) };
}

/** Hasta 3 temas que responden a la duda, el mejor primero. Lista vacía si no se reconoce de qué habla. */
export function buscarAyuda(duda: string, ctx?: Ctx): RespuestaDeAyuda[] {
  const d = limpiar(duda);
  if (d.length < 3) return [];
  const raices = d.split(' ').filter(w => w && !VACIAS.has(w)).map(raiz);
  return TEMAS_AYUDA
    .map((t, i) => ({ t, i, p: puntuar(t, d, raices) }))
    .filter(x => x.p > 0)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .slice(0, 3)
    .map(x => armar(x.t, ctx));
}

/** La respuesta de un tema por su id (para los botones que se ofrecen cuando no hubo coincidencia). */
export function ayudaDeTema(id: string, ctx?: Ctx): RespuestaDeAyuda | null {
  const t = TEMAS_AYUDA.find(x => x.id === id);
  return t ? armar(t, ctx) : null;
}

/** Cuando nada coincide: los temas que más se parecen a lo escrito (por las primeras letras), o los más usados. */
export function temasParecidos(duda: string, cuantos = 4): { id: string; tema: string }[] {
  const palabras = limpiar(duda).split(' ').filter(w => w.length >= 3 && !VACIAS.has(w));
  const puntaje = (t: TemaDeAyuda) => palabras.reduce((s, w) => s + (t.palabras.some(r => r.length >= 3 && (w.startsWith(r.slice(0, 3)) || r.startsWith(w.slice(0, 3)))) ? 1 : 0), 0);
  const ordenados = TEMAS_AYUDA.map((t, i) => ({ t, i, p: puntaje(t) })).sort((a, b) => b.p - a.p || a.i - b.i);
  const cercanos = ordenados.filter(x => x.p > 0);
  const elegidos = cercanos.length ? cercanos : ['gasto', 'prestamo', 'ingreso', 'meta'].map(id => ({ t: TEMAS_AYUDA.find(x => x.id === id)! }));
  return elegidos.slice(0, cuantos).map(x => ({ id: x.t.id, tema: x.t.tema }));
}

/**
 * ¿Es una pregunta de uso («cómo anoto un gasto», «para qué sirve esto», «cómo pauso un pago fijo»)? Solo cuenta si no trae
 * números: con un monto es un movimiento. El bot la usa antes de decir «me falta el monto».
 */
export function esPreguntaDeAyuda(texto: string): boolean {
  const d = limpiar(texto);
  if (/\d/.test(d)) return false;
  const palabras = d.split(' ').filter(Boolean);
  if (palabras.length < 2) return false;
  if (/^(como|que puedo|que se puede|se puede|puedo|para que|por que|que es|que hace|que significa|que hago|donde|cuando|cual es|explicame|explica|ayudame|ayuda con|ayuda para|necesito ayuda|no entiendo|no se como|dime como|quiero saber|quisiera saber|me ayudas|me puedes ayudar|como funciona)\b/.test(d)) return true;
  if (/\bcomo (hago|anoto|registro|agrego|pauso|borro|edito|elimino|cancelo|cambio|uso|pongo|creo|guardo|veo|saco|miro|funciona|se|paso|meto|quito|corrijo|muevo)\b/.test(d)) return true;
  // «ayuda no sé cómo borrar», «me puedes decir cómo...», «no sé cómo...» en cualquier parte
  if (/^ayuda\b|\bno se como\b|\bme (puedes|podrias) (decir|explicar|ensenar)\b|\bpuedes decirme\b/.test(d)) return true;
  // querer o necesitar hacer algo, sin monto: «quiero anotar a mi hermana», «necesito quitar un gasto»
  if (/^(?:yo )?(?:quiero|quisiera|necesito|me gustaria|tengo que|debo) (?:anotar|agregar|registrar|mirar|ver|saber|quitar|borrar|eliminar|crear|poner|pasar|cambiar|editar|corregir|sacar|guardar|mover|meter|deshacer|anular)\b/.test(d)) return true;
  return texto.includes('?') && palabras.length >= 3;
}

/**
 * Una consulta dicha con otras palabras: «quiero mirar quién me debe plata» es «deudas» y «cuánto me queda después de
 * pagar todo» es «saldo». Devuelve la palabra de la consulta o null. Solo sin números: con un monto es un movimiento.
 */
export function consultaDisfrazada(texto: string): string | null {
  const d = limpiar(texto);
  if (/\d/.test(d)) return null;
  if (/\b(?:quien(?:es)? me debe(?:n)?|cuanto me deben|a quien(?:es)? le debo|cuanto debo|quien me falta por pagar)\b/.test(d)) return 'deudas';
  if (/\b(?:cuanto me queda|cuanta plata (?:me queda|tengo)|cuanto tengo|cuanta plata hay)\b/.test(d)) return 'saldo';
  return null;
}
