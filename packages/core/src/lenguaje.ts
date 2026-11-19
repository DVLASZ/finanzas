/**
 * Lenguaje natural: la capa que lleva lo que la gente dice, con sus modismos, a las formas que el intérprete conoce. Corre primero
 * y solo con reglas (sin red, al instante). Lo que reconoce con seguridad lo reescribe a la forma de siempre («comida 60000 entre
 * ana, luis y yo»); lo que puede significar dos cosas distintas lo vuelve una pregunta con botones, en vez de adivinar; y lo que no
 * toca lo deja igual, para que el intérprete y, si hace falta, la IA hagan su trabajo.
 *
 * Cubre: números en palabras y jerga de plata («sesenta mil», «quince quinientos», «lucas», «barras», «palos»); gastos compartidos
 * («fui a comer con Ana y Luis, pagué 60k por los 3», «hicimos vaca», «a medias», «50 míos y 30 de Ana»); y verbos de flujo
 * coloquiales («me giraron», «me fían», «quedé debiendo», «me tocó poner», «saqué del cajero», «pasé de Nequi a efectivo»).
 */
import { formatear, hallarMontos } from './dinero.ts';
import { cuentaDePalabra } from './entidades.ts';
import { corregirCuentasMalOidas, numerosDeDinero } from './voz.ts';
import { limpiar } from './texto.ts';
import type { Contexto } from './tipos.ts';

export interface OpcionDeReparto { titulo: string; frase: string }
export interface Aclaracion { mensaje: string; opciones: OpcionDeReparto[] }
export interface Naturalizado { texto: string; pregunta?: Aclaracion }

// ---------------------------------------------------------------- piezas

const L = 'A-Za-zÁÉÍÓÚÑÜáéíóúñü';
const MONTO = String.raw`\d[\d.,]*(?:\s?(?:k|mil|lucas?|lukas?|barras?|palos?|millon(?:es)?))?`;
const NOMBRE = String.raw`[${L}]+(?:\s+(?!(?:y|e|pagu[eé]|pago|puse|me|ayer|hoy|por|para|entre)\b)[${L}]+)?`;
const NOMBRES = String.raw`${NOMBRE}(?:\s*(?:,|\sy\s|\se\s)\s*${NOMBRE})*`;
const FECHA = /\b(hoy|ayer|anteayer|antier|anoche|el (?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)|hace \d+ d[ií]as?)\b/i;

const ARTICULOS = new Set(['mi', 'mis', 'el', 'la', 'los', 'las', 'un', 'una']);

/** «Ana, Luis y mi mamá» -> ['Ana', 'Luis', 'mamá'] */
function partirNombres(t: string): string[] {
  return t.split(/\s*,\s*|\s+y\s+|\s+e\s+/i).map(x => x.trim().split(/\s+/).filter(w => !ARTICULOS.has(limpiar(w))).join(' ')).filter(Boolean);
}

const CONCEPTOS: [RegExp, string][] = [
  [/\b(almorz\w*|almuerzo)\b/i, 'almuerzo'], [/\b(desayun\w*)\b/i, 'desayuno'], [/\b(cen[eéa]\w*|cena)\b/i, 'cena'],
  [/\b(comer|comimos|com[ií]|comida|restaurante)\b/i, 'comida'], [/\bpizza\b/i, 'pizza'], [/\bhamburguesa\w*\b/i, 'hamburguesa'],
  [/\b(cine|pel[ií]cula)\b/i, 'cine'], [/\b(trago|tragos|cerveza\w*|rumba|fiesta|bailar|discoteca)\b/i, 'salida'],
  [/\b(taxi|taxis|uber)\b/i, 'taxi'], [/\b(mercado|supermercado)\b/i, 'mercado'], [/\b(helado\w*|postre\w*)\b/i, 'postre'],
  [/\bcaf[eé]\b/i, 'cafe'], [/\b(paseo|viaje)\b/i, 'viaje'], [/\bregalo\b/i, 'regalo'], [/\b(cuenta|cuentas)\b/i, 'comida'],
];

/** La palabra que dice en qué se gastó, o «gasto» (que luego pregunta la categoría). La fecha, si la dijeron, se conserva al final. */
function conceptoDe(t: string): { concepto: string; fecha: string } {
  const f = FECHA.exec(t)?.[0] ?? '';
  const c = CONCEPTOS.find(([re]) => re.test(t));
  return { concepto: c ? c[1] : 'varios', fecha: f };
}

/** Un monto escrito con jerga a número completo: «60k», «20 mil», «30 lucas», «dos barras», «un palo». 0 si no se entiende. */
export function valorDeMonto(m: string): number {
  return hallarMontos(limpiar(m))[0]?.valor ?? 0;
}

const juntar = (nombres: string[]): string => (nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`);
const entre = (concepto: string, monto: number, nombres: string[], fecha: string): string => [concepto, monto, 'entre', `${nombres.join(', ')} y yo`, fecha].filter(Boolean).join(' ');

// ---------------------------------------------------------------- 1. plata dicha con jerga

/** «dos lucas», «sesenta mil pesos», «quince quinientos», «mil barras», «un palo»: a números. */
function jergaDeDinero(texto: string): string {
  let t = texto;
  t = t.replace(/\b(un|una)\s+(palo|luca|luka|barra)s?\b/gi, '1 $2');
  t = corregirCuentasMalOidas(numerosDeDinero(t));
  // «15 quinientos» ya llegó como «15 500»: si el segundo es 500 y el primero es de dos cifras, son miles y quinientos
  t = t.replace(/(?<![\d.,])(\d{1,2})\s+500(?![\d.,])/g, (_m, a) => String(Number(a) * 1000 + 500));
  // «2 mil barras» es «2 mil»; «5 barras» es 5 mil
  t = t.replace(/\bmil\s+barras?\b/gi, 'mil');
  return t;
}

// ---------------------------------------------------------------- 2. gastos compartidos

const SENALES_PARTES_IGUALES = /\b(entre\s+(?:los|las)?\s*\d+|por\s+(?:los|las)\s+(?:\d+|dos|tres|cuatro|cinco|seis|todos|todas)|(?:los|las)\s+(?:\d+|dos|tres|cuatro|cinco|seis)|a partes iguales|a medias|mitad y mitad|50\s*[-/y]\s*50|dividid[oa]s?|partes iguales|entre todos|entre nosotros)\b/i;

function preguntaDeReparto(concepto: string, monto: number, nombres: string[], fecha: string, hecha: 'compartida' | 'vaca'): Aclaracion {
  const n = nombres.length + 1;
  const cada = Math.floor(monto / n);
  const opciones: OpcionDeReparto[] = [
    { titulo: `Dividir entre los ${n} (${formatear(cada)} c/u)`, frase: entre(concepto, monto, nombres, fecha) },
    { titulo: hecha === 'vaca' ? `Cada uno puso lo suyo (anoto mi parte: ${formatear(cada)})` : `Yo invité todo (${formatear(monto)})`, frase: [concepto, hecha === 'vaca' ? cada : monto, fecha].filter(Boolean).join(' ') },
    { titulo: 'Otro reparto', frase: `=Dime cuánto fue de cada uno. Por ejemplo: «${concepto} ${monto} pagué por ${nombres[0].toLowerCase()} ${Math.round(cada * 0.75 / 100) * 100}${nombres[1] ? ` y ${nombres[1].toLowerCase()} ${Math.round(cada * 1.25 / 100) * 100}` : ''}»` },
  ];
  return { mensaje: `Con ${juntar(nombres)}, ${formatear(monto)} en total. ¿Cómo se reparte?`, opciones };
}

function compartidos(t: string): Naturalizado | null {
  const { concepto, fecha } = conceptoDe(t);

  // «pagué 50k, 30k míos y 20k de Ana»: reparto desigual dicho con los dos montos
  let m = new RegExp(String.raw`pagu[eé]\s+(${MONTO})\s*[,;]?\s*(?:de los cuales\s+)?(${MONTO})\s+(?:m[ií]os?|mi parte|para m[ií]|m[ií]a)\s*(?:,|y)?\s*(?:y\s+)?(${MONTO})\s+(?:de|por|para)\s+(${NOMBRE})`, 'i').exec(t)
    ?? new RegExp(String.raw`pagu[eé]\s+(${MONTO})\s*[,;]?\s*(${MONTO})\s+(?:de|por|para)\s+(${NOMBRE})\s*(?:,|y)\s*(${MONTO})\s+(?:m[ií]os?|mi parte|para m[ií])`, 'i').exec(t);
  if (m) {
    const total = valorDeMonto(m[1]);
    const esPrimero = /m[ií]os?|mi parte|para m[ií]|m[ií]a/i.test(t.slice(t.indexOf(m[2]) + m[2].length, t.indexOf(m[2]) + m[2].length + 14));
    const suyo = valorDeMonto(esPrimero ? m[3] : m[2]);
    const nombre = partirNombres(esPrimero ? m[4] : m[3])[0];
    if (total > 0 && suyo > 0 && suyo < total && nombre) return { texto: [concepto, total, 'pagué por', nombre, suyo, fecha].filter(Boolean).join(' ') };
  }

  // «cada uno puso 20k»: cada quien pagó lo suyo, solo queda tu parte
  m = new RegExp(String.raw`cada\s+(?:uno|quien)\s+(?:puso|pag[oó]|puso de su bolsillo)\s+(${MONTO})`, 'i').exec(t);
  if (m && valorDeMonto(m[1]) > 0) return { texto: [concepto, valorDeMonto(m[1]), fecha].filter(Boolean).join(' ') };

  // «invité a Ana y Luis, 60k»: pagaste todo y no te deben nada
  m = new RegExp(String.raw`invit[eé]\s+a\s+(${NOMBRES})\b[^\d]*(${MONTO})`, 'i').exec(t);
  if (m && valorDeMonto(m[2]) > 0) return { texto: [concepto, valorDeMonto(m[2]), fecha].filter(Boolean).join(' ') };

  // «Ana pagó mi parte, 20k»: ahora le debes
  m = new RegExp(String.raw`(${NOMBRE})\s+(?:me\s+)?(?:pag[oó]|pas[oó]|puso)\s+(?:mi parte|lo m[ií]o|por m[ií]|mi cuenta|mi almuerzo|mi cena)(?:[^\d]*(${MONTO}))?`, 'i').exec(t);
  if (m && m[2]) return { texto: `le debo ${valorDeMonto(m[2])} a ${partirNombres(m[1])[0]} por ${concepto === 'varios' ? 'mi parte' : concepto}` };

  // «mitad y mitad con Ana», «a medias con Ana, 40k», «voy a medias con Ana en el almuerzo de 40k»
  m = new RegExp(String.raw`(?:mitad y mitad|a medias|50\s*[-/y]\s*50|a partes iguales)\s+con\s+(${NOMBRES})`, 'i').exec(t);
  const montoSuelto = new RegExp(MONTO, 'i').exec(t);
  if (m && montoSuelto && valorDeMonto(montoSuelto[0]) > 0) return { texto: entre(concepto, valorDeMonto(montoSuelto[0]), partirNombres(m[1]), fecha) };

  // «cine con Ana 30k a medias»: la señal de partes iguales puede ir al final
  if (/\b(a medias|mitad y mitad|a partes iguales)\b/i.test(t)) {
    const nm = new RegExp(String.raw`\bcon\s+(${NOMBRES})`, 'i').exec(t);
    const mt = new RegExp(MONTO, 'i').exec(t);
    if (nm && mt && valorDeMonto(mt[0]) > 0) return { texto: entre(concepto, valorDeMonto(mt[0]), partirNombres(nm[1]), fecha) };
  }

  // «cada quien pone su parte, almuerzo 45k con Pedro y Marta»: partes iguales
  if (/cada\s+(?:uno|quien)\s+(?:pone|paga)\s+(?:su\s+parte|lo\s+suyo)/i.test(t)) {
    const nm = new RegExp(String.raw`\bcon\s+(${NOMBRES})`, 'i').exec(t);
    const mt = new RegExp(MONTO, 'i').exec(t);
    if (nm && mt && valorDeMonto(mt[0]) > 0) return { texto: entre(concepto, valorDeMonto(mt[0]), partirNombres(nm[1]), fecha) };
  }

  // «éramos 3, pagué 90k de la cuenta», «comimos 4 y pagué yo 80k»: se sabe cuántos, no quiénes
  // (sin \b delante: la «é» inicial no cuenta como letra para \b)
  m = new RegExp(String.raw`(?:^|[\s,])(?:[eé]ramos|somos|fuimos|comimos)\s+(\d{1,2})(?![\d.,])`, 'i').exec(t);
  const total = new RegExp(String.raw`\b(?:pagu[eé]|puse|pago)\s+(?:yo\s+)?(?:la cuenta\s+(?:de\s+)?)?(${MONTO})`, 'i').exec(t) ?? new RegExp(String.raw`(${MONTO})\s+de la cuenta`, 'i').exec(t);
  if (m && total && valorDeMonto(total[1]) > 0 && Number(m[1]) >= 2) {
    const monto = valorDeMonto(total[1]), n = Number(m[1]), cada = Math.floor(monto / n);
    const c = concepto === 'varios' ? 'comida' : concepto;
    return { texto: t, pregunta: { mensaje: `Eran ${n} y pagaste ${formatear(monto)}. ¿Qué anoto?`, opciones: [
      { titulo: `Solo mi parte (${formatear(cada)})`, frase: [c, cada, fecha].filter(Boolean).join(' ') },
      { titulo: `Todo lo que pagué (${formatear(monto)})`, frase: [c, monto, fecha].filter(Boolean).join(' ') },
      { titulo: 'Con nombres', frase: `=Dime con quién fue. Por ejemplo: «${c} ${monto} entre ana, luis y yo»` },
    ] } };
  }

  // «hicimos vaca ... con Ana y Luis, 60k»: no se sabe quién pagó
  if (/\b(hicimos|hice|hagamos|hicieron)\s+(?:una\s+)?vaca\b/i.test(t)) {
    const nm = new RegExp(String.raw`\bcon\s+(${NOMBRES})`, 'i').exec(t);
    const mt = new RegExp(MONTO, 'i').exec(t);
    if (nm && mt && valorDeMonto(mt[0]) > 0) return { texto: t, pregunta: preguntaDeReparto(concepto, valorDeMonto(mt[0]), partirNombres(nm[1]), fecha, 'vaca') };
  }

  // «(fui a comer) con Ana y Luis, pagué 60k (por los 3)»
  m = new RegExp(String.raw`\bcon\s+(${NOMBRES})\s*[,;]?\s*(?:y\s+)?(?:pagu[eé](?:\s+yo)?|pago yo|puse(?:\s+yo)?|me toc[oó] pagar|me toc[oó] poner|pagamos)\s+(?:la cuenta\s+(?:de\s+)?)?(${MONTO})(.*)$`, 'i').exec(t)
    ?? new RegExp(String.raw`\b(?:pagu[eé](?:\s+yo)?|puse(?:\s+yo)?|me toc[oó] pagar)\s+(?:la cuenta\s+(?:de\s+)?)?(${MONTO})\s+(?:de|con|para)?\s*(?:la\s+)?(?:comida|cena|almuerzo|salida|cuenta)?\s*con\s+(${NOMBRES})(.*)$`, 'i').exec(t);
  if (m) {
    const primero = /^\d/.test(m[1]);
    const nombres = partirNombres(primero ? m[2] : m[1]);
    const monto = valorDeMonto(primero ? m[1] : m[2]);
    const resto = (primero ? m[3] : m[3]) ?? '';
    if (nombres.length && nombres.length <= 8 && monto > 0) {
      if (SENALES_PARTES_IGUALES.test(t)) return { texto: entre(concepto, monto, nombres, fecha) };
      if (/\b(invit[eé]|yo invito|yo pago todo|lo pagu[eé] todo)\b/i.test(t)) return { texto: [concepto, monto, fecha].filter(Boolean).join(' ') };
      void resto;
      return { texto: t, pregunta: preguntaDeReparto(concepto, monto, nombres, fecha, 'compartida') };
    }
  }

  // «pagué lo de Ana y lo mío, 40k»
  m = new RegExp(String.raw`pagu[eé]\s+(?:la cuenta de\s+|lo de\s+)(${NOMBRES})\s+y\s+(?:lo m[ií]o|la m[ií]a|lo mio)[^\d]*(${MONTO})`, 'i').exec(t);
  if (m && valorDeMonto(m[2]) > 0) {
    const nombres = partirNombres(m[1]);
    return { texto: t, pregunta: preguntaDeReparto(concepto, valorDeMonto(m[2]), nombres, fecha, 'compartida') };
  }
  return null;
}

// ---------------------------------------------------------------- 3. verbos coloquiales

/** El nombre de una cuenta como la entiende el bot («neki» -> nequi), o null. */
function cuentaDicha(texto: string, ctx: Pick<Contexto, 'cuentas'>): string | null {
  for (const w of limpiar(texto).split(' ')) {
    const id = cuentaDePalabra(w);
    if (id) return id === 'efectivo' || ctx.cuentas.some(c => c.id === id) ? id : null;
  }
  return null;
}

function verbos(t: string, ctx: Pick<Contexto, 'cuentas'>): string | null {
  const f = FECHA.exec(t)?.[0] ?? '';
  const cierre = f ? ` ${f}` : '';
  let m: RegExpExecArray | null;

  // «Ana me giró 50k nequi», «mamá me consignó 200k»: plata que entra de una persona
  m = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?(${NOMBRE})\s+me\s+(?:gir[oó]|consign[oó]|pas[oó]|mand[oó]|envi[oó]|transfiri[oó]|deposit[oó]|solt[oó]|cay[oó])\s+(${MONTO})\s*(.*)$`, 'i').exec(t);
  if (m && valorDeMonto(m[2]) > 0 && !/^(la|el|un|una)$/i.test(m[1])) return `ingreso ${valorDeMonto(m[2])} ${partirNombres(m[1])[0]} ${m[3]}${cierre}`.replace(/\s+/g, ' ').trim();

  // «Luis me debe 20k del taxi»: le prestaste
  m = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?(${NOMBRE})\s+me\s+debe\s+(${MONTO})`, 'i').exec(t);
  if (m && valorDeMonto(m[2]) > 0 && !/^(la|el|un|una)$/i.test(m[1])) return `presté ${valorDeMonto(m[2])} a ${partirNombres(m[1])[0]}${cierre}`;

  // «me fiaron 20k en la tienda de doña Rosa», «me fían el almuerzo, 15k, donde Pedro»
  m = new RegExp(String.raw`\bme\s+fi(?:aron|an|[oó]|aba)\b[^\d]*(${MONTO})[^\d]*?(?:\b(?:en|donde|con|a)\s+(?:la tienda de\s+|donde\s+)?(?:do[nñ]a?\s+)?(${NOMBRE}))`, 'i').exec(t);
  if (m && valorDeMonto(m[1]) > 0) return `le debo ${valorDeMonto(m[1])} a ${partirNombres(m[2])[0]}${cierre}`;
  m = new RegExp(String.raw`\b(?:le\s+)?qued[eé]\s+debiendo\s+(${MONTO})\s+(?:a|con)\s+(${NOMBRE})`, 'i').exec(t);
  if (m && valorDeMonto(m[1]) > 0) return `le debo ${valorDeMonto(m[1])} a ${partirNombres(m[2])[0]}${cierre}`;

  // «me tocó poner 30k para el taxi»
  m = new RegExp(String.raw`\bme\s+toc[oó]\s+(?:poner|pagar|sacar)\s+(${MONTO})(?:\s+(?:de|para|por|en)\s+(?:el|la|los|las)?\s*(.+))?$`, 'i').exec(t);
  if (m && valorDeMonto(m[1]) > 0) return `${(m[2] ?? 'gasto').trim()} ${valorDeMonto(m[1])}${cierre}`;

  // «saqué 100k del cajero», «saqué 50k de nequi»
  m = new RegExp(String.raw`\bsaqu[eé]\s+(${MONTO})\s*(?:del?\s+(?:el\s+)?(\w+))?`, 'i').exec(t);
  // «saqué 80000 de la meta moto» y «saqué de la alcancía» son de las metas y la alcancía, no del cajero
  if (m && valorDeMonto(m[1]) > 0 && !/meta|alcanc[ií]a|ahorro/i.test(t)) {
    const dicha = m[2] && !/cajero|banco|atm/i.test(m[2]) ? cuentaDicha(m[2], ctx) : null;
    const banco = dicha ?? ctx.cuentas.find(c => c.tipo === 'dinero' && c.moneda === 'COP' && /bancolombia|banco|bogota|ahorros/i.test(limpiar(c.nombre) + ' ' + c.clave))?.clave
      ?? ctx.cuentas.find(c => c.tipo === 'dinero' && c.moneda === 'COP' && c.id !== 'efectivo' && c.id !== 'monedas' && c.id !== 'alcancia')?.clave ?? null;
    if (banco && banco !== 'efectivo') return `cambio ${valorDeMonto(m[1])} ${banco} a efectivo${cierre}`;
  }

  // «pasé 50k de Nequi a efectivo», «pasé de nequi a efectivo 50k», «metí 100k a Nequi desde efectivo»
  m = new RegExp(String.raw`\bpas[eé]\s+(${MONTO})\s+de\s+(?:la\s+|el\s+)?(\w+)\s+a(?:l|\s+la|\s+el)?\s+(\w+)`, 'i').exec(t)
    ?? new RegExp(String.raw`\bpas[eé]\s+de\s+(?:la\s+|el\s+)?(\w+)\s+a(?:l|\s+la|\s+el)?\s+(\w+)\s+(?:unos\s+)?(${MONTO})`, 'i').exec(t);
  if (m) {
    const monto = valorDeMonto(/^\d/.test(m[1]) ? m[1] : m[3]);
    const de = cuentaDicha(/^\d/.test(m[1]) ? m[2] : m[1], ctx), a = cuentaDicha(/^\d/.test(m[1]) ? m[3] : m[2], ctx);
    if (monto > 0 && de && a && de !== a) return `cambio ${monto} ${de} a ${a}${cierre}`;
  }
  return null;
}

// ---------------------------------------------------------------- la entrada

/**
 * Pasa una frase por todas las reglas del lenguaje natural. Devuelve null si no hay nada que cambiar; si algo cambió,
 * el texto nuevo; y si la frase puede significar dos cosas, una `pregunta` con las opciones.
 */
export function naturalizar(texto: string, ctx: Pick<Contexto, 'cuentas'>): Naturalizado | null {
  // un mensaje normal es corto; uno larguísimo no es una frase de plata y las reglas no deben tardar con él
  if (texto.length > 400) return null;
  let t = jergaDeDinero(texto.trim());
  const cambioJerga = t !== texto.trim();
  const comp = compartidos(t);
  if (comp) return comp;
  const v = verbos(t, ctx);
  if (v) return { texto: v };
  return cambioJerga ? { texto: t } : null;
}
