/**
 * Los defectos de la auditoría 8.x que se cerraron con una pregunta o una respuesta en vez de un movimiento adivinado:
 * el vuelto dicho como ingreso, mercancía que llega, «me debe» sin que salga plata, «pero no en X», «con tarjeta» sin decir
 * cuál, el cajero con varias cuentas, «2 cafés de 3000», un monto de millones en una comida, la calculadora, fechas mes/día y
 * nombres propios en minúscula. Cada regla devuelve la pregunta con botones, una respuesta o la frase reescrita.
 */
import { formatear, hallarMontos } from './dinero.ts';
import { hallarCuentas, categorizar } from './entidades.ts';
import { limpiarDictado } from './dictado.ts';
import { hablada } from './habladas.ts';
import { dividirTodo } from './lineas.ts';
import { narrar } from './narrativa.ts';
import { interpretar } from './parser.ts';
import { limpiar } from './texto.ts';
import type { Contexto } from './tipos.ts';

export interface Auditada {
  texto?: string;
  pregunta?: { mensaje: string; opciones: { titulo: string; frase: string }[] };
  reescribir?: string;
  comando?: { comando: string; arg: string };
}

const monto1 = (t: string): number | null => hallarMontos(t).find(m => m.explicito && m.moneda !== 'USD')?.valor ?? null;
const peso = (n: number): string => formatear(n, 'COP');

/** Nombres de pila de uso común: escritos en minúscula («con ana») siguen siendo una persona. */
const NOMBRES = new Set(['ana', 'luis', 'juan', 'pedro', 'maria', 'carlos', 'jose', 'luisa', 'laura', 'sofia', 'andres', 'david', 'camila', 'daniel', 'paula', 'diana', 'karla', 'jorge', 'mateo', 'felipe', 'valentina', 'sara', 'julian', 'pipe', 'nicolas', 'lucia', 'marta', 'miguel', 'sergio', 'diego', 'carolina', 'natalia', 'esteban', 'faber', 'ivan', 'ricardo', 'alejandra', 'paola', 'fernando', 'gabriel', 'manuel', 'oscar', 'hugo', 'rosa', 'elena']);
const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);
const PALABRAS: Record<string, number> = { uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };

/** Evalúa una cuenta de solo números y + - x /. Devuelve null si trae otra cosa. */
function evaluar(expr: string): number | null {
  const partes = expr.replace(/\s+/g, ' ').trim().replace(/\bpor\b/g, '*').replace(/\bmas\b/g, '+').replace(/\bmenos\b/g, '-').replace(/ x /g, ' * ').split(/ ?([+\-*/]) ?/);
  const num = (s: string): number | null => { const m = hallarMontos(s.trim()).find(x => x.explicito); return m && /^[\d.,]+\s?(?:k|mil|lucas?)?$/.test(s.trim()) ? m.valor : /^\d+$/.test(s.trim()) ? Number(s) : null; };
  if (partes.length < 3 || partes.length % 2 === 0) return null;
  const nums: number[] = []; const ops: string[] = [];
  for (let i = 0; i < partes.length; i++) {
    if (i % 2 === 0) { const n = num(partes[i]); if (n === null) return null; nums.push(n); } else ops.push(partes[i]);
  }
  // primero * y /, después + y -
  for (let i = 0; i < ops.length;) {
    if (ops[i] === '*' || ops[i] === '/') {
      if (ops[i] === '/' && nums[i + 1] === 0) return null;
      nums.splice(i, 2, ops[i] === '*' ? nums[i] * nums[i + 1] : nums[i] / nums[i + 1]); ops.splice(i, 1);
    } else i++;
  }
  let total = nums[0];
  ops.forEach((o, i) => { total = o === '+' ? total + nums[i + 1] : total - nums[i + 1]; });
  return Math.round(total);
}

export function auditar(texto: string, ctx: Contexto, confirmado = false): Auditada | null {
  // Defecto 35: un mensaje larguísimo con un solo monto: se anota solo la parte donde está el monto (con el día si lo dice al principio)
  if (texto.length > 400) {
    const unico = hallarMontos(limpiar(texto)).filter(m => m.explicito);
    if (unico.length === 1) {
      const partes = texto.split(/(?<=[,.;])\s+/);
      const donde = partes.findIndex(p => /\d/.test(p));
      let trozo = partes[donde].replace(/[.;]+$/, '').replace(/^(?:y|pero|luego|finalmente|al final)\s+/i, '');
      // un trozo todavía muy largo (sin comas): solo las palabras de alrededor del monto
      if (trozo.length > 120) {
        const ws = trozo.split(/\s+/);
        const k = ws.findIndex(w => /\d/.test(w));
        trozo = ws.slice(Math.max(0, k - 2), k + 4).join(' ');
      }
      const dia = texto.trim().match(/^(ayer|anoche|anteayer|antier|hoy)\b/i)?.[1];
      return { reescribir: `${dia && !/^(?:ayer|anoche|anteayer|antier|hoy)\b/i.test(trozo) ? dia + ' ' : ''}${trozo}` };
    }
  }
  if (texto.length > 160) return null;
  let original = texto.trim();
  // una cuenta enredada seguida de una pregunta («... ¿cuánto me debe?»): primero se anota lo que pasó, y después se pregunta
  const iq = original.indexOf('¿');
  if (iq > 25) {
    const antes = original.slice(0, iq).trim().replace(/[.;,]\s*$/, '');
    const hechos = /\b(?:pague|gaste|preste|debia|debo|me pago|me paso|me mando|me debe|me debia|me devolvio|le devolvi|saque|movi|compre|puse|recibi|le mande|le di)\b/.test(limpiar(antes));
    const pideTotales = /^¿\s*(?:cuanto|cuánto|quien|quién|cuantos|cuántos|cuanta|cuánta|como (?:queda|va|quedo)|cómo (?:queda|va|quedó)|me alcanza|que me debe|qué me debe)/i.test(original.slice(iq));
    if ((limpiar(antes).match(/\d+/g)?.length ?? 0) >= 1 && hechos && pideTotales && !/^confirmo /i.test(antes)) {
      return { pregunta: { mensaje: '¿Anoto primero lo que pasó? Son dos cosas en un mensaje: lo que pasó y una pregunta. Lo anoto sin la pregunta y, cuando lo confirmes, me preguntas lo que quieras («deudas», «cuánto llevo en mecato»...).', opciones: [{ titulo: 'Sí, anotar lo que pasó', frase: antes }, { titulo: 'No', frase: 'no' }] } };
    }
  }
  // lo que se pide en contra de sí mismo: «registra 10k... no guardes ese movimiento», «no registres nada, pero... guarda»
  const tn = limpiar(original);
  if (/\bno (?:lo |ese |el )?(?:guardes?|registres?)\b/.test(tn) && /\b(?:registra|guarda|anota|guarde|registre)\b/.test(tn.replace(/\bno (?:lo |ese |el )?(?:guardes?|registres?)\b/g, ''))) {
    return { texto: '¿Quieres que lo anote o no? Me dices dos cosas contrarias en el mismo mensaje. Escríbelo en una sola frase («registra 10k de almuerzo» o «no lo registres») y no doy nada por guardado hasta entonces.' };
  }
  // un tope negativo, o un gasto de cero pesos, no existen
  if (/\b(?:tope|presupuesto)\b/.test(tn) && /(?:^|\s)-\s*\d/.test(tn)) return { texto: '¿Quisiste decir un tope positivo? Un tope negativo no existe. Escríbelo, por ejemplo, «tope comida 50000».' };
  if (/^(?:gaste|pague|compre)\s+0+\s*(?:pesos)?\b/.test(tn) || (/\b0+\s*pesos\b/.test(tn) && !/[1-9]/.test(tn.replace(/[^0-9]/g, '')))) return { texto: 'El monto tiene que ser mayor que cero: un gasto de $0 no hay nada que anotar. Si quisiste decir otra cifra, escríbela con el monto.' };
  const t = limpiar(original);
  const dinero = ctx.cuentas.filter(c => c.tipo === 'dinero' && c.moneda === 'COP');

  // Ronda 7, voz: lo que el reconocedor deja torcido
  const sinNo = original.replace(/[,\s]+no\s+d[eé]bito\s*$/i, '');
  if (sinNo !== original) return { reescribir: sinNo };
  // «Cinco mil coma cincuenta»: ¿$5.000,50 o $5.050?
  const coma = t.match(/\b(\d{3,})\s+coma\s+(\d{1,3}|[a-z]+)\b/);
  if (coma) {
    const dec = PALABRAS[coma[2]] ?? Number(coma[2]);
    const entero = Number(coma[1]);
    if (Number.isFinite(dec)) {
      return { pregunta: { mensaje: `¿Quisiste decir ${peso(entero)},${String(dec).padStart(2, '0')} (los centavos no se llevan: quedaría ${peso(entero)}) o ${peso(entero + dec)}?`, opciones: [{ titulo: `${peso(entero)}`, frase: `gasto ${entero}` }, { titulo: `${peso(entero + dec)}`, frase: `gasto ${entero + dec}` }] } };
    }
  }
  // «Ponle cien mil a transporte»: ¿tope o gasto?
  const ponle = t.match(/^ponle\s+(\d\S*)\s+(?:a|en|para)\s+([a-z ]+)$/);
  if (ponle) {
    const catId = categorizar(ponle[2], ctx);
    const cat = ctx.cuentas.find(x => x.id === catId && x.tipo === 'categoria');
    const v = monto1(ponle[1]);
    if (cat && v) return { pregunta: { mensaje: `¿Quieres fijar el tope de ${cat.nombre} en ${peso(v)} al mes, o anotar un gasto de ${peso(v)}?`, opciones: [{ titulo: `Tope de ${cat.nombre}`, frase: `tope ${cat.clave} ${v}` }, { titulo: 'Un gasto', frase: `${cat.clave} ${v}` }] } };
  }
  // «Aboné treinta lucas a lo que le debo a Jorge»: es un pago de esa deuda
  const abonoDeuda = original.match(/^(?:abon[eé]|pagu[eé])\s+(.+?)\s+a lo que (?:le )?debo a\s+([A-Za-zÁÉÍÓÚáéíóúñ]+)\s*$/i);
  if (abonoDeuda && monto1(limpiar(abonoDeuda[1]))) return { reescribir: `le pague ${monto1(limpiar(abonoDeuda[1]))} a ${abonoDeuda[2]}` };
  // «Faber me devolvió veinte de los cincuenta que le presté»: dichos cortos, son miles
  const devolvio = t.match(/^([a-z]+) me devolvio (\d{1,3}|[a-z]+) de los (\d{1,3}|[a-z]+) que le (?:preste|di|debia)/);
  const aDevuelto = devolvio ? (PALABRAS[devolvio[2]] ?? Number(devolvio[2])) : NaN;
  if (devolvio && aDevuelto > 0 && aDevuelto < 1000) return { reescribir: `${cap(devolvio[1])} me pago ${aDevuelto * 1000}` };
  // «Le pagué a Laura veinte mil, ella me pagó otros diez»: dos movimientos de sentido contrario
  const ida = original.match(/^(.+?\d{3,}.*?),?\s+(?:ella|[eé]l)\s+me\s+pag[oó]\s+(?:otros|otras)?\s*(.+)$/i);
  if (ida) {
    const quien = ida[1].match(/\ba\s+([A-ZÁÉÍÓÚ][A-Za-záéíóúñ]+)/)?.[1];
    const primero = monto1(limpiar(ida[1])) ?? 0;
    const lo = monto1(limpiar(ida[2])) ?? (PALABRAS[limpiar(ida[2])] ?? 0) * (primero >= 1000 ? 1000 : 1);
    if (quien && lo) return { reescribir: `${ida[1].trim()}; ${quien} me pago ${lo}`, comando: undefined };
  }
  // «Eh... pagué... [ruido] ... treinta mil... a Laura»: no se sabe si lo envió o lo recibió
  if (/\[ruido\]|\.{3}.*\.{3}/.test(original) && monto1(t)) {
    const quien = original.match(/\ba\s+([A-ZÁÉÍÓÚ][A-Za-záéíóúñ]+)/)?.[1];
    const v = monto1(t) as number;
    if (quien) return { pregunta: { mensaje: `Se cortó el audio. ¿Le pagaste ${peso(v)} a ${quien}, o te los pagó ella o él a ti?`, opciones: [{ titulo: `Le pagué yo`, frase: `le pague ${v} a ${quien}` }, { titulo: `Me pagó`, frase: `${quien} me pago ${v}` }] } };
  }
  // «pagué con 100 mil en efectivo, me dieron 22 mil»: el pago y el vuelto son de la caja, no movimientos
  const sinCaja = original.replace(/,?\s*(?:y\s+)?pagu[eé] con \S+(?:\s(?:mil|k))?\s+en efectivo,?\s*(?:y\s+)?me dieron \S+(?:\s(?:mil|k))?(?:\s+de\s+(?:cambio|vuelto))?,?/i, ',');
  if (sinCaja !== original) return { reescribir: sinCaja.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim() };
  // Defecto 19: la calculadora responde y no anota
  const cuenta = t.match(/^(?:cuanto es|cuanto da|cuanto son|cuanto suma|calcula|suma)\s+(.+)$/);
  if (cuenta) {
    const r = evaluar(cuenta[1]);
    if (r !== null) return { texto: `🧮 ${cuenta[1].trim()} = ${peso(r)}. Solo hice la cuenta: no anoté nada.` };
  }
  // Defecto 28: «cuánto me deben»
  if (/^cuanto (?:me )?(?:deben|debe(?:n)?(?: plata)?)$/.test(t)) return { reescribir: 'quien me debe' };

  // Defecto 3: el vuelto no es plata nueva
  if (/\b(?:me dieron|me dio|me devolvieron|recibi)\b.*\b(?:de cambio|el cambio|de vuelto|el vuelto|de sencillo)\b/.test(t) && monto1(t)) {
    const v = monto1(t) as number;
    return { pregunta: { mensaje: `¿Esos ${peso(v)} son el vuelto de algo que pagaste? Si lo son, no es plata nueva: se anota en la tarjeta de ese gasto (con cuánto pagaste) y no como un ingreso.`, opciones: [{ titulo: 'Es el vuelto: no anotar', frase: 'no' }, { titulo: `Es plata que me dieron (${peso(v)})`, frase: `ingreso ${v} otros` }] } };
  }
  // Defecto 4: «llegaron 1000 galletas» es mercancía, no plata
  const llegada = t.match(/^(?:me )?(?:llegaron|entraron)\s+(\d{4,})\s+(?!(?:de|del|a|al|en|para|por|con)\b)([a-z]+(?: [a-z]+)?)$/);
  if (llegada && !/\b(?:pesos|nequi|daviplata|bancolombia|banco|efectivo|cuenta)\b/.test(t)) {
    if (ctx.config.catalogo && new RegExp(String.raw`"nombre":"[^"]*${llegada[2].split(' ')[0].slice(0, 5)}`, 'i').test(ctx.config.catalogo)) return { comando: { comando: 'existencias_sumar', arg: `${llegada[2]}|${llegada[1]}` } };
    return { pregunta: { mensaje: `¿Son ${llegada[1]} ${llegada[2]} (mercancía que llegó) o ${peso(Number(llegada[1]))} de plata?`, opciones: [{ titulo: `Son ${peso(Number(llegada[1]))} de plata`, frase: `ingreso ${llegada[1]} ${llegada[2]}` }, { titulo: 'Son unidades: ver existencias', frase: 'existencias' }] } };
  }
  // Defecto 7: «gasté 5000 pero no en mecato»
  const noEn = t.match(/\bpero no (?:fue )?en ([a-z]+(?: [a-z]+)?)$/);
  if (noEn && monto1(t) && /\b(?:gaste|pague|compre)\b/.test(t)) {
    const v = monto1(t) as number;
    const excluida = categorizar(noEn[1], ctx);
    const cats = ctx.cuentas.filter(c => c.tipo === 'categoria' && c.id !== excluida).slice(0, 7);
    return { pregunta: { mensaje: `Entendido, no fue en ${noEn[1]}. ¿En qué categoría fueron los ${peso(v)}?`, opciones: cats.map(c => ({ titulo: c.nombre, frase: `${c.clave} ${v}` })) } };
  }
  // Defecto 9: «con tarjeta» sin decir cuál
  if (/\bcon (?:la |mi |una )?tarjeta(?: de (?:credito|debito)| debito| credito)?\b/.test(t) && monto1(t) && !hallarCuentas(t, ctx).length
    && !ctx.cuentas.some(c => c.tipo === 'persona' && c.clave === 'tarjeta') && !/\b(?:saque|retire|ahorros)\b/.test(t)) {
    const base = original.replace(/\s*con (?:la |mi |una )?tarjeta(?: de (?:cr[eé]dito|d[eé]bito)| d[eé]bito| cr[eé]dito)?/i, '').trim();
    return { pregunta: { mensaje: '¿Con cuál cuenta pagaste con la tarjeta? Si es una tarjeta de crédito, agrega la persona «Tarjeta» para llevar su deuda.', opciones: dinero.filter(c => c.id !== 'monedas').slice(0, 6).map(c => ({ titulo: c.nombre, frase: `${base} ${c.clave}` })) } };
  }
  // Defecto 10: «saqué 100k del cajero» con varias cuentas
  const cajero = t.match(/^(?:saque|retire)\s+(\d\S*(?: mil| k)?)\s+(?:del|de el|en el) cajero$/);
  if (cajero) {
    const bancos = dinero.filter(c => c.id !== 'efectivo' && c.id !== 'monedas' && c.enDisponible !== false);
    if (bancos.length > 1) return { pregunta: { mensaje: `¿De cuál cuenta sacaste ${cajero[1]}?`, opciones: bancos.slice(0, 6).map(c => ({ titulo: c.nombre, frase: `saque ${cajero[1]} de ${c.clave} a efectivo` })) } };
  }
  // Defecto 13: «compré 2 cafés de 3000»
  const cantidad = t.match(/^(?:compre|pague|gaste)?\s*(\d{1,2}|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+([a-z]+)\s+de\s+(\d[\d.,]*(?:\s?(?:k|mil|lucas?))?)$/);
  if (cantidad) cantidad[1] = String(PALABRAS[cantidad[1]] ?? cantidad[1]);
  if (cantidad && Number(cantidad[1]) >= 2 && !/\b(?:cada|c\/u|total)\b/.test(t)) {
    const v = monto1(cantidad[3]);
    if (v) return { pregunta: { mensaje: `¿Los ${peso(v)} son por los ${cantidad[1]} ${cantidad[2]} o por cada uno?`, opciones: [{ titulo: `En total: ${peso(v)}`, frase: `${cantidad[2]} ${v}` }, { titulo: `Cada uno: ${peso(v * Number(cantidad[1]))}`, frase: `${cantidad[1]} ${cantidad[2]} a ${v} cada una` }] } };
  }
  // Defecto 25: 10/15 es mes/día; aquí se escribe día/mes
  const md = original.match(/\b(\d{1,2})\/(\d{1,2})\b(?!\/)/);
  if (md && Number(md[2]) > 12 && Number(md[1]) <= 12 && Number(md[2]) <= 31) {
    return { pregunta: { mensaje: `«${md[0]}» no existe: aquí la fecha se escribe día/mes. ¿Quisiste decir el ${md[2]}/${md[1]} (${md[2]} del mes ${md[1]})?`, opciones: [{ titulo: `Sí, el ${md[2]}/${md[1]}`, frase: original.replace(md[0], `${md[2]}/${md[1]}`) }, { titulo: 'No', frase: 'no' }] } };
  }
  // Defecto 24: dos movimientos, cada uno con su cuenta («... con Nequi y el taxi 7000 en efectivo»)
  const dos = original.match(/^(.+?\d[\d.,]*(?:\s?(?:k|mil|lucas?))?.*?\s(?:con|en|por)\s+[A-Za-zñ]+)\s+y\s+(?:el |la |los |las )?([A-Za-zñ]{3,}\s+\d[\d.,]*(?:\s?(?:k|mil|lucas?))?(?:\s+(?:en|con|por)\s+[A-Za-zñ]+)?)$/i);
  if (dos && /\b(?:pague|gaste|compre)\b/.test(t)) return { reescribir: `${dos[1]}; ${dos[2]}` };
  // Defecto 26: un «porque ayer...» explica, no es la fecha
  const porque = original.match(/^(.*?\d.*?)\s+(?:porque|ya que|pues)\s+(?:ayer|anoche|anteayer|antier|hoy)\b.*$/i);
  if (porque) return { reescribir: porque[1].trim() };
  // Defecto 35: un mensaje larguísimo con un solo monto se pregunta en corto
  // Defecto 22 y 23: nombres propios en minúscula y «con Ana y Luis»
  const conGente = original.match(/^(.+?\s\d[\d.,]*(?:\s?(?:k|mil|lucas?))?)\s+con\s+([A-Za-zÁÉÍÓÚáéíóúñ]+)(?:\s+y\s+([A-Za-zÁÉÍÓÚáéíóúñ]+))?$/);
  if (conGente && !/\bentre\b/i.test(conGente[1]) && (!/\b(?:pague|invite|compre|gaste)\b/i.test(conGente[1]) || (conGente && /^(?:almuerzo|cena|comida|desayuno|cine|pizza)\b/i.test(conGente[1])))) {
    const [, base, a, b] = conGente as unknown as string[];
    const A = NOMBRES.has(limpiar(a)) ? cap(a.toLowerCase()) : null;
    const B = b ? (NOMBRES.has(limpiar(b)) || /^[A-ZÁÉÍÓÚ]/.test(b) ? cap(b.toLowerCase()) : null) : null;
    if (A && b && B) return { reescribir: `${base} entre ${A}, ${B} y yo` };
    if (A && !b && a !== A) return { reescribir: `${base} con ${A}` };
  }
  return null;
}

/**
 * Varias operaciones enredadas en una sola frase («saqué 200k con 4k de comisión, pagué 60k entre tres y Laura me pasó su parte»):
 * lo que las reglas no alcanzan a partir bien se propone por separado, con un botón, en vez de anotar la mitad. Va después de
 * las reglas que sí saben partir (traslados, casa, narrativas) y no toca lo del efectivo (billete, vuelto, monedas).
 */
export function enredado(texto: string, ctx: Contexto, confirmado = false): Auditada | null {
  if (confirmado || /\n/.test(texto) || texto.length < 70 || texto.length > 420) return null;
  if (/billete|monedas?|vuelto|\bcambio\b|pagu[eé] con/i.test(texto)) return null;
  const nombres = ctx.cuentas.filter(c => c.tipo === 'dinero').map(c => c.clave);
  const dictado = limpiarDictado(texto, ctx);
  if (hablada(dictado)) return null; // las cuentas entre amigos ya tienen su propio camino (habladas.ts)
  const hechas = narrar(dictado, nombres);
  const nums = [...limpiar(dictado).matchAll(/(?<![\d/:])\d[\d.,]*(?:\s?(?:k|mil))?(?![\d/:])/g)].length;
  const piezas = (hechas?.length ?? 0) >= 2 ? (hechas as string[]) : dividirTodo(dictado, nombres);
  const algunaNoSirve = nums >= 2 && piezas.length >= 2 && piezas.some(x => { try { return interpretar(x, ctx).clase === 'error'; } catch { return true; } });
  if (!(((hechas?.length ?? 0) < 2 && nums >= 3 && piezas.length < nums) || algunaNoSirve)) return null;
  const trozos: string[] = [];
  for (const p of dictado.split(/,\s*|\s+(?:luego|despu[eé]s)\s+|\s+y\s+(?=(?:con|hoy|aparte|tambi[eé]n|de ah[ií]|yo)\b)/i).map(x => x.trim()).filter(Boolean)) {
    if (/\d/.test(p) || !trozos.length) trozos.push(p); else trozos[trozos.length - 1] += ', ' + p;
  }
  if (trozos.length < 2) return null;
  return { pregunta: { mensaje: `Veo ${nums} cifras y varias operaciones enredadas en una frase. ¿Las anoto por separado así?\n${trozos.map(x => '• ' + x).join('\n')}`, opciones: [{ titulo: 'Sí, por separado', frase: trozos.join('; ') }, { titulo: 'No, las escribo yo', frase: 'no' }] } };
}
