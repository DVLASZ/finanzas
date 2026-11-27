/**
 * Aclaraciones de la conversación: lo que la persona dice después de ver una tarjeta para arreglarla sin escribir
 * todo otra vez («mentiras, fue en nequi», «eran 21 mil», «no, fue un regalo», «el segundo fue 8000»).
 *
 * Todo es puro: recibe la propuesta y el texto y devuelve la propuesta nueva (o un aviso). El bot decide dónde se
 * aplica (la tarjeta pendiente, un movimiento de la cola o lo recién guardado).
 */
import { interpretar, type Propuesta } from './parser.ts';
import { aplicarCambio } from './parser.ts';
import { hallarMontos, aMinor, formatear } from './dinero.ts';
import { categoriaPorNombre, hallarCuentas } from './entidades.ts';
import { hallarFecha } from './fechas.ts';
import { capitalizar, limpiar, titulo } from './texto.ts';
import type { Contexto } from './tipos.ts';

export type Aclarado = { propuesta: Propuesta; nota: string; referente: boolean } | { aviso: string; referente: boolean };

/** Muletillas del comienzo que anuncian una corrección: se quitan y dejan marcado que es una aclaración. */
const RE_ENTRADA = /^(?:mentiras|perdon|perdona|espera|esperate|ah|ay|uy|oye|ojo|corrijo|corrige|corregir|correccion|me equivoque|error|no(?! me\b)|mejor|y|pero|eh|bueno|ya|ahh|ups)\b\s*/;
/** «ese», «eso»: hablan de un movimiento sin decir cuál. */
const RE_REFERENTE = /^(?:ese|eso|esa|este|esto|esta)\b\s*/;
/** Palabras que suenan a una cuenta que no está creada. */
const RE_CUENTA_RARA = /\b(?:tarjeta|credito|debito|banco|bancolombia|davivienda|bbva|nu|nubank|ahorros|cuenta|transferencia)\b/;

const pesos = (p: Propuesta): number => (p.moneda === 'COP' ? p.monto : p.monto / 100);

/** «30» en una cena de 90.000 son 30 mil: los números pequeños se leen en miles si caben en el total. */
function escalar(valor: number, total: number): number {
  return valor < 1000 && valor * 1000 <= total ? valor * 1000 : valor;
}

/** La palabra tal como la escribió la persona (con mayúsculas y tildes), buscada por su forma limpia. */
function original(texto: string, limpia: string, mayuscula = true): string {
  const w = texto.split(/[\s,.;:!?¡¿«»"]+/).find(x => limpiar(x) === limpia);
  if (!w) return mayuscula ? titulo(limpia) : limpia;
  return mayuscula ? capitalizar(w) : w;
}

/** Varias palabras tal como se escribieron: «mi mama» vuelve a ser «mi mamá». */
const originales = (texto: string, limpias: string, mayuscula = true): string =>
  limpias.split(' ').map(w => original(texto, w, mayuscula)).join(' ');

/** Quita las muletillas del comienzo. */
function sinEntrada(t: string): { r: string; marcado: boolean; referente: boolean } {
  let r = t;
  let marcado = false;
  let referente = false;
  for (let i = 0; i < 6; i++) {
    const m = r.match(RE_ENTRADA) ?? r.match(RE_REFERENTE);
    if (!m) break;
    if (RE_REFERENTE.test(r)) referente = true;
    marcado = true;
    r = r.slice(m[0].length).trim();
  }
  return { r, marcado, referente };
}

const VERBO = /^(?:fue|fueron|era|eran|es|son|salio|salieron|costo|costaron|valio|valieron|quedo|quedaron)\b\s*/;

/**
 * Las correcciones dichas con más palabras se vuelven la frase corta que ya entiende `aclarar`: «ponle 9.500 mejor» es «fue 9.500»,
 * «eran 18k no 15k» es «eran 18k», «no fue en efectivo fue por nequi» es «fue por nequi».
 */
function afinar(r: string): string {
  let s = r.replace(/\s+(?:mejor|por favor|nomas|no mas)$/, '');
  s = s.replace(/^(?:ponle|ponlo|pon|ponla|dejalo en|dejala en|dejalo|cambialo a|cambiala a|cambiale|cambialo|cambiala)\s+/, 'fue ');
  // «fue en efectivo fue por nequi»: manda lo último que se dijo
  const cl = s.split(/\s+(?=(?:fue|fueron|era|eran|es)\s)/);
  if (cl.length > 1 && /^(?:fue|fueron|era|eran|es)\b/.test(cl[0])) s = cl[cl.length - 1];
  // «eran 18k no 15k», «fue ayer no hoy»: lo que va después de «no» es lo que se descarta
  s = s.replace(/^((?:fue|fueron|era|eran|es|son)?\s*\S.*?)\s+no\s+(?:era\s+|fue\s+|eran\s+)?(?:\d[\d.,]*\s?(?:k|mil|lucas?)?|hoy|ayer|antier|[a-z]+)$/, '$1');
  return s;
}

/** Una propuesta nueva armada con una frase, conservando la cuenta, la fecha y el evento de la tarjeta. */
function rehacer(p: Propuesta, frase: string, ctx: Contexto): Propuesta | null {
  const r = interpretar(frase, ctx);
  if (r.clase !== 'movimiento') return null;
  return { ...r.propuesta, cuentaId: p.cuentaId ?? r.propuesta.cuentaId, ocurridoEn: p.ocurridoEn, etiqueta: p.etiqueta, mensajeOriginal: p.mensajeOriginal };
}

/** Las personas que nombra la tarjeta (la principal y las del reparto). */
const personasDe = (p: Propuesta): string[] => [...(p.persona ? [p.persona] : []), ...(p.personas ?? []).map(x => x.nombre)];

/** Un gasto compartido con estas personas; lo que no es sobre ellas (la categoría, el recorrido) sigue preguntándose. */
function compartido(p: Propuesta, personas: { nombre: string; monto: number }[]): Propuesta {
  const quitar = new Set(['grupo', 'rol', 'apodo', 'persona', 'cobro']);
  // la tarjeta del compartido ya muestra tu parte y lo que debe cada uno: no hace falta un aviso
  return {
    ...p, tipo: 'compartido', personas, persona: undefined, pedirGrupo: undefined, grupoPersona: undefined, pagoOtro: undefined,
    faltantes: p.faltantes.filter(f => !quitar.has(f.campo)), avisos: [],
  };
}

/**
 * Lee una aclaración sobre una tarjeta. Devuelve la propuesta cambiada con una nota corta, un aviso cuando se
 * entiende qué quiere pero no se puede (una cuenta que no existe), o null si el texto no es una aclaración.
 */
export function aclarar(p: Propuesta, texto: string, ctx: Contexto): Aclarado | null {
  const base = sinEntrada(limpiar(texto));
  const { marcado, referente } = base;
  const r = afinar(base.r);
  if (!r) return null;
  const monto = formatear(p.monto, p.moneda);
  const listo = (propuesta: Propuesta, nota: string): Aclarado => ({ propuesta, nota, referente });

  // ---- qué fue: regalo, préstamo o deuda
  if (/^(?:(?:fue|era|es) (?:un |una )?regalo|se (?:lo|la|los|las) regale|no me (?:lo|la|los|las) (?:va a )?devuelve)$/.test(r)
    && (p.tipo === 'prestamo' || p.tipo === 'gasto')) {
    const quien = p.persona;
    const nueva = quien ? rehacer(p, `le regalé ${pesos(p)} a ${quien}`, ctx) : { ...p, tipo: 'gasto' as const, categoriaId: 'cat:regalos', faltantes: p.faltantes.filter(f => f.campo !== 'categoria') };
    if (nueva) return listo(nueva, 'Listo, quedó como regalo: es un gasto y nadie te queda debiendo.');
  }
  if (/^(?:me (?:lo|la|los|las) (?:devuelve|devuelven|va a devolver|van a devolver|paga|pagan|va a pagar)|(?:fue|era|es) (?:un )?prestamo$)/.test(r)
    && p.tipo === 'gasto') {
    const quien = p.persona ?? /\ba (?:mi |mis )?([a-z]+(?: [a-z]+)?)$/.exec(limpiar(p.concepto))?.[1];
    if (!quien) return { aviso: '¿A quién se lo prestaste? Escríbemelo así: «le presté 70000 a Juan».', referente };
    const nueva = rehacer(p, `le presté ${pesos(p)} a ${quien}`, ctx);
    if (nueva) return listo(nueva, `Listo, quedó como préstamo: ${nueva.persona ?? titulo(quien)} te debe ${monto}.`);
  }
  const deuda = /^(?:fue|era|es) (?:un )?prestamo (?:de|que me hizo|que me dio) (.+)$/.exec(r);
  if (deuda && p.tipo === 'ingreso') {
    const nueva = rehacer(p, `${originales(texto, deuda[1], false)} me prestó ${pesos(p)}`, ctx);
    if (nueva && nueva.tipo === 'deuda') return listo(nueva, `Listo, quedó como préstamo de ${nueva.persona}: le debes ${monto}.`);
  }

  // ---- el reparto: «mitad y mitad», «Ana me da 30 y Luis 30»
  if (/^(?:ponle |ponlo |pon |que sea |fue |era |es |lo pagamos |pagamos )?(?:a medias|mitad y mitad|por mitades|mitad|a mitad|partes iguales|en partes iguales)$/.test(r)) {
    const nombres = personasDe(p);
    if (!nombres.length) return { aviso: '¿Con quién lo partes? Escríbelo así: «almuerzo 25000 con Ana a medias».', referente };
    const cada = Math.floor(p.monto / (nombres.length + 1));
    return listo(compartido(p, nombres.map(nombre => ({ nombre, monto: cada }))), `Listo, a medias: ${nombres.join(' y ')} te ${nombres.length > 1 ? 'deben' : 'debe'} ${formatear(cada, p.moneda)}${nombres.length > 1 ? ' cada uno' : ''}.`);
  }
  const trozos = r.split(/,? y |, /);
  const pares = trozos.map(x => /^([a-z]+) (?:me da|me pone|pone|da|paga|me paga|me debe|debe) ?(.+)$|^([a-z]+) (\d.*)$/.exec(x));
  // solo personas que la tarjeta ya nombra (o que ya conoces): «taxi 5000» nunca es Taxi poniendo su parte
  const conocida = (n: string): boolean => new RegExp(`\\b${n}\\b`).test(limpiar(`${p.concepto} ${personasDe(p).join(' ')}`))
    || ctx.cuentas.some(c => c.tipo === 'persona' && c.clave === n);
  const conVerboDeParte = pares.some(m => m?.[1]);
  if (pares.length && pares.every(m => m && conocida(m[1] ?? m[3])) && (conVerboDeParte || pares.length > 1) && (p.tipo === 'gasto' || p.tipo === 'compartido')) {
    const personas: { nombre: string; monto: number }[] = [];
    for (const m of pares as RegExpExecArray[]) {
      const nombre = m[1] ?? m[3];
      const ms = hallarMontos(m[2] ?? m[4]);
      if (ms.length !== 1 || hallarCuentas(nombre, ctx).length) { personas.length = 0; break; }
      personas.push({ nombre: original(texto, nombre), monto: aMinor(escalar(ms[0].valor, pesos(p)), p.moneda) });
    }
    const suma = personas.reduce((s, x) => s + x.monto, 0);
    if (personas.length && suma <= p.monto) {
      const nueva = compartido(p, personas);
      return listo(nueva, `Listo: ${personas.map(x => `${x.nombre} te debe ${formatear(x.monto, p.moneda)}`).join(' y ')}; tu parte es ${formatear(p.monto - suma, p.moneda)}.`);
    }
  }

  // ---- un abono que ya se había hecho
  const abono = /^(?:le )?(?:habia |he |ya le habia |ya le )?(?:abonado|dado|pagado) (.+)$/.exec(r) ?? /^me (?:habia |ha )?(?:devuelto|abonado|pagado) (.+)$/.exec(r);
  if (abono && (p.tipo === 'deuda' || p.tipo === 'prestamo')) {
    const ms = hallarMontos(abono[1]);
    if (ms.length === 1) {
      const ya = aMinor(escalar(ms[0].valor, pesos(p)), p.moneda);
      if (ya >= p.monto) return { aviso: `Eso es todo lo de la tarjeta (${monto}). Si ya está saldado, cancela la tarjeta.`, referente };
      const queda = p.monto - ya;
      return listo({ ...p, monto: queda }, `Listo, ${p.tipo === 'deuda' ? 'la deuda' : 'el préstamo'} queda en ${formatear(queda, p.moneda)} porque ya ${p.tipo === 'deuda' ? 'le habías abonado' : 'te había devuelto'} ${formatear(ya, p.moneda)}.`);
    }
  }

  const sinVerbo = r.replace(VERBO, '');
  const conVerbo = sinVerbo !== r;

  // ---- la cuenta: «fue en nequi», «de nequi para efectivo», «con la tarjeta de crédito»
  const dos = /^(?:de|desde) (?:la |el |mi )?([a-z]+) (?:a|para|hacia|al) (?:la |el |mi )?([a-z]+)$/.exec(sinVerbo);
  if (dos && p.tipo === 'transferencia') {
    const [a, b] = [hallarCuentas(dos[1], ctx)[0], hallarCuentas(dos[2], ctx)[0]];
    if (a && b && a.id !== b.id) return listo({ ...p, cuentaId: a.id, cuentaDestinoId: b.id }, `Listo, de ${nombreCuenta(a.id, ctx)} a ${nombreCuenta(b.id, ctx)}.`);
  }
  const prep = /^(?:lo pague |la pague |los pague |pague |pagado |se pago )?(?:en|con|por|desde|de|del|al|a)\s+(?:la |el |mi |mis )?(.+)$/.exec(sinVerbo);
  if (prep || ((marcado || conVerbo) && sinVerbo.split(' ').length === 1)) {
    const resto = prep ? prep[1] : sinVerbo;
    const cs = hallarCuentas(resto, ctx);
    const sobra = cs.length === 1 ? (resto.slice(0, cs[0].inicio) + resto.slice(cs[0].fin)).replace(/\b(?:cuenta|app|plata|la|el)\b/g, '').trim() : resto;
    if (cs.length === 1 && !sobra && p.tipo !== 'transferencia') {
      if (cs[0].id === p.cuentaId) return listo(p, `Sí, ya estaba en ${nombreCuenta(cs[0].id, ctx)}.`);
      return listo({ ...p, cuentaId: cs[0].id }, `Listo, cambié la cuenta a ${nombreCuenta(cs[0].id, ctx)}.`);
    }
    if (!cs.length && RE_CUENTA_RARA.test(resto) && !/\d/.test(resto)) {
      const mias = ctx.cuentas.filter(c => c.tipo === 'dinero' && c.moneda === 'COP').map(c => c.nombre);
      return { aviso: `No tengo esa cuenta entre las tuyas. ¿Fue con ${mias.slice(0, -1).join(', ')} o ${mias[mias.length - 1]}? Escríbeme cuál y la cambio.`, referente };
    }
  }

  // ---- la persona: «era con Paula, no Laura»
  const per = /^(?:con|a|para) ([a-z]+(?: [a-z]+)?)(?: no (?:con |a |para )?(?:era )?(?:con |a )?([a-z]+(?: [a-z]+)?))?$/.exec(sinVerbo);
  if (per && conVerbo && !hallarCuentas(per[1], ctx).length && !/^(?:la|el|los|las|un|una)\b/.test(per[1])) {
    const actuales = personasDe(p);
    const viejo = per[2] ? actuales.find(n => limpiar(n) === per[2]) : actuales.length === 1 ? actuales[0] : undefined;
    if (!viejo) return actuales.length ? { aviso: `¿A quién cambio por ${titulo(per[1])}: ${actuales.join(' o ')}?`, referente } : null;
    const nuevo = originales(texto, per[1]);
    return listo(cambiarPersona(p, viejo, nuevo), `Listo, cambié a ${viejo} por ${nuevo}.`);
  }

  // ---- el monto: «eran 21 mil», «fueron 47000 con el domicilio»
  if (marcado || conVerbo) {
    const sinCola = sinVerbo.replace(/\s+(?:con (?:el|la|los|las|todo|todo y) .+|en total|con todo|total|nada mas|no mas|pesos)$/, '');
    const ms = hallarMontos(sinCola).filter(m => m.explicito);
    if (ms.length === 1 && (sinCola.slice(0, ms[0].inicio) + sinCola.slice(ms[0].fin)).replace(/\b(?:monto|valor|total|el|la)\b/g, '').trim() === '') {
      const n = aMinor(ms[0].valor, p.moneda);
      const nueva = p.tipo === 'gasto' || p.tipo === 'compartido' || p.tipo === 'ingreso' ? aplicarCambio(p, `monto ${ms[0].valor}`, ctx) : { ...p, monto: n };
      if (nueva) return listo(nueva, `Listo, cambié el monto a ${formatear(n, p.moneda)}.`);
    }
  }

  // ---- la fecha: «no, fue antier»
  if (marcado || conVerbo) {
    const f = hallarFecha(sinVerbo, ctx.ahora);
    if (f.explicita && f.resto.trim() === '') return listo({ ...p, ocurridoEn: f.fecha }, 'Listo, cambié la fecha.');
  }

  // ---- un evento para todo: «fue para la reunión del trabajo»
  const para = /^para (?:el |la |los |las |una |un )?(.+)$/.exec(sinVerbo);
  if (para && conVerbo && !/\d/.test(para[1])) {
    const slug = para[1].split(' ').filter(w => !/^(?:de|del|la|el|los|las|mi|mis|y)$/.test(w)).slice(0, 3).join('-');
    if (slug) return listo({ ...p, etiqueta: slug }, `Listo, lo marqué con el evento #${slug}.`);
  }

  // ---- qué se compró: «no era comida, era una recarga», «era la cuota del celular»
  const doble = /^(?:era|es|fue) (?:un |una |el |la |de )?(.+?) (?:era|es|fue|sino) (?:un |una |el |la |de )?(.+)$/.exec(r);
  const simple = /^(?:era|es|fue) (?:un |una |el |la |los |las )(.+)$/.exec(r);
  const nuevo = doble?.[2] ?? simple?.[1];
  if (nuevo && !/\d/.test(nuevo)) { const c = cambiarConcepto(p, nuevo, ctx); return listo(c, notaDeConcepto(c, ctx)); }
  return null;
}

const nombreCuenta = (id: string, ctx: Contexto): string => ctx.cuentas.find(c => c.id === id)?.nombre ?? id;

/** Cambia el nombre de una persona en la tarjeta: la persona, el reparto, el concepto y las preguntas. */
function cambiarPersona(p: Propuesta, viejo: string, nuevo: string): Propuesta {
  const re = new RegExp(`\\b${viejo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  const cambiar = (s: string): string => s.replace(re, nuevo);
  return {
    ...p,
    persona: p.persona && limpiar(p.persona) === limpiar(viejo) ? nuevo : p.persona,
    personas: p.personas?.map(x => (limpiar(x.nombre) === limpiar(viejo) ? { ...x, nombre: nuevo } : x)),
    concepto: cambiar(p.concepto),
    faltantes: p.faltantes.map(f => ({ ...f, dato: f.dato && limpiar(f.dato) === limpiar(viejo) ? nuevo : f.dato, pregunta: cambiar(f.pregunta), opciones: f.opciones })),
  };
}

/** El concepto nuevo y, si se puede saber, su categoría (como si se hubiera escrito «recarga 18000»). */
function cambiarConcepto(p: Propuesta, nuevo: string, ctx: Contexto): Propuesta {
  const r = interpretar(`${nuevo} ${pesos(p)}`, ctx);
  const otra = r.clase === 'movimiento' && r.propuesta.tipo === 'gasto' ? r.propuesta : null;
  const concepto = otra?.concepto ?? capitalizar(nuevo);
  if (p.tipo !== 'gasto' && p.tipo !== 'compartido') return { ...p, concepto };
  const cat = otra?.categoriaId ?? categoriaPorNombre(nuevo, ctx)?.id;
  const sinCat = p.faltantes.filter(f => f.campo !== 'categoria');
  const pregunta = otra?.faltantes.find(f => f.campo === 'categoria');
  return { ...p, concepto, categoriaId: cat, faltantes: cat ? sinCat : [...sinCat, ...(pregunta ? [pregunta] : [])] };
}

function notaDeConcepto(p: Propuesta, ctx: Contexto): string {
  const cat = p.categoriaId ? ctx.cuentas.find(c => c.id === p.categoriaId)?.nombre : undefined;
  return cat ? `Listo, ahora es «${p.concepto}» en ${cat}.` : `Listo, ahora es «${p.concepto}». Dime en qué categoría va.`;
}

// ---------------------------------------------------------------- la cola de varios movimientos

export type Referente = { pos: number } | { palabra: string };
export type Orden =
  | { que: 'cancelarTodo' }
  | { que: 'confirmarResto' }
  | { que: 'quitar'; cual: Referente }
  | { que: 'editar'; cual: Referente; resto: string }
  | { que: 'todos'; resto: string };

const ORDINALES: Record<string, number> = {
  primero: 0, primera: 0, primer: 0, '1': 0, segundo: 1, segunda: 1, '2': 1, tercero: 2, tercera: 2, tercer: 2, '3': 2,
  cuarto: 3, cuarta: 3, '4': 3, quinto: 4, quinta: 4, '5': 4, sexto: 5, sexta: 5, '6': 5, ultimo: -1, ultima: -1,
};
const RE_ORDINAL = '(primero|primera|primer|segundo|segunda|tercero|tercera|tercer|cuarto|cuarta|quinto|quinta|sexto|sexta|ultimo|ultima|[1-6])';
const NUMEROS = '(?:dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\\d+)';

function referente(t: string): Referente | null {
  const o = new RegExp(`^(?:el |la )?${RE_ORDINAL}$`).exec(t);
  if (o) return { pos: ORDINALES[o[1]] };
  const d = /^(?:el |la |lo )?(?:del|de la|de los|de las|de el|de)? ?([a-z]+(?: [a-z]+)?)$/.exec(t);
  return d ? { palabra: d[1] } : null;
}

/** Una orden sobre la cola: cancelar todo, confirmar el resto, quitar uno, cambiar uno o cambiar todos. */
export function leerOrdenDeCola(texto: string): Orden | null {
  let t = limpiar(texto);
  for (let i = 0; i < 3; i++) t = t.replace(/^(?:mejor|entonces|bueno|y|ok|ah|no)\s+/, '');
  if (/^(?:cancela|cancelar|cancelalo|cancelalos|descarta|descartar|descartalos|borra|borrar|borralos|bota|olvida|olvidalo|elimina)(?: (?:todo|todos|todas|todo eso|toda la lista|la lista))$|^(?:no guardes nada|olvida todo|olvidalo todo|nada de eso)$/.test(t)) {
    return { que: 'cancelarTodo' };
  }
  if (/^(?:si |dale |ok )?(?:confirma|confirmar|confirmo|guarda|guardar|guardalos|guardalas|confirmalos|confirmalas)(?: (?:los|las) (?:otros|otras|demas|que quedan|restantes|dos|tres|cuatro|cinco)| todo| todos| todas| el resto| lo demas| lo que queda)$/.test(t)) {
    return { que: 'confirmarResto' };
  }
  const q = /^(?:quita|quitar|quitale|quitame|saca|sacale|elimina|borra|borrale|descarta|bota|olvida|no anotes|no va) (.+)$/.exec(t);
  if (q) { const cual = referente(q[1]); return cual ? { que: 'quitar', cual } : null; }
  const ed = new RegExp(`^(?:el|la) ${RE_ORDINAL} (.+)$`).exec(t);
  if (ed) return { que: 'editar', cual: { pos: ORDINALES[ed[1]] }, resto: ed[2] };
  const ep = /^(?:el|la|lo) (?:del|de la|de los|de las|de) ([a-z]+(?: [a-z]+)?) ((?:fue|era|eran|fueron|es|son|en|con|por|costo|vale|valio)\b.*)$/.exec(t);
  if (ep) return { que: 'editar', cual: { palabra: ep[1] }, resto: ep[2] };
  const todos = new RegExp(`^(?:(?:los|las) ${NUMEROS}(?: (?:movimientos|gastos))?|todos|todas|todo|ambos|ambas)(?: (?:los|las) (?:movimientos|gastos))? (.+)$`).exec(t);
  if (todos) return { que: 'todos', resto: todos[1] };
  return null;
}

/**
 * Lleva un cambio hecho a la propuesta de un movimiento en cola de vuelta a su frase («taxi 5k» con 8000 pasa a
 * «taxi 8000»). Solo sabe del monto, la cuenta y el evento; si cambió otra cosa, devuelve null.
 */
export function editarFrase(frase: string, antes: Propuesta, despues: Propuesta, ctx: Contexto): string | null {
  const otros: (keyof Propuesta)[] = ['tipo', 'categoriaId', 'persona', 'ocurridoEn', 'cuentaDestinoId', 'concepto'];
  if (otros.some(k => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]))) return null;
  if (JSON.stringify(antes.personas) !== JSON.stringify(despues.personas)) return null;
  let f = limpiar(frase);
  if (despues.monto !== antes.monto) {
    const ms = hallarMontos(f).filter(m => m.explicito);
    if (ms.length !== 1) return null;
    f = `${f.slice(0, ms[0].inicio)}${pesos(despues)}${f.slice(ms[0].fin)}`;
  }
  if (despues.cuentaId !== antes.cuentaId && despues.cuentaId) {
    const nombre = limpiar(nombreCuenta(despues.cuentaId, ctx));
    const cs = hallarCuentas(f, ctx);
    if (cs.length > 1) return null;
    f = cs.length ? `${f.slice(0, cs[0].inicio)}${nombre}${f.slice(cs[0].fin)}` : `${f} ${nombre}`;
  }
  if (despues.etiqueta !== antes.etiqueta && despues.etiqueta) f = `${f} #${despues.etiqueta}`;
  const r = interpretar(f, ctx);
  if (r.clase !== 'movimiento' || r.propuesta.monto !== despues.monto || r.propuesta.cuentaId !== despues.cuentaId) return null;
  return f;
}

/** ¿Qué movimiento de la lista nombra la palabra? (por su concepto o por lo que se escribió). Devuelve las posiciones. */
export function buscarEnLista(palabra: string, textos: string[]): number[] {
  const w = limpiar(palabra);
  return textos.map((x, i) => (new RegExp(`\\b${w}`).test(limpiar(x)) ? i : -1)).filter(i => i >= 0);
}

/** «corrige, fueron 87000»: una corrección de lo que se acaba de guardar. Devuelve lo que hay que cambiar. */
export function correccionDeGuardado(texto: string): string | null {
  const m = /^(?:corrige|corrijo|corregir|correccion|me equivoque|perdon me equivoque)\b[\s:]*(.+)$/.exec(limpiar(texto));
  return m ? m[1] : null;
}

/** «mejor registra cine 30000»: la muletilla del comienzo no es parte del concepto. */
export function sinMuletillaDeRegistro(texto: string): string {
  return texto.replace(/^\s*(?:mejor|entonces|ahora)\s+(?:registra|registrame|anota|anotame|apunta|apuntame|pon|ponme)\s+(?=.*\d)/i, '');
}

export interface Opcion { titulo: string; frase: string }

/**
 * «era a Andrés Felipe, no Andrés Gómez» después de una pregunta con botones: las mismas opciones con el nombre
 * corregido. Solo si el nombre nuevo empieza como el que traía la pregunta (Andres y Andrés Felipe).
 */
export function corregirNombreEnOpciones(texto: string, opciones: Opcion[]): { nombre: string; viejo: string; opciones: Opcion[] } | null {
  if (/\d/.test(texto)) return null;
  const m = /^(?:no,?\s+)?(?:era|fue|es)\s+(?:a|con|para)\s+(.+?)(?:,?\s+no\s+(?:a\s+|con\s+)?(.+?))?[.!]*$/i.exec(texto.trim());
  const viejo = /\ba ([^\d]+)$/.exec(opciones[0]?.frase ?? '')?.[1];
  if (!m || !viejo) return null;
  const nombre = m[1].trim();
  const base = limpiar(viejo);
  if (!limpiar(nombre).startsWith(base.split(' ')[0]) || limpiar(nombre) === base) return null;
  const re = new RegExp(`\\b${viejo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  return { nombre, viejo, opciones: opciones.map(o => ({ titulo: o.titulo.replace(re, nombre), frase: o.frase.replace(re, nombre) })) };
}

/** Después de una pregunta con botones, la respuesta escrita que nombra las cuentas de una sola opción la elige. */
export function elegirOpcion(texto: string, opciones: string[], ctx: Contexto): string | null {
  const t = limpiar(texto);
  if (hallarMontos(t).some(m => m.explicito)) return null;
  const ids = hallarCuentas(t, ctx).map(c => c.id);
  if (!ids.length) return null;
  const sirven = opciones.filter(o => {
    const de = hallarCuentas(limpiar(o), ctx).map(c => c.id);
    return ids.every((id, i) => de[i] === id);
  });
  return sirven.length === 1 ? sirven[0] : null;
}
