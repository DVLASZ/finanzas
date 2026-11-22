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
/** `error` es una pregunta sin botones («¿A quién le debes?»); `avisos` se muestran en la tarjeta que salga de `texto`. */
export interface Naturalizado { texto: string; pregunta?: Aclaracion; error?: string; avisos?: string[] }

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
  // «treinta y una lucas» es de numerosDeDinero: aquí solo el «una luca» suelto
  t = t.replace(/(?<!\by\s)\b(un|una)\s+(palo|luca|luka|barra)s?\b/gi, '1 $2');
  t = corregirCuentasMalOidas(numerosDeDinero(t));
  // «15 quinientos» ya llegó como «15 500»: si el segundo es 500 y el primero es de dos cifras, son miles y quinientos
  t = t.replace(/(?<![\d.,])(\d{1,2})\s+500(?![\d.,])/g, (_m, a) => String(Number(a) * 1000 + 500));
  // «2 mil barras» es «2 mil»; «5 barras» es 5 mil
  t = t.replace(/\bmil\s+barras?\b/gi, 'mil');
  return t;
}

// ---------------------------------------------------------------- 2. gastos compartidos

const SENALES_PARTES_IGUALES = /\b(entre\s+(?:los|las)?\s*\d+|dividimos|repartimos|por\s+(?:los|las)\s+(?:\d+|dos|tres|cuatro|cinco|seis|todos|todas)|(?:los|las)\s+(?:\d+|dos|tres|cuatro|cinco|seis)|a partes iguales|a medias|mitad y mitad|50\s*[-/y]\s*50|dividid[oa]s?|partes iguales|entre todos|entre nosotros)\b/i;

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

  // «almuerzo 60k entre 3»
  const porNumero = repartoPorNumero(t, concepto, fecha);
  if (porNumero) return porNumero;

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

  // «dividimos el almuerzo 30000 con ana y luis», «repartimos la cuenta con Pedro, 40k»: partes iguales
  if (new RegExp(String.raw`(?<![${L}])(?:dividimos|divid[ií]|repartimos|repart[ií]|partimos)(?![${L}])`, 'i').test(t)) {
    const nm = new RegExp(String.raw`(?<![${L}])con\s+(${NOMBRES})`, 'i').exec(t);
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
      // la frontera va a mano: \b no ve la é final como letra
      if (/(?<![a-záéíóúñ])(?:invit[eé]|yo invito|yo pago todo|lo pagu[eé] todo)(?![a-záéíóúñ])/i.test(t)) return { texto: [concepto, monto, fecha].filter(Boolean).join(' ') };
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

  const cobro = cobros(t, ctx, cierre);
  if (cobro) return cobro;

  // «me debe ivan 20k», «me deben 20k Ana», «me quedó debiendo Pedro 15000»: te deben a ti, es un préstamo
  m = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?me\s+(?:deb(?:e|en)|qued[oó]\s+debiendo)\s+(.+)$`, 'i').exec(t.trim());
  if (m) {
    const nm = new RegExp(String.raw`^(${NOMBRE})\s+(${MONTO})${FIN}`, 'i').exec(m[1]);
    const nombreDelante = nm && !esPalabraSuelta(nm[1].split(' ')[0]) ? nm : null;
    if (nombreDelante && valorDeMonto(nombreDelante[2]) > 0) return `presté ${valorDeMonto(nombreDelante[2])} a ${partirNombres(nombreDelante[1])[0]}${cierre}`;
    const mo = new RegExp(String.raw`^(${MONTO})${FIN}\s+(?:a\s+)?(.+)$`, 'i').exec(m[1]);
    const n = mo ? nombreAlInicio(limpiarResto(mo[2]), ctx, true) : null;
    if (mo && n && valorDeMonto(mo[1]) > 0) return `presté ${valorDeMonto(mo[1])} a ${n.nombre}${cierre}`;
  }
  // «Pedro me quedó debiendo 15000»
  m = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?(${NOMBRE})\s+me\s+qued[oó]\s+debiendo\s+(${MONTO})`, 'i').exec(t.trim());
  if (m && valorDeMonto(m[2]) > 0 && !esPalabraSuelta(m[1].split(' ')[0])) return `presté ${valorDeMonto(m[2])} a ${partirNombres(m[1])[0]}${cierre}`;

  // «cancelé la deuda con Pedro 20000»: se paga lo que se debe
  m = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?(?:cancel[eé]|sald[eé]|pagu[eé]|abon[eé])\s+(?:la|una|mi)\s+deuda\s+(?:con|de|a|del)\s+(${NOMBRE})\s+(${MONTO})${FIN}`, 'i').exec(t.trim())
    ?? new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?(?:cancel[eé]|sald[eé]|pagu[eé]|abon[eé])\s+(${MONTO})${FIN}\s+(?:de|en)\s+(?:la|mi)\s+deuda\s+(?:con|de|a|del)\s+(${NOMBRE})`, 'i').exec(t.trim());
  if (m) {
    const primeroMonto = /^\d/.test(m[1]);
    const v = valorDeMonto(primeroMonto ? m[1] : m[2]);
    if (v > 0) return `pagué ${v} a ${partirNombres(primeroMonto ? m[2] : m[1])[0]}${cierre}`;
  }

  // «me tocó pagar 20000 a Pedro»: le pagaste tú
  m = new RegExp(String.raw`\bme\s+toc[oó]\s+pagar\s+(${MONTO})${FIN}\s+a\s+(${NOMBRE})`, 'i').exec(t);
  if (m && valorDeMonto(m[1]) > 0 && !esPalabraSuelta(m[2].split(' ')[0])) return `pagué ${valorDeMonto(m[1])} a ${partirNombres(m[2])[0]}${cierre}`;

  // «le puse 5000 a la moto», «le puse 20000 de gasolina a la moto»: un gasto en esa cosa
  m = new RegExp(String.raw`(?<![${L}])(?:le\s+)?pus[eé]\s+(${MONTO})${FIN}(?:\s+de\s+([${L}]+))?\s+(?:a|al|en|para)\s+(?:la|el|las|los|mi|mis)?\s*([${L}]+)\s*$`, 'i').exec(limpiarResto(t));
  if (m && valorDeMonto(m[1]) > 0 && !esPalabraSuelta(m[3]) && !esPersona(m[3], ctx)) return `${[m[2], m[3]].filter(Boolean).join(' ')} ${valorDeMonto(m[1])}${cierre}`;

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
  m = new RegExp(String.raw`\b(?:saqu[eé]|retir[eé])\s+(${MONTO})\s*(?:del?\s+(?:el\s+)?(\w+))?`, 'i').exec(t);
  // «saqué 80000 de la meta moto» y «saqué de la alcancía» son de las metas y la alcancía, no del cajero
  if (m && valorDeMonto(m[1]) > 0 && !/meta|alcanc[ií]a|ahorro/i.test(t)) {
    const dicha = m[2] && !/cajero|banco|atm/i.test(m[2]) ? cuentaDicha(m[2], ctx) : null;
    // sin decir la cuenta ni «cajero» no se adivina: lo pregunta `dudas`
    const delCajero = !!m[2] && /cajero|banco|atm/i.test(m[2]);
    const banco = dicha ?? (!delCajero ? null : ctx.cuentas.find(c => c.tipo === 'dinero' && c.moneda === 'COP' && /bancolombia|banco|bogota|ahorros/i.test(limpiar(c.nombre) + ' ' + c.clave))?.clave
      ?? ctx.cuentas.find(c => c.tipo === 'dinero' && c.moneda === 'COP' && c.id !== 'efectivo' && c.id !== 'monedas' && c.id !== 'alcancia')?.clave) ?? null;
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

// ---------------------------------------------------------------- 4. medidas y precio por unidad

// «500 ml», «2 kg», «250 gr»: el tamaño de lo que se compró, no plata. Se quita antes de buscar montos.
const MEDIDA = new RegExp(String.raw`(?<![\d.,${L}])\d+(?:[.,]\d+)?\s?(?:ml|cc|lts?|litros?|l|gr?s?|gramos?|kgs?|kilos?|libras?|lbs?|cms?|mm|mts?|metros?|oz|onzas?)(?![${L}\d])`, 'gi');

export function sinMedidas(t: string): string {
  return t.replace(MEDIDA, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

const CANTIDADES: Record<string, number> = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
const CANT = String.raw`\d{1,3}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce`;
const cantidadDe = (s: string): number => CANTIDADES[limpiar(s)] ?? Number(s);
const CADA = new RegExp(String.raw`\s+(?:c\/u|c\.u\.?|c\/una?|cada\s+(?:un[oa]|u)|cada|la\s+unidad|por\s+unidad|por\s+cabeza)(?![${L}])`, 'i');

/**
 * «2 empanadas 4500 c/u» y «3 gaseosas 2000 cada una»: el precio es de cada una, así que el gasto es cantidad por precio.
 * Se decidió multiplicar (y no preguntar) porque «c/u» solo se dice cuando el precio es el unitario. Si no hay cantidad se pregunta cuántas.
 */
function porUnidad(t: string): { texto: string; aviso?: string; error?: string } | null {
  const c = CADA.exec(t);
  if (!c) return null;
  const izq = t.slice(0, c.index), der = t.slice(c.index + c[0].length);
  const mm = new RegExp(String.raw`(${MONTO})\s*$`, 'i').exec(izq);
  if (!mm) return null;
  const unitario = valorDeMonto(mm[1]);
  if (!(unitario > 0)) return null;
  const antes = izq.slice(0, mm.index);
  const q = new RegExp(String.raw`(?:^|\s)(${CANT})(?=\s+[${L}])`, 'i').exec(antes);
  const n = q ? cantidadDe(q[1]) : 0;
  if (!(n >= 1)) return { texto: t, error: '¿Cuántas fueron? Escríbelo con la cantidad, por ejemplo: «3 gaseosas 2000 cada una».' };
  const total = n * unitario;
  const texto = `${antes}${total}${der}`.replace(/\s+/g, ' ').trim();
  return n === 1 ? { texto } : { texto, aviso: `${n} × ${formatear(unitario)} = ${formatear(total)}.` };
}

// ---------------------------------------------------------------- 5. repartos con número y cobros

const ENTRE_N = new RegExp(String.raw`(?<![${L}])entre\s+(${CANT})(?![${L}\d])`, 'i');

/**
 * «almuerzo 60k entre 3»: partes iguales con la cuenta de personas dicha como número.
 * Con nombres que cuadran («entre 3 con ana y luis») es un gasto compartido; sin nombres se anota solo tu parte,
 * porque a nadie se le puede cobrar sin saber quién es; si el número y los nombres no cuadran se pregunta.
 */
function repartoPorNumero(t: string, concepto: string, fecha: string): Naturalizado | null {
  const e = ENTRE_N.exec(t);
  if (!e || /pagu[eé]|puse|pagamos/i.test(t)) return null;
  const n = cantidadDe(e[1]);
  if (!(n >= 2)) return null;
  const sin = t.replace(e[0], ' ');
  const mt = new RegExp(MONTO, 'i').exec(sin);
  const monto = mt ? valorDeMonto(mt[0]) : 0;
  if (!(monto > 0)) return null;
  const cada = Math.floor(monto / n);
  const nm = new RegExp(String.raw`(?<![${L}])con\s+(${NOMBRES})`, 'i').exec(sin);
  if (nm) {
    const nombres = partirNombres(nm[1]);
    if (nombres.length + 1 === n) return { texto: entre(concepto, monto, nombres, fecha) };
    return { texto: t, pregunta: { mensaje: `Dices que fueron ${n}, pero con ${juntar(nombres)} y tú son ${nombres.length + 1}. ¿Cómo lo anoto?`, opciones: [
      { titulo: `Solo mi parte (${formatear(cada)})`, frase: [concepto, cada, fecha].filter(Boolean).join(' ') },
      { titulo: 'Con nombres', frase: `=Dime con quién fue. Por ejemplo: «${concepto} ${monto} entre ana, luis y yo»` },
    ] } };
  }
  const base = sin.replace(new RegExp(MONTO, 'i'), ' ').replace(/(?<![${L}])(?:total|fue|fueron|son)(?![${L}])/gi, ' ').replace(FECHA, ' ').replace(/\s+/g, ' ').trim();
  const c = base || concepto;
  return { texto: [c, cada, fecha].filter(Boolean).join(' '), avisos: [`${formatear(monto)} entre ${n}: anoté solo tu parte (${formatear(cada)}). Si quieres cobrarle a alguien, dime quiénes eran.`] };
}

const V_COBRO = String.raw`(pag[oó]|abon[oó]|devolvi[oó]|consign[oó])`;
const ART = String.raw`(?:(?:los|las|el|la|unos|unas|un|una)\s+)?`;
const FIN = String.raw`(?![${L}\d])`;
// lo que explica por qué te pagó, pero no cambia nada: «los 23k que me debía»
const DEBIA = new RegExp(String.raw`\s*,?\s*(?:que|qu[eé]|q|lo que|la que)\s+(?:me\s+)?(?:deb[ií]a|deb[ií]an|adeudaba|qued[oó]\s+debiendo)(?![${L}]).*$`, 'i');
const STOP_NOMBRE = new Set(['de', 'del', 'a', 'al', 'para', 'por', 'en', 'con', 'y', 'e', 'mi', 'mis', 'tu', 'su', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'ya', 'que', 'lo', 'le', 'me', 'se', 'no', 'hoy', 'ayer', 'anteayer', 'antier', 'la', 'plata', 'dinero']);
const limpiarResto = (s: string): string => s.replace(FECHA, ' ').replace(/\s+/g, ' ').trim();

const esPersona = (w: string, ctx: Pick<Contexto, 'cuentas'>): boolean => ctx.cuentas.some(c => c.tipo === 'persona' && c.clave === limpiar(w));
const esPalabraSuelta = (w: string): boolean => STOP_NOMBRE.has(limpiar(w)) || cuentaDePalabra(limpiar(w)) !== null;

/**
 * Un nombre al comienzo de `resto`. Con `cualquiera` vale una palabra en minúscula («me debe ivan»); si no, hace falta que
 * esté con mayúscula o que sea una persona que ya conoces, para no tomar «camisa» por alguien.
 */
function nombreAlInicio(resto: string, ctx: Pick<Contexto, 'cuentas'>, cualquiera = false): { nombre: string; sobra: string } | null {
  const ws = resto.trim().split(/\s+/).filter(Boolean);
  const nombre: string[] = [];
  for (const w of ws.slice(0, 3)) {
    if (esPalabraSuelta(w) || !new RegExp(`^[${L}]+$`).test(w)) break;
    if (/^[A-ZÁÉÍÓÚÑ]/.test(w)) { nombre.push(w); continue; }
    if (nombre.length === 0 && (cualquiera || esPersona(w, ctx))) nombre.push(w);
    break;
  }
  if (!nombre.length) return null;
  return { nombre: nombre.join(' '), sobra: ws.slice(nombre.length).join(' ') };
}

/** «Faber me pagó los 23k que me debía», «me abonó 10k Ana», «cobré 30k a Ana»: todo se dice como «Ana me pagó 30k». */
function cobros(t: string, ctx: Pick<Contexto, 'cuentas'>, cierre: string): string | null {
  const sin = t.replace(DEBIA, '').trim();
  const cambio = sin !== t.trim();
  let m: RegExpExecArray | null;
  const verbo = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?(?:ya\s+)?(${NOMBRE})\s+me\s+${V_COBRO}\s+(?:ya\s+)?(${ART})(${MONTO})${FIN}\s*(.*)$`, 'i');
  m = verbo.exec(sin);
  if (m && valorDeMonto(m[4]) > 0 && !/^(la|el|un|una|ya)$/i.test(m[1])) {
    if (!cambio && /^pag/i.test(m[2]) && !m[3]) return null; // «Ana me pagó 23k» ya la entiende el intérprete
    return `${partirNombres(m[1])[0]} me pagó ${valorDeMonto(m[4])} ${limpiarResto(m[5])}${cierre}`.replace(/\s+/g, ' ').trim();
  }
  m = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?(?:ya\s+)?me\s+${V_COBRO}\s+(?:ya\s+)?(${ART})(${MONTO})${FIN}\s+(?:de\s+)?(.+)$`, 'i').exec(sin);
  if (m && valorDeMonto(m[3]) > 0) {
    const n = nombreAlInicio(m[4], ctx);
    if (n) return `${n.nombre} me pagó ${valorDeMonto(m[3])} ${limpiarResto(n.sobra)}${cierre}`.replace(/\s+/g, ' ').trim();
  }
  // «cobré 30k a Ana», «le cobré a Ana 30k»
  m = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?(?:le\s+)?cobr[eé]\s+(${MONTO})${FIN}\s+a\s+(.+)$`, 'i').exec(sin);
  if (m && valorDeMonto(m[1]) > 0) {
    const n = nombreAlInicio(m[2], ctx, true);
    if (n) return `${n.nombre} me pagó ${valorDeMonto(m[1])} ${limpiarResto(n.sobra)}${cierre}`.replace(/\s+/g, ' ').trim();
  }
  m = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?(?:le\s+)?cobr[eé]\s+a\s+(.+?)\s+(${MONTO})${FIN}\s*(.*)$`, 'i').exec(sin);
  if (m && valorDeMonto(m[2]) > 0) {
    const n = nombreAlInicio(m[1], ctx, true);
    if (n && !n.sobra) return `${n.nombre} me pagó ${valorDeMonto(m[2])} ${limpiarResto(m[3])}${cierre}`.replace(/\s+/g, ' ').trim();
  }
  // «Ana me debía 23k y ya me pagó»
  m = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?(${NOMBRE})\s+me\s+deb[ií]a\s+(${MONTO})${FIN}(.*?)(?<![${L}])ya\s+me\s+(?:pag[oó]|abon[oó]|devolvi[oó]|consign[oó])(?![${L}])`, 'i').exec(sin);
  if (m && valorDeMonto(m[2]) > 0 && !/^(la|el|un|una)$/i.test(m[1])) return `${partirNombres(m[1])[0]} me pagó ${valorDeMonto(m[2])}${cierre}`;
  return null;
}

/** «ya me pagó Ana» y «cobré a Ana» sin monto: se pregunta cuánto, en vez de ofrecer la lista de compras. */
function cobroSinMonto(t: string, ctx: Pick<Contexto, 'cuentas'>): string | null {
  if (/\d/.test(t) || DE_INGRESO_TEXTO.test(limpiar(t))) return null;
  let m = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?(?:ya\s+)?me\s+${V_COBRO}\s+(.+)$`, 'i').exec(t.trim());
  if (m) {
    const n = nombreAlInicio(limpiarResto(m[2]), ctx);
    if (n && !n.sobra) return `¿Cuánto te pagó ${n.nombre}? Escríbelo así: «${n.nombre} me pagó 40k».`;
  }
  m = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?(${NOMBRE})\s+(?:ya\s+)?me\s+${V_COBRO}\s*$`, 'i').exec(t.trim());
  if (m && !/^(la|el|un|una|ya)$/i.test(m[1])) return `¿Cuánto te pagó ${partirNombres(m[1])[0]}? Escríbelo así: «${partirNombres(m[1])[0]} me pagó 40k».`;
  m = /^(?:le\s+)?cobr[eé]\s+a\s+(.+)$/i.exec(limpiarResto(t));
  if (m) {
    const n = nombreAlInicio(m[1], ctx, true);
    if (n && !n.sobra) return `¿Cuánto le cobraste a ${n.nombre}? Escríbelo así: «cobré 30k a ${n.nombre}».`;
  }
  return null;
}
const DE_INGRESO_TEXTO = /\b(quincena|nomina|sueldo|salario|chamba|trabajo|mesada|pension|honorarios|comision|prima|bono)\b/;

/** Los bancos y billeteras donde puede haber plata en pesos (no el efectivo ni las monedas). */
const cuentasDeBanco = (ctx: Pick<Contexto, 'cuentas'>) => ctx.cuentas.filter(c => c.tipo === 'dinero' && c.moneda === 'COP' && !['efectivo', 'monedas', 'alcancia'].includes(c.id));

/** Lo que no se puede adivinar: se pregunta con botones o sin ellos, y no se anota nada hasta saber. */
function dudas(t: string, ctx: Pick<Contexto, 'cuentas'>, cierre: string): Naturalizado | null {
  const s = limpiarResto(t);
  let m: RegExpExecArray | null;
  const ini = String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?`;

  // «cancelar el pago» puede ser deshacer lo último o querer cancelar una deuda: se pregunta
  if (/^(?:cancela|cancelar)\s+(?:el|ese|este|mi)\s+(?:pago|movimiento|gasto)$/i.test(s)) {
    return { texto: t, pregunta: { mensaje: '¿Quieres deshacer el último movimiento?', opciones: [{ titulo: 'Sí, deshacer el último', frase: 'deshacer' }] } };
  }

  // «me rebajó Pedro 5000», «Pedro me rebajó 5000»: rebaja de qué, no se sabe
  m = new RegExp(String.raw`${ini}me\s+(?:rebaj[oó]|descont[oó])\s+(${NOMBRE})\s+(${MONTO})${FIN}`, 'i').exec(s)
    ?? new RegExp(String.raw`${ini}(${NOMBRE})\s+me\s+(?:rebaj[oó]|descont[oó])\s+(${MONTO})${FIN}`, 'i').exec(s);
  if (m && valorDeMonto(m[2]) > 0) {
    const v = valorDeMonto(m[2]), n = partirNombres(m[1])[0];
    return { texto: t, pregunta: { mensaje: `${n} te rebajó ${formatear(v)}. ¿Qué fue?`, opciones: [{ titulo: `Me devolvió ${formatear(v)} (entra plata)`, frase: `${n} me pagó ${v}${cierre}` }] } };
  }

  // «pasé 50000 a nequi»: se sabe adónde, no de dónde
  m = new RegExp(String.raw`${ini}pas[eé]\s+(${MONTO})${FIN}\s+a(?:l|\s+la|\s+el)?\s+([${L}]+)$`, 'i').exec(s);
  if (m && valorDeMonto(m[1]) > 0) {
    const destino = cuentaDicha(m[2], ctx);
    const cuenta = ctx.cuentas.find(c => c.id === destino);
    if (destino && cuenta) {
      const v = valorDeMonto(m[1]);
      const origenes = ctx.cuentas.filter(c => c.tipo === 'dinero' && c.moneda === 'COP' && c.id !== destino && c.id !== 'monedas' && c.id !== 'alcancia');
      return { texto: t, pregunta: { mensaje: `¿De dónde sale la plata para pasar ${formatear(v)} a ${cuenta.nombre}?`, opciones: origenes.map(c => ({ titulo: `De ${c.nombre}`, frase: `cambio ${v} ${c.clave} a ${cuenta.clave}${cierre}` })) } };
    }
  }

  // «saqué 100000», «retiré 100000» sin decir de qué cuenta
  m = new RegExp(String.raw`${ini}(?:saqu[eé]|retir[eé])\s+(${MONTO})${FIN}\s*$`, 'i').exec(s);
  if (m && valorDeMonto(m[1]) > 0) {
    const v = valorDeMonto(m[1]);
    const bancos = cuentasDeBanco(ctx);
    if (bancos.length === 1) return { texto: `cambio ${v} ${bancos[0].clave} a efectivo${cierre}` };
    if (bancos.length > 1) return { texto: t, pregunta: { mensaje: `¿De qué cuenta sacaste ${formatear(v)}?`, opciones: bancos.map(c => ({ titulo: c.nombre, frase: `cambio ${v} ${c.clave} a efectivo${cierre}` })) } };
  }
  // «saqué plata del cajero» sin cuánto
  if (!/\d/.test(s) && new RegExp(String.raw`${ini}(?:saqu[eé]|retir[eé])\s+(?:plata|dinero|efectivo|billete|guaca)\s+(?:del?\s+)?(?:el\s+)?(?:cajero|banco|atm)\s*$`, 'i').test(s)) {
    return { texto: t, error: '¿Cuánto sacaste del cajero? Escríbelo así: «saqué 100k del cajero».' };
  }

  // «me fié 20000», «quedé debiendo 15000», «me deben 20k», «puse yo 20000»: falta una pieza
  if (/\d/.test(s)) {
    if (new RegExp(String.raw`(?<![${L}])me\s+fi(?:aron|an|[oó]|aba|[eé])(?![${L}])`, 'i').test(s) || new RegExp(String.raw`(?<![${L}])qued[eé]\s+debiendo(?![${L}])`, 'i').test(s)) {
      return { texto: t, error: '¿A quién le debes? Escríbelo así: «me fiaron 20k donde Pedro» o «le debo 20k a Pedro».' };
    }
    if (new RegExp(String.raw`${ini}me\s+(?:deb(?:e|en)|qued[oó]\s+debiendo)\s+${MONTO}${FIN}\s*$`, 'i').test(s)) {
      return { texto: t, error: '¿Quién te debe? Escríbelo así: «Pedro me debe 20k» o «presté 20k a Pedro».' };
    }
    if (new RegExp(String.raw`${ini}pus[eé](?:\s+yo)?\s+${MONTO}${FIN}\s*$`, 'i').test(s)) {
      return { texto: t, error: '¿En qué fue? Escríbelo así: «almuerzo 20000».' };
    }
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
  let t = sinMedidas(jergaDeDinero(texto.trim()));
  const cambioJerga = t !== texto.trim();
  // «2 empanadas 4500 c/u»: el precio de cada una se vuelve el total, y la cuenta queda dicha en la tarjeta
  const avisos: string[] = [];
  const unidad = porUnidad(t);
  if (unidad?.error) return { texto: t, error: unidad.error };
  if (unidad) { t = unidad.texto; if (unidad.aviso) avisos.push(unidad.aviso); }
  const con = (n: Naturalizado): Naturalizado => (avisos.length ? { ...n, avisos: [...avisos, ...(n.avisos ?? [])] } : n);
  const comp = compartidos(t);
  if (comp) return con(comp);
  const sinMonto = cobroSinMonto(t, ctx);
  if (sinMonto) return { texto: t, error: sinMonto };
  const v = verbos(t, ctx);
  if (v) return con({ texto: v });
  const duda = dudas(t, ctx, FECHA.exec(t)?.[0] ? ` ${FECHA.exec(t)![0]}` : '');
  if (duda) return duda;
  return unidad || cambioJerga ? con({ texto: t }) : null;
}
