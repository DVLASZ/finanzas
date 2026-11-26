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
import { cuentaDePalabra, grupoPorDefecto, vendeProductos } from './entidades.ts';
import { corregirCuentasMalOidas, numerosDeDinero } from './voz.ts';
import { limpiar, titulo } from './texto.ts';
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
    // «hicimos vaca de 80k para el regalo»: sin nombres no se sabe si los 80k son tu parte o el total de todos
    if (!nm && mt && valorDeMonto(mt[0]) > 0) {
      const v = valorDeMonto(mt[0]), c = concepto === 'varios' ? 'vaca' : concepto;
      return { texto: t, pregunta: { mensaje: `¿Cuánto puso cada uno? No sé si los ${formatear(v)} son lo tuyo o el total de la vaca.`, opciones: [
        { titulo: `Los ${formatear(v)} los puse yo`, frase: [c, v, fecha].filter(Boolean).join(' ') },
        { titulo: 'Solo puse mi parte', frase: `=Dime cuánto pusiste tú. Por ejemplo: «${c} ${Math.round(v / 4 / 100) * 100}».` },
        { titulo: 'Quiero dividirla con nombres', frase: `=Dime con quién fue. Por ejemplo: «${c} ${v} entre ana, luis y yo».` },
      ] } };
    }
  }

  // «(fui a comer) con Ana y Luis, pagué 60k (por los 3)»
  m = new RegExp(String.raw`\bcon\s+(${NOMBRES})\s*[,;]?\s*(?:y\s+)?(?:pagu[eé](?:\s+yo)?|pago yo|puse(?:\s+yo)?|me toc[oó] pagar|me toc[oó] poner|pagamos)\s+(?:la cuenta\s+(?:de\s+)?)?(${MONTO})(.*)$`, 'i').exec(t)
    ?? new RegExp(String.raw`\b(?:pagu[eé](?:\s+yo)?|puse(?:\s+yo)?|me toc[oó] pagar)\s+(?:la cuenta\s+(?:de\s+)?)?(${MONTO})\s+(?:de|con|para)?\s*(?:la\s+)?(?:comida|cena|almuerzo|salida|cuenta)?\s*con\s+(${NOMBRES})(.*)$`, 'i').exec(t);
  if (m) {
    const primero = /^\d/.test(m[1]);
    // «pagué 20k con nequi» dice con qué se pagó, no con quién: una cuenta nunca es acompañante
    const nombres = partirNombres(primero ? m[2] : m[1]).filter(n => !limpiar(n).split(' ').every(w => cuentaDePalabra(w)));
    const monto = valorDeMonto(primero ? m[1] : m[2]);
    const resto = (primero ? m[3] : m[3]) ?? '';
    if (nombres.length && nombres.length <= 8 && monto > 0) {
      // «con un cliente»: alguien sin nombre no se puede cobrar ni dividir, lo que pagaste es un gasto tuyo
      if (/^(?:un|una|unos|unas|algunos|varios)\s/i.test((primero ? m[2] : m[1]).trim())) return { texto: [concepto, monto, fecha].filter(Boolean).join(' ') };
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

/** «sábado» -> «24/10»: el próximo sábado después de hoy (hora de Colombia), en la forma que entiende la fecha límite de una deuda. */
function proximoDia(dia: string, ahora: Date): string {
  const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const objetivo = DIAS.indexOf(limpiar(dia));
  const hoy = new Date(ahora.getTime() - 5 * 3600_000);
  const falta = ((objetivo - hoy.getUTCDay() + 6) % 7) + 1;
  const f = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + falta));
  return `${f.getUTCDate()}/${f.getUTCMonth() + 1}`;
}

function verbos(t: string, ctx: Pick<Contexto, 'cuentas'> & Partial<Pick<Contexto, 'ahora'>>): string | null {
  const f = FECHA.exec(t)?.[0] ?? '';
  const cierre = f ? ` ${f}` : '';
  let m: RegExpExecArray | null;

  const cobro = cobros(t, ctx, cierre);
  if (cobro) return cobro;

  // «me debe ivan 20k», «me deben 20k Ana», «me quedó debiendo Pedro 15000»: te deben a ti, es un préstamo
  m = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?me\s+(?:deb(?:e|en)|qued(?:[oó]|aron)\s+debiendo)\s+(.+)$`, 'i').exec(t.trim());
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

  // «me fían 20k en la tienda (de la esquina)»: compra fiada, deuda con la tienda; no sale plata de ninguna cuenta
  m = new RegExp(String.raw`\bme\s+f[ií](?:aron|an|[oó]|aba)\b[^\d]*(${MONTO})${FIN}[^\d]*?\b(?:en|donde|con|de)\s+((?:la|el)\s+tienda(?:\s+de\s+(?:la|el)\s+[${L}]+)?)(?!\s+de\s+(?!(?:la|el)\s))`, 'i').exec(t);
  if (m && valorDeMonto(m[1]) > 0) return `le debo ${valorDeMonto(m[1])} a ${m[2]}${cierre}`;

  // «apúnteme 32 mil de la tienda, se los pago el sábado»: lo mismo; el día que dice es el plazo, no la fecha de la compra
  m = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)?(?:ap[uú]nte|an[oó]te|f[ií]e)me\s+(${MONTO})${FIN}\s*(.*)$`, 'i').exec(t.trim());
  if (m && valorDeMonto(m[1]) > 0) {
    const quien = new RegExp(String.raw`(?<![${L}])(?:de|en|donde|del)\s+((?:la|el)\s+tienda(?:\s+de\s+(?:la|el)\s+[${L}]+)?|(?:do[nñ]a?\s+)?[${L}]+)`, 'i').exec(m[2])?.[1]?.replace(/^do[nñ]a?\s+/i, '');
    if (quien && !esPalabraSuelta(quien.split(' ')[0]) || /^(?:la|el)\s+tienda/i.test(quien ?? '')) {
      const plazo = new RegExp(String.raw`(?<![${L}])(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?![${L}])`, 'i').exec(m[2])?.[1];
      const limite = plazo && ctx.ahora ? ` hasta el ${proximoDia(plazo, ctx.ahora)}` : '';
      return `le debo ${valorDeMonto(m[1])} a ${quien}${limite}`;
    }
  }

  // «me fiaron 20k en la tienda de doña Rosa», «me fían el almuerzo, 15k, donde Pedro»
  m = new RegExp(String.raw`\bme\s+f[ií](?:aron|an|[oó]|aba)\b[^\d]*(${MONTO})[^\d]*?(?:\b(?:en|donde|con|a)\s+(?:la tienda de\s+|donde\s+)?(?:do[nñ]a?\s+)?(${NOMBRE}))`, 'i').exec(t);
  if (m && valorDeMonto(m[1]) > 0) return `le debo ${valorDeMonto(m[1])} a ${partirNombres(m[2])[0]}${cierre}`;
  m = new RegExp(String.raw`\b(?:le\s+)?qued[eé]\s+debiendo\s+(${MONTO})\s+(?:a|con)\s+(${NOMBRE})`, 'i').exec(t);
  if (m && valorDeMonto(m[1]) > 0) return `le debo ${valorDeMonto(m[1])} a ${partirNombres(m[2])[0]}${cierre}`;

  // «le solté 90 barras a Pipe hasta el viernes»: plata que se da y se espera de vuelta es un préstamo (el plazo no se guarda)
  m = new RegExp(String.raw`(?<![${L}])(?:le\s+)?solt[eé]\s+(${MONTO})${FIN}${PESOS}\s+a\s+(?:(?:mi|mis)\s+)?([${L}]+)`, 'i').exec(t);
  if (m && valorDeMonto(m[1]) > 0 && !esPalabraSuelta(m[2])) {
    const dia = f && !/(?<![a-záéíóúñ])(?:hasta|para|antes\s+de)\s+(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/i.test(t) ? cierre : '';
    return `presté ${valorDeMonto(m[1])} a ${m[2]}${dia}`;
  }

  // «me descuadré con 15 lucas en la tienda»: se gastó de más; se anota como el gasto que fue
  m = new RegExp(String.raw`(?<![${L}])me\s+descuadr[eé]\s+(?:con|en|por|de)?\s*(${MONTO})${FIN}\s*(.*)$`, 'i').exec(t);
  if (m && valorDeMonto(m[1]) > 0) return `gasté ${valorDeMonto(m[1])} ${limpiarResto(m[2])}${cierre}`.replace(/\s+/g, ' ').trim();

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

// «de los 40 que le presté» solo cuenta de qué deuda es el abono; si se deja, «le presté» vuelve la frase otro préstamo
const DE_LOS = new RegExp(String.raw`\s+de\s+(?:los|las)\s+${MONTO}(?![${L}\d]).*$`, 'i');

/** «Faber me pagó los 23k que me debía», «me abonó 10k Ana», «cobré 30k a Ana»: todo se dice como «Ana me pagó 30k». */
function cobros(t: string, ctx: Pick<Contexto, 'cuentas'>, cierre: string): string | null {
  const sin = t.replace(DEBIA, '').replace(DE_LOS, '').trim();
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

  // «me hicieron un cruce de 40k por nequi»: puede ser un pago, una transferencia entre tus cuentas o una compensación
  m = new RegExp(String.raw`(?<![${L}])(?:hicieron|hice|hizo|hicimos)\s+(?:un|el)\s+cruce\b[^\d]*(${MONTO})${FIN}`, 'i').exec(s);
  if (m && valorDeMonto(m[1]) > 0) {
    const v = valorDeMonto(m[1]), cuenta = cuentaDicha(s, ctx);
    return { texto: t, pregunta: { mensaje: `¿Qué fue el cruce de ${formatear(v)}?`, opciones: [
      { titulo: 'Un pago que recibí (entra plata)', frase: `ingreso ${v} ${cuenta && cuenta !== 'efectivo' ? `${cuenta} ` : ''}otros${cierre}` },
      { titulo: 'Una transferencia entre mis cuentas', frase: `=Dime de qué cuenta a cuál. Por ejemplo: «pasé ${v} de efectivo a nequi».` },
      { titulo: 'Una compensación con alguien', frase: `=Dime con quién fue y quién pagó. Por ejemplo: «Ana me pagó ${v}» o «pagué ${v} a Ana».` },
    ] } };
  }

  // «abono a la quincena 300k»: puede ser plata que entra o un abono tuyo a otra persona
  m = new RegExp(String.raw`${ini}abon[oó]\s+(?:a|de|en|para)\s+(?:la|el|mi)\s+(quincena|nomina|sueldo|salario|mesada)\s+(?:de\s+)?(${MONTO})${FIN}\s*$`, 'i').exec(s);
  if (m && valorDeMonto(m[2]) > 0) {
    const v = valorDeMonto(m[2]);
    return { texto: t, pregunta: { mensaje: `¿El abono de ${formatear(v)} es plata que entró o que pagaste tú?`, opciones: [
      { titulo: `Me abonaron de la ${m[1].toLowerCase()} (entra plata)`, frase: `ingreso ${v} ${limpiar(m[1])}${cierre}` },
      { titulo: 'Yo le abono a otra persona', frase: `=Dime a quién le abonaste. Por ejemplo: «pagué ${v} a Pedro».` },
    ] } };
  }

  // «mijito, guárdeme 50 mil para el recibo»: apartar la plata no es haber pagado el recibo
  m = new RegExp(String.raw`(?<![${L}])(?:gu[aá]rd(?:e|a)me|ap[aá]rt(?:e|a)me|sep[aá]r(?:e|a)me)\s+(${MONTO})${FIN}\s+(?:para|pa)\s+(?:el|la|los|las|mi|mis)?\s*([${L}]+(?:\s+[${L}]+)?)\s*$`, 'i').exec(s);
  if (m && valorDeMonto(m[1]) > 0) {
    const v = valorDeMonto(m[1]), cosa = limpiar(m[2]);
    return { texto: t, pregunta: { mensaje: `¿Los ${formatear(v)} para ${cosa} los apartas o ya los pagaste?`, opciones: [
      { titulo: 'Apartarlos en una alcancía', frase: `=Para apartar, crea una meta y luego aparta de a poco. Por ejemplo: «meta ${cosa} ${v}» y después «ahorré ${v} para ${cosa}».` },
      { titulo: `Ya pagué ${cosa}`, frase: `${cosa} ${v}${cierre}` },
    ] } };
  }

  // «le pasé la mano a mi hermana con 25 lucas»: ayuda en plata, y no se sabe si fue regalo, préstamo o pago
  m = new RegExp(String.raw`${ini}(?:le\s+)?(?:pas[eé]|di|ech[eé])\s+(?:la|una)\s+mano\s+a\s+(?:(?:mi|mis|la|el)\s+)?([${L}]+)\s+con\s+(${MONTO})${FIN}`, 'i').exec(s);
  if (m && valorDeMonto(m[2]) > 0 && !esPalabraSuelta(m[1])) {
    const v = valorDeMonto(m[2]), n = titulo(limpiar(m[1]));
    return { texto: t, pregunta: { mensaje: `¿Qué fueron los ${formatear(v)} que le diste a ${n}?`, opciones: [
      { titulo: 'Se los presté', frase: `presté ${v} a ${n}${cierre}` },
      { titulo: 'Le pagué algo', frase: `pagué ${v} a ${n}${cierre}` },
      { titulo: 'Se los regalé', frase: `le regalé ${v} a ${n}${cierre}` },
    ] } };
  }

  // «compré una crema por internet 28k»: puede ser un medicamento, cuidado personal o cocina; no se asigna categoría a ciegas
  const sinTilde = limpiar(s);
  const crema = /(?<![a-z])cremas?(?![a-z])/.test(sinTilde) && !/\b(?:de|para)\s+(?:leche|cocina|torta|postre)|\b(?:dental|chantilly|pastelera|de\s+crema|salud|personal|belleza)\b/.test(sinTilde);
  const mCrema = crema ? new RegExp(MONTO, 'i').exec(s) : null;
  if (mCrema && valorDeMonto(mCrema[0]) > 0) {
    const v = valorDeMonto(mCrema[0]);
    return { texto: t, pregunta: { mensaje: `¿Para qué es la crema de ${formatear(v)}?`, opciones: [
      { titulo: 'Para la piel o un tratamiento (salud)', frase: `crema salud ${v}${cierre}` },
      { titulo: 'Cuidado personal o belleza', frase: `crema personal ${v}${cierre}` },
      { titulo: 'Es de cocina', frase: `crema comida ${v}${cierre}` },
    ] } };
  }

  // «me fié 20000», «quedé debiendo 15000», «me deben 20k», «puse yo 20000»: falta una pieza
  if (/\d/.test(s)) {
    if (new RegExp(String.raw`(?<![${L}])me\s+f[ií](?:aron|an|[oó]|aba|[eé])(?![${L}])`, 'i').test(s) || new RegExp(String.raw`(?<![${L}])qued[eé]\s+debiendo(?![${L}])`, 'i').test(s)) {
      return { texto: t, error: '¿A quién le debes? Escríbelo así: «me fiaron 20k donde Pedro» o «le debo 20k a Pedro».' };
    }
    if (new RegExp(String.raw`${ini}me\s+(?:deb(?:e|en)|qued(?:[oó]|aron)\s+debiendo)\s+${MONTO}${FIN}(?:\s+(?:de|del|por|en|para)\s+.*)?$`, 'i').test(s)) {
      return { texto: t, error: '¿Quién te debe? Escríbelo así: «Pedro me debe 20k» o «presté 20k a Pedro».' };
    }
    if (new RegExp(String.raw`${ini}pus[eé](?:\s+yo)?\s+${MONTO}${FIN}\s*$`, 'i').test(s)) {
      return { texto: t, error: '¿En qué fue? Escríbelo así: «almuerzo 20000».' };
    }
  }
  return null;
}

// ---------------------------------------------------------------- 6. hacia dónde va la plata

type CtxDireccion = Pick<Contexto, 'cuentas'> & Partial<Pick<Contexto, 'config' | 'abiertas' | 'aprendido' | 'ahora'>>;

const INI = String.raw`^(?:(?:hoy|ayer|anteayer|antier)\s+)*`;
const PESOS = String.raw`(?:\s+(?:pesos|pesitos|barritas))?`;
const DEVOLVER = /(?:\s+y)?\s+(?:no\s+)?me\s+(?:lo|los|la|las)\s+(?:devuel\w*|devolvi[oó]|ha\s+devuelto|tiene\s+que\s+devolver|va\s+a\s+devolver|paga|pague)\b.*$|\s+(?:prestad|fiad)[oa]s?\b.*$/i;

const nombrePropio = (s: string): string => titulo(limpiar(partirNombres(s)[0] ?? ''));
/** ¿Es alguien? Una persona que ya tienes o un pariente («tía», «mamá»). */
const esGente = (w: string, ctx: CtxDireccion): boolean => esPersona(w, ctx) || grupoPorDefecto(w) === 'familia';
const conFecha = (s: string, cierre: string): string => (FECHA.test(s) ? s : `${s}${cierre}`).replace(/\s+/g, ' ').trim();

/**
 * Lo que va tras «me pagaron 50k de/por ...» cuando es una cosa y no alguien: «una actividad», «la quincena», «mi trabajo».
 * Con artículo nunca es una persona, salvo que lo que sigue sea un pariente o alguien conocido («la tía», «mi mamá»).
 * Un nombre suelto («de Ana», «de ana») se deja para el camino de las personas.
 */
function cosaDe(resto: string, ctx: CtxDireccion): string | null {
  const ws = limpiar(resto).replace(/^(?:de|del|por)\s+/, '').split(' ').filter(Boolean);
  if (ws.length < 2 || !/^(?:un|una|unos|unas|el|la|los|las|lo|mi|mis)$/.test(ws[0]) || esGente(ws[1], ctx)) return null;
  const corte = ws.findIndex((w, i) => i > 0 && /^(?:que|q|para|porque|pues)$/.test(w));
  return ws.slice(1, corte > 0 ? corte : undefined).join(' ') || null;
}

/**
 * Frases donde lo difícil es saber hacia dónde va la plata o quién es la persona. Lo seguro se reescribe a la forma de siempre
 * («ingreso 50000 encontrado», «presté 20000 a carlos»); lo que tiene dos lecturas razonables se pregunta con botones.
 */
function direccion(t0: string, ctx: CtxDireccion, cierre: string): Naturalizado | null {
  // «presté 5k a juan no a jose»: el «no a jose» corrige a quién, no es parte del nombre
  const t = t0.replace(new RegExp(String.raw`((?<![${L}])a\s+[${L}]+)\s*,?\s+no\s+(?:a|para)\s+[${L}]+(?![${L}])`, 'i'), '$1');
  if (t !== t0) return { texto: t };
  const s = t.trim();
  let m: RegExpExecArray | null;

  // «Recibiste 20.000 de ANA MARIA en tu Nequi», «te transfirieron 30000»: avisos del banco, que hablan de ti en segunda persona
  m = new RegExp(String.raw`${INI}(?:recibiste|te\s+(?:llegaron|lleg[oó]|consignaron|transfirieron|enviaron|giraron|depositaron|pagaron|abonaron))\s+(${MONTO})${FIN}${PESOS}\s*(.*)$`, 'i').exec(s);
  if (m && valorDeMonto(m[1]) > 0) {
    const ws = limpiar(m[2]).replace(/^(?:de|del)\s+/, '').split(' ').filter(w => w && !/^(?:en|a|al|por|tu|su)$/.test(w));
    // sin decir de quién («te transfirieron 30000 a nequi») la fuente es «otros», como en «me consignaron»
    const resto = ws.every(w => cuentaDePalabra(w)) ? [...ws, 'otros'] : ws;
    return { texto: conFecha(`ingreso ${valorDeMonto(m[1])} ${resto.join(' ')}`, cierre) };
  }

  // «vendí la bici 200000»: sin catálogo, vender algo tuyo es plata que entra (con catálogo lo lee ventaDelCatalogo)
  m = new RegExp(String.raw`${INI}vend[ií](?:mos)?\s+(.+)$`, 'i').exec(s);
  const conCatalogo = ctx.config ? vendeProductos({ config: ctx.config }) : false;
  const mv = m ? new RegExp(MONTO, 'i').exec(m[1]) : null;
  if (m && mv && !conCatalogo && valorDeMonto(mv[0]) > 0) {
    const cosa = m[1].replace(mv[0], ' ');
    return { texto: conFecha(`ingreso ${valorDeMonto(mv[0])} venta ${cosa}`, cierre) };
  }

  // «hoy hice un rebusque y me gané 65k»: plata que entra por lo que hiciste
  m = new RegExp(String.raw`(?<![${L}])me\s+gan[eé]\s+(${MONTO})${FIN}`, 'i').exec(s);
  if (m && valorDeMonto(m[1]) > 0) {
    const fuente = /(?<![a-záéíóúñ])(rebusque|camello|chamba|turno|rifa)(?![a-záéíóúñ])/i.exec(s)?.[1] ?? 'otros';
    return { texto: conFecha(`ingreso ${valorDeMonto(m[1])} ${limpiar(fuente)}`, cierre) };
  }

  // «me encontré 50 mil en el parque»
  m = new RegExp(String.raw`${INI}me\s+encontr[eé]\s+(${MONTO})${FIN}`, 'i').exec(s);
  if (m && valorDeMonto(m[1]) > 0) return { texto: `ingreso ${valorDeMonto(m[1])} encontrado${cierre}` };

  // «mi tía me regaló diez mil pesitos para un helado»: un regalo que te dan es plata que entra
  m = new RegExp(String.raw`${INI}(?:(?:mi|mis|el|la)\s+)?(?:([${L}]+)\s+)?me\s+regal(?:o|ó|aron)\s+(${MONTO})${FIN}${PESOS}(.*)$`, 'i').exec(s);
  if (m && valorDeMonto(m[2]) > 0) {
    const quien = m[1] && !esPalabraSuelta(m[1]) ? limpiar(m[1]) : 'regalo';
    const cuenta = cuentaDicha(m[3], ctx);
    return { texto: `ingreso ${valorDeMonto(m[2])} ${quien}${cuenta ? ` ${cuenta}` : ''}${cierre}` };
  }

  // «me pagaron 120 mil de una actividad», «me devolvieron 15k de nequi», «me devolvieron 20k que me debían»: sin una persona
  const sinDebia = s.replace(DEBIA, '').trim();
  // «mk», «parce»: muletillas del comienzo, no la persona que pagó
  m = new RegExp(String.raw`${INI}(?:(?:mk|parce|uy|oe|bro|marica|uff|ve|vea|pues)\s+)?(?:ya\s+)?me\s+(pagaron|devolvieron|reembolsaron|abonaron|pag[oó]|devolvi[oó]|abon[oó])\s+(?:ya\s+)?(?:(?:los|las|el|la)\s+)?(${MONTO})${FIN}${PESOS}\s*(.*)$`, 'i').exec(sinDebia);
  if (m && valorDeMonto(m[2]) > 0) {
    const v = valorDeMonto(m[2]);
    const fuente = /^devol/i.test(m[1]) ? 'devolucion' : /^reemb/i.test(m[1]) ? 'reembolso' : 'otros';
    const resto = limpiarResto(m[3]);
    const cosa = resto ? cosaDe(resto, ctx) : null;
    if (cosa) return { texto: conFecha(`ingreso ${v} ${cosa}`, cierre) };
    const cuenta = resto ? cuentaDicha(resto.replace(/^(?:de|del|en|a|al|por)\s+/i, '').split(/\s+/)[0], ctx) : null;
    if (resto && cuenta) return { texto: `ingreso ${v} ${cuenta} ${fuente}${cierre}` };
    if (!resto) {
      // si alguien te debe, quizá es su abono: se pregunta; si nadie te debe, es plata que entra
      const deudores = (ctx.abiertas?.teDeben ?? []).map(c => ctx.cuentas.find(x => x.tipo === 'persona' && x.clave === c)).filter(c => !!c).slice(0, 4);
      if (!deudores.length) return { texto: `ingreso ${v} ${fuente}${cierre}` };
      return { texto: t, pregunta: { mensaje: `¿Quién te devolvió ${formatear(v)}?`, opciones: [
        ...deudores.map(c => ({ titulo: c.nombre, frase: `${c.nombre} me pagó ${v}${cierre}` })),
        { titulo: 'Nadie que me deba (solo anota el ingreso)', frase: `ingreso ${v} ${fuente}${cierre}` },
      ] } };
    }
  }

  // «presté 10000 a Ana y Luis»: dos personas, y no se sabe si fue a cada una o entre las dos
  m = new RegExp(String.raw`${INI}(?:le\s+|les\s+)?prest[eé]\s+(${MONTO})${FIN}\s+a\s+(${NOMBRES})(.*)$`, 'i').exec(s);
  if (m && valorDeMonto(m[1]) > 0) {
    const nombres = partirNombres(m[2]).filter(n => !esPalabraSuelta(n.split(' ')[0]));
    if (nombres.length >= 2 && nombres.length <= 6) {
      const v = valorDeMonto(m[1]), cada = Math.floor(v / nombres.length);
      const resto = limpiarResto(m[3]);
      const lineas = (x: number) => nombres.map(n => conFecha(`presté ${x} a ${titulo(n)} ${resto}`, cierre)).join('\n');
      const opciones = [{ titulo: `${formatear(v)} a cada uno`, frase: lineas(v) }];
      if (cada > 0) opciones.push({ titulo: `${formatear(cada)} a cada uno (${formatear(v)} en total)`, frase: lineas(cada) });
      return { texto: t, pregunta: { mensaje: `¿Le prestaste ${formatear(v)} a cada uno o ${formatear(v)} entre ${juntar(nombres.map(n => titulo(n)))}?`, opciones } };
    }
  }

  // «le di 20k a carlos para el bus y no me los devuelve»: lo que se espera de vuelta es un préstamo
  m = new RegExp(String.raw`${INI}(?:le\s+)?(?:di|d[ií]|pas[eé]|mand[eé]|envi[eé]|gir[eé])\s+(${MONTO})${FIN}\s+a\s+(${NOMBRE})(.*)$`, 'i').exec(s);
  if (m && valorDeMonto(m[1]) > 0 && DEVOLVER.test(m[3]) && !esPalabraSuelta(m[2].split(' ')[0])) {
    const motivo = limpiarResto(m[3].replace(DEVOLVER, ''));
    return { texto: conFecha(`presté ${valorDeMonto(m[1])} a ${nombrePropio(m[2])} ${motivo}`, cierre) };
  }

  // «le mandé 25k a juan»: puede ser un préstamo, un pago o un regalo; adivinar mal deja un saldo falso con Juan
  m = new RegExp(String.raw`${INI}(?:le\s+)?(?:mand[eé]|envi[eé]|gir[eé])\s+(${MONTO})${FIN}\s+a\s+(?:(?:mi|mis)\s+)?(${NOMBRE})(.*)$`, 'i').exec(s);
  // (si la palabra ya es una persona con categoría aprendida, como «julio», el giro ya tiene su categoría y no se pregunta)
  const primeraPalabra = m ? limpiar(m[2].split(' ')[0]) : '';
  let categoriaFija = false;
  try { categoriaFija = Boolean(primeraPalabra && JSON.parse(ctx.config?.categoria_persona ?? '{}')[`per:${primeraPalabra}`]); } catch { /* config ilegible: se pregunta como siempre */ }
  const aprendidaLaPersona = categoriaFija || (m ? Object.keys(ctx.aprendido ?? {}).some(k => limpiar(k) === primeraPalabra) : false);
  if (m && !aprendidaLaPersona && valorDeMonto(m[1]) > 0 && !esPalabraSuelta(m[2].split(' ')[0])) {
    const v = valorDeMonto(m[1]), n = nombrePropio(m[2]);
    const cuenta = cuentaDicha(m[3], ctx);
    const fin = `${cuenta ? ` ${cuenta}` : ''}${cierre}`;
    return { texto: t, pregunta: { mensaje: `¿Qué fueron los ${formatear(v)} que le mandaste a ${n}?`, opciones: [
      { titulo: 'Se los presté', frase: `presté ${v} a ${n}${fin}` },
      { titulo: 'Le pagué algo', frase: `pagué ${v} a ${n}${fin}` },
      { titulo: 'Se los regalé', frase: `le regalé ${v} a ${n}${fin}` },
    ] } };
  }

  // «quedamos a mano con maría por 15k»: no dice quién le pagó a quién
  m = new RegExp(String.raw`(?:quedamos|qued[eé]|estamos)\s+(?:a\s+mano|en\s+paz|pagos|parejos|a\s+paz\s+y\s+salvo)\s+con\s+(${NOMBRE})(?:\s+(?:por|con)\s+(${MONTO}))?`, 'i').exec(s);
  if (m && !esPalabraSuelta(m[1].split(' ')[0])) {
    const n = nombrePropio(m[1]), v = m[2] ? valorDeMonto(m[2]) : 0;
    const opciones = v > 0
      ? [{ titulo: `${n} me pagó ${formatear(v)}`, frase: `${n} me pagó ${v}${cierre}` }, { titulo: `Le pagué ${formatear(v)} a ${n}`, frase: `pagué ${v} a ${n}${cierre}` }]
      : [];
    opciones.push({ titulo: 'Cerrar la cuenta sin mover plata', frase: `cuadrar con ${limpiar(n)}` });
    return { texto: t, pregunta: { mensaje: `¿Cómo quedaron a mano con ${n}?`, opciones } };
  }

  // «pagué 60k por mí y por ana y luis»: un gasto en partes iguales contigo incluido
  m = new RegExp(String.raw`pagu[eé]\s+(${MONTO})${FIN}\s+(?:por|de)\s+m[ií]\s*,?\s*(?:y\s+)?(?:por\s+)?(${NOMBRES})`, 'i').exec(s)
    ?? new RegExp(String.raw`pagu[eé]\s+(${MONTO})${FIN}\s+por\s+(${NOMBRES})\s+y\s+(?:por\s+)?m[ií](?![${L}])`, 'i').exec(s);
  if (m && valorDeMonto(m[1]) > 0) {
    const nombres = partirNombres(m[2].replace(/(?<![${L}])por\s+/gi, '')).filter(n => !/^(?:mi|m[ií]|yo)$/i.test(n) && !esPalabraSuelta(n.split(' ')[0]));
    if (nombres.length) {
      const { concepto, fecha } = conceptoDe(s);
      return { texto: entre(concepto, valorDeMonto(m[1]), nombres, fecha) };
    }
  }

  // «le presté mi juguete a tomás y me dio 2 mil por cuidárselo»: la única plata de la frase es la que entra
  m = new RegExp(String.raw`^(.*?)\s+y\s+(?:([${L}]+)\s+)?me\s+(dio|dieron|regal[oó]|pag[oó]|pagaron)\s+(${MONTO})${FIN}${PESOS}(.*)$`, 'i').exec(s);
  if (m && !/\d/.test(m[1]) && valorDeMonto(m[4]) > 0 && !/vuelt|devuelta|cambio/i.test(s)) {
    const v = valorDeMonto(m[4]);
    const sujeto = m[2] && !esPalabraSuelta(m[2]) ? m[2] : null;
    const aQuien = [...m[1].matchAll(new RegExp(String.raw`(?<![${L}])a\s+(?:(?:mi|el|la)\s+)?([${L}]+)`, 'gi'))].map(x => x[1]).filter(w => !esPalabraSuelta(w)).pop();
    const quien = sujeto ?? aQuien;
    if (/^pag/i.test(m[3]) && quien) return { texto: conFecha(`${titulo(limpiar(quien))} me pagó ${v}`, cierre) };
    return { texto: conFecha(`ingreso ${v} ${quien ? limpiar(quien) : 'otros'}`, cierre) };
  }
  return null;
}

// ---------------------------------------------------------------- la entrada

/**
 * Pasa una frase por todas las reglas del lenguaje natural. Devuelve null si no hay nada que cambiar; si algo cambió,
 * el texto nuevo; y si la frase puede significar dos cosas, una `pregunta` con las opciones.
 */
export function naturalizar(texto: string, ctx: CtxDireccion): Naturalizado | null {
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
  const dir = direccion(t, ctx, FECHA.exec(t)?.[0] ? ` ${FECHA.exec(t)![0]}` : '');
  if (dir) return con(dir);
  const comp = compartidos(t);
  if (comp) return con(comp);
  const sinMonto = cobroSinMonto(t, ctx);
  if (sinMonto) return { texto: t, error: sinMonto };
  // antes de los verbos: «retiré 40k de nequi pero los dejé en el cajero» no es un retiro que llegó al bolsillo
  const quieta = plataQueNoLlego(t, ctx, FECHA.exec(t)?.[0] ? ` ${FECHA.exec(t)![0]}` : '');
  if (quieta) return quieta;
  const v = verbos(t, ctx);
  if (v) return con({ texto: v });
  const duda = dudas(t, ctx, FECHA.exec(t)?.[0] ? ` ${FECHA.exec(t)![0]}` : '');
  if (duda) return duda;
  return unidad || cambioJerga ? con({ texto: t }) : null;
}

// ---------------------------------------------------------------- 7. plata que no llegó a donde parece

/**
 * Dos frases que parecen transferencias y no lo son. «Retiré 40k de nequi pero los dejé en el cajero»: salió del banco y no llegó
 * al bolsillo. «Le pasé mi plata a mi hermana para que me la guarde»: sigue siendo tuya, pero ya no está en tus cuentas.
 * No se adivina: se pregunta qué pasó, con un botón por cada lectura.
 */
function plataQueNoLlego(t: string, ctx: CtxDireccion, cierre: string): Naturalizado | null {
  const s = limpiar(t);
  const v = valorDeMonto(new RegExp(MONTO, 'i').exec(s)?.[0] ?? '');
  if (!v) return null;
  if (/\b(?:saque|retire|retiro)\b/.test(s) && /\b(?:deje|olvide|quedo|quedaron)\b.*\bcajero\b/.test(s)) {
    const banco = ctx.cuentas.find(c => c.id === cuentaDicha(s, ctx) && c.id !== 'efectivo') ?? cuentasDeBanco(ctx)[0];
    if (!banco) return null;
    return { texto: t, pregunta: { mensaje: `¿Qué pasó con los ${formatear(v)} que dejaste en el cajero?`, opciones: [
      { titulo: 'Los recuperé', frase: `cambio ${v} ${banco.clave} a efectivo${cierre}` },
      { titulo: 'Se perdieron', frase: `plata perdida en el cajero ${v} ${banco.clave}${cierre}` },
      { titulo: 'El cajero no los entregó', frase: `=No anoto nada: si el cajero no te dio la plata, el saldo de ${banco.nombre} sigue igual. Si el banco te la descontó, reclama y anótala cuando sepas qué pasó.` },
    ] } };
  }
  const guarda = /\ba\s+(mi\s+|la\s+|el\s+|su\s+)?([a-zñ]+)\s+para\s+que\s+(?:me\s+)?(?:la|lo|las|los)\s+(?:guarde|guardara|cuide|cuidara|tenga|tuviera)\b/.exec(s);
  if (guarda && /\b(?:pase|di|entregue|deje|mande)\b/.test(s)) {
    const n = guarda[2];
    const quien = guarda[1] ? `tu ${n}` : titulo(n);
    return { texto: t, pregunta: { mensaje: `¿Cómo anoto los ${formatear(v)} que tiene ${quien}?`, opciones: [
      { titulo: 'Me los guarda y me los devuelve', frase: `preste ${v} a ${n}${cierre}` },
      { titulo: 'Se los di', frase: `le regale ${v} a ${n}${cierre}` },
      { titulo: 'Fueron a otra cuenta mía', frase: '=Si la plata quedó en una cuenta tuya, escríbelo así: «pasé 30000 de efectivo a nequi».' },
    ] } };
  }
  return null;
}
