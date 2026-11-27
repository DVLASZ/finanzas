/**
 * Cuentas entre amigos dichas como se hablan: «el queso costó 10k, lo pagó Faber y yo le debo la mitad», «pagué el uber
 * de 14k y Esteban me pasa la mitad», «cuadramos con Jorge...». Se reescriben con las frases que el parser ya entiende
 * («le debo 5000 a Faber por queso», «uber 14000 entre esteban y yo») o, si de verdad no alcanza la información, se
 * pregunta. Compensar, perdonar o pasarse de lo que se debía no mueve plata como un gasto: se explica y se ofrece
 * anotar solo lo que sí salió.
 */
import { formatear, hallarMontos } from './dinero.ts';
import { capitalizar, limpiar, normalizar } from './texto.ts';

type Pregunta = { mensaje: string; opciones: { titulo: string; frase: string }[] };
export interface Hablada { texto?: string; pregunta?: Pregunta }

const NUM: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const RE_NUM = `(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\\d{1,2})(?![\\d.,]*\\s?(?:k|mil|lucas?|barras?))`;
const aNumero = (s: string): number => NUM[s] ?? Number(s);
const pesos = (n: number): string => formatear(n, 'COP');

// palabras con mayúscula que no son nombres (verbos del comienzo de la frase y conectores)
const NO_NOMBRE = new Set(['pague', 'compre', 'puse', 'hice', 'saque', 'quede', 'entre', 'ayer', 'hoy', 'mande', 'pase', 'gaste', 'tome', 'adelante', 'perdoname', 'cuadramos',
  'cuadre', 'compramos', 'pagamos', 'pedi', 'les', 'mis', 'los', 'las', 'una', 'uno', 'unos', 'unas', 'del', 'por', 'para', 'con', 'sin', 'que', 'pero', 'porque', 'como',
  'cuando', 'todo', 'toda', 'total', 'salimos', 'fuimos', 'hicimos', 'quedamos', 'nos', 'ella', 'ellos', 'ellas', 'luego', 'despues', 'ahora', 'esos', 'esas', 'este', 'esta',
  'fueron', 'eran', 'eramos', 'somos', 'puso', 'pago', 'compro', 'yo', 'mi', 'tu', 'su', 'sus', 'airbnb', 'nequi', 'daviplata', 'efectivo', 'bancolombia', 'uber', 'netflix']);
const VERBO_DE_SUJETO = new Set(['pago', 'puso', 'pidio', 'compro', 'adelanto', 'invito', 'cubrio', 'saco', 'hizo', 'se', 'y', 'me', 'ya', 'le', 'puso', 'llevo', 'consiguio', 'trajo']);
const PAGADOR = new Set(['pago', 'puso', 'pidio', 'compro', 'adelanto', 'invito', 'cubrio', 'saco', 'hizo', 'trajo', 'llevo']);
const CUE_DEBO = new Set(['debo', 'debiendo', 'debiendole', 'pasarle', 'darle', 'paso', 'doy', 'consigno', 'ponerle', 'devolverle', 'pago', 'transfiero', 'mando']);
const MOTIVO_NO = new Set(['mitad', 'parte', 'total', 'todo', 'cuenta', 'dinero', 'plata', 'lucas', 'barras', 'mil', 'mio', 'mia', 'cada', 'uno', 'casa', 'resto', 'otro', 'otros', 'ella', 'ellos']);

interface Palabra { orig: string; n: string }
const palabrasDe = (texto: string): Palabra[] => texto.split(/\s+/).filter(Boolean).map(w => {
  const orig = w.replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}]+$/gu, '');
  return { orig, n: normalizar(orig) };
});

/** Los nombres propios de la frase, en orden, sin repetir. */
function nombresDe(ps: Palabra[], texto: string): string[] {
  const res: string[] = [];
  ps.forEach((p, i) => {
    if (!/^[A-ZÁÉÍÓÚÑ][\p{L}]{2,}$/u.test(p.orig) || NO_NOMBRE.has(p.n)) return;
    if (i === 0 && !VERBO_DE_SUJETO.has(ps[i + 1]?.n ?? '')) return;
    if (!res.includes(p.orig)) res.push(p.orig);
  });
  if (/\b(?:mi|el|la) (?:roomie|roommate|roomi)\b/i.test(texto) && !res.includes('Roomie')) res.unshift('Roomie');
  return res;
}

/** Quién pagó: el nombre que está junto a «pagó», «puso», «compró»..., o a quien se le debe. */
function acreedorDe(ps: Palabra[], nombres: string[]): string | null {
  const lista = nombres.map(nm => ({ nm, i: nm === 'Roomie' ? ps.findIndex(p => /^roomi/.test(p.n)) : ps.findIndex(p => p.orig === nm) }));
  for (const { nm, i } of lista) {
    if (i < 0) continue;
    const sig = ps[i + 1]?.n ?? '', ant = ps[i - 1]?.n ?? '';
    if (PAGADOR.has(sig) || (sig === 'se' && ps[i + 2]?.n === 'encargo') || PAGADOR.has(ant)) return nm;
    if (['la', 'lo', 'los', 'las'].includes(sig) && PAGADOR.has(ps[i + 2]?.n ?? '')) return nm; // «Laura la compró»
    if (sig === 'me' && ps[i + 2]?.n === 'cubrio') return nm;
    if (ant === 'a' && ps.slice(Math.max(0, i - 7), i).some(p => CUE_DEBO.has(p.n))) return nm;
    if (ant === 'a' && i - 2 < 1 && /^le$/.test(ps[i + 1]?.n ?? '')) return nm; // «A Paula le debo...»
  }
  return null;
}

interface Cantidad { valor: number; marcado: boolean; inicio: number; fin: number; sig: string; ant: string }
function cantidadesDe(t: string): Cantidad[] {
  return hallarMontos(t).filter(m => m.moneda === null).map(m => {
    const trozo = t.slice(m.inicio, m.fin);
    const sig = t.slice(m.fin).trim().split(' ')[0] ?? '';
    const ant = t.slice(0, m.inicio).trim().split(' ').pop() ?? '';
    return { valor: m.valor, marcado: /k|mil|luca|luka|barra|palo|\$/.test(trozo), inicio: m.inicio, fin: m.fin, sig, ant };
  }).filter(c => !(['personas', 'persona', 'cabezas', 'amigos', 'tintos', 'combos', 'dias'].includes(c.sig) || (['entre', 'somos', 'eramos', 'fuimos'].includes(c.ant) && !c.marcado)));
}
/** Un número pequeño sin «k» ni «mil» dicho entre amigos es de miles: «pagó 36 del mercado». */
const miles = (c: Cantidad): number => (c.valor < 1000 && !c.marcado ? c.valor * 1000 : c.valor);

function participantes(t: string): number | null {
  if (/\b(?:la mitad|mitad y mitad|a medias|partes iguales|entre los dos|los dos|de los dos|entre (?:ella|el) y yo|entre nosotros dos)\b/.test(t)) return 2;
  let m: RegExpMatchArray | null;
  if ((m = t.match(new RegExp(`\\bentre (?:los |las )?${RE_NUM}\\b`)))) return aNumero(m[1]);
  if ((m = t.match(new RegExp(`\\b(?:somos|eramos|eran|fuimos) ${RE_NUM}\\b`)))) return aNumero(m[1]);
  if ((m = t.match(new RegExp(`\\b(?:de|para) los ${RE_NUM}\\b`)))) return aNumero(m[1]);
  if ((m = t.match(new RegExp(`\\b${RE_NUM} personas\\b`)))) return aNumero(m[1]);
  return null;
}

/** Lo que se compró: «el queso», «la pizza», «por el domicilio». */
function motivoDe(t: string, nombres: string[]): string {
  const propios = new Set(nombres.map(normalizar));
  const bueno = (w: string | undefined): w is string => !!w && !/\d/.test(w) && w.length > 2 && !MOTIVO_NO.has(w) && !propios.has(w);
  let m = t.match(/\bpor (?:el |la |las |los |lo de |lo del )?([a-z]+(?: (?:de|del|de la) [a-z]+)?)/);
  if (m && bueno(m[1].split(' ')[0]) && !/^(?:cabeza|cada)/.test(m[1])) return m[1];
  m = t.match(/\b(?:pago|pidio|compro|adelanto|puso|saco|hizo|invito|cubrio|pague|compre|saque)\s+(?:todo\s+)?(?:(?:el|la|los|las|un|una|unos|unas)\s+)+(?!\d)([a-z]+)/);
  if (m && bueno(m[1])) return m[1];
  m = t.match(/^(?:el|la|los|las|un|una) ([a-z]+)/);
  if (m && bueno(m[1])) return m[1];
  m = t.match(/\bde (?:el |la |los |las )?(?:\d[\d.,]*\s?(?:k|mil)? de (?:el |la |los |las )?)?([a-z]{4,})/);
  if (m && bueno(m[1])) return m[1];
  return '';
}

/** Cuánto es de cada uno: lo que dice («voy con 20», «de a 12k») o el total entre los que son. */
function cuotaDe(t: string, cants: Cantidad[]): number | null {
  const cue = t.match(/\b(?:debo|debiendo|debiendole|paso|consigno|doy|darle|pasarle|ponerle|poner|pongo|devuelvo|voy con|quede con|toca de a|me toca|salia a|sale a|queda a)(?: a [a-z]+)?\s+(?:mis |mi |los |unos |sus )?(?:\$)?(\d[\d.,]*(?:\s?(?:k|mil|lucas?|barras?))?)/);
  const total = cants.length ? Math.max(...cants.map(miles)) : null;
  if (cue) {
    const c = cants.find(x => cue.index !== undefined && t.slice(x.inicio, x.fin).trim() === cue[1].trim() && x.inicio >= cue.index);
    if (c) return miles(c);
  }
  const otros = cants.map(miles).filter(v => v !== total);
  if (otros.length === 1 && /\b(?:cada uno|cada una|por cabeza|de a|mis \d|lo mio|yo voy con|quede con)\b/.test(t)) return otros[0];
  const k = participantes(t);
  // solo se llega aquí cuando ya se sabe que el otro pagó y tú debes: sin una cuota dicha, es el total entre los que son
  if (total && k) return Math.round(total / k);
  if (total && cants.length === 1 && !k) return total;
  return null;
}

const ES_COBRO = /\b(?:me (?:debe|deben|pasa|pasan|da|dan|devuelve|devuelven|transfiere|transfieren|reconoce|reconocen|queda debiendo|quedan debiendo|tiene que|tienen que|de sus|dé sus|deben su parte)|cada uno me|ponen|lo mismo|me debe su parte)\b/;
const EMPIEZA_YO = /^(?:hoy |ayer )?(?:yo )?(?:pague|compre|puse|hice|saque|adelante|le compre|pagamos)\b/;

function cobro(texto: string, t: string, ps: Palabra[], cants: Cantidad[]): Hablada | null {
  const nombres = nombresDe(ps, texto).filter(n => n !== 'Roomie');
  const total = cants.length ? Math.max(...cants.map(miles)) : null;
  if (!total) return null;
  const concepto = motivoDe(t, nombres) || 'gasto';
  if (!nombres.length) {
    const n = t.match(new RegExp(`\\b(?:otros|otras|mis|los|las|entre los)? ?${RE_NUM}\\b(?: roomies| companeros| amigos| personas)?`))?.[1];
    return { pregunta: {
      mensaje: `¿Quiénes son los otros${n ? ` (${n})` : ''}? Sin sus nombres no puedo apuntar lo que te debe cada uno. Escríbelo así: «${concepto} ${total} entre ana, luis y yo».`,
      opciones: [{ titulo: 'Solo mi parte', frase: `${concepto} ${total}` }],
    } };
  }
  const partes = nombres.length + 1;
  const otros = cants.map(miles).filter(v => v !== total);
  const cuota = otros.length ? Math.min(...otros) : Math.round(total / partes);
  const iguales = Math.abs(cuota * partes - total) <= partes || /\b(?:mitad|partes iguales|lo mismo|a medias)\b/.test(t);
  if (iguales) return { texto: `${concepto} ${total} entre ${nombres.join(', ')} y yo` };
  return { texto: `${concepto} ${total} pagué por ${nombres.map(n => `${n} ${cuota}`).join(' y ')}` };
}

function debo(texto: string, t: string, ps: Palabra[], cants: Cantidad[]): Hablada | null {
  const nombres = nombresDe(ps, texto);
  const acreedor = acreedorDe(ps, nombres);
  if (!acreedor) return null;
  const cuota = cuotaDe(t, cants);
  if (!cuota) return null;
  const motivo = motivoDe(t, nombres);
  return { texto: `le debo ${cuota} a ${acreedor}${motivo ? ` por ${motivo}` : ''}` };
}

/** Una cuenta que se cierra sin plata: se explica y se ofrece anotar solo lo que sí se movió. */
function sinPlata(texto: string, t: string, ps: Palabra[], cants: Cantidad[]): Hablada | null {
  const nombres = nombresDe(ps, texto);
  const quien = nombres[0];
  const deudas = /\b(?:debia|debias|debe|debo|debes|debiamos|deuda|prestaste|preste)\b/.test(t);
  const saldar = quien ? [{ titulo: `Saldar con ${quien}`, frase: `saldar la deuda con ${normalizar(quien)}` }] : [];
  const cuentaDe = (s: string): string => s.match(/\b(nequi|daviplata|efectivo)\b/)?.[1] ?? '';
  if (deudas && /\b(?:perdon\w*|dejaramos asi|dejemos asi|dejamos asi)\b/.test(t)) {
    return { pregunta: { mensaje: `Perdonar o dejar así una deuda no mueve plata, así que no lo anoto como gasto ni como ingreso.${quien ? ` Si quedó saldada, escribe «saldar la deuda con ${normalizar(quien)}».` : ' ¿Con quién era?'}`, opciones: saldar } };
  }
  if (deudas && /\b(?:cuadr\w+|a paz|en cero|en ceros|a mano|con eso quedo (?:listo|saldad\w+)|quedamos listos)\b/.test(t)) {
    const opciones = [...saldar];
    const mando = t.match(/\b(?:mande|pase|transferi|consigne|di|dio|dio)\b(?: solo)? (\d[\d.,]*(?:\s?(?:k|mil))?)(?: en| por)? ?(nequi|daviplata|efectivo)?/);
    const c = mando ? cants.find(x => t.slice(x.inicio, x.fin).trim() === mando[1].trim()) : undefined;
    if (c && quien) {
      const frase = /me (?:dio|pago|paso|devolvio)/.test(t) ? `${normalizar(quien)} me pagó ${miles(c)}` : `pagué ${miles(c)} a ${normalizar(quien)}`;
      opciones.unshift({ titulo: `Solo los ${pesos(miles(c))}`, frase: `${frase} ${mando![2] ?? cuentaDe(t)}`.trim() });
    }
    return { pregunta: { mensaje: `Cuadrar cuentas entre los dos no mueve plata en las cuentas que se compensan: no lo anoto como gasto ni como ingreso. ¿Anoto solo lo que sí se pasó?`, opciones } };
  }
  return null;
}

/** Pagos de más o a pedazos: «me debía 7k y me dio 10», «le abone 10 ayer y hoy otros 5». */
function abonos(texto: string, t: string, ps: Palabra[], cants: Cantidad[]): Hablada | null {
  const nombres = nombresDe(ps, texto);
  const quien = nombres[0];
  if (!quien) return null;
  const q = normalizar(quien);
  const cuenta = t.match(/\b(nequi|daviplata|efectivo)\b/)?.[1] ?? '';
  const v = cants.map(miles);
  const escala = (c: Cantidad, ref: number): number => (c.valor < 1000 && !c.marcado && ref >= 1000 ? c.valor * 1000 : c.valor);
  // «Laura me debía 18k, me dio 10 en efectivo...»: es un abono de esa persona
  let m = t.match(/\bme (?:debia|debe) [^,;]*?[,;]? ?(?:y )?me (?:dio|paso|pago|devolvio)\b/);
  if (m && cants.length >= 2) {
    const deuda = miles(cants[0]);
    const dio = escala(cants[1], deuda);
    if (dio < deuda) return { texto: `${q} me pagó ${dio} ${cuenta}`.trim() };
    if (dio > deuda) return { pregunta: { mensaje: `Te debía ${pesos(deuda)} y te dio ${pesos(dio)}. ¿Cierro la deuda y los ${pesos(dio - deuda)} de más los dejas como saldo a favor de ${quien}?`, opciones: [{ titulo: `Cerrar la deuda (${pesos(deuda)})`, frase: `${q} me pagó ${deuda} ${cuenta}`.trim() }] } };
  }
  // «le di 10k a Alejandro, pero solo le debía 8k; me quedó debiendo 2k» o «le pasé 15k a Mateo, pero eran 12 de lo que le debía»
  m = t.match(/\bpero (?:solo |eran |solo eran )/);
  if (m && /\ble (?:di|pase|mande|transferi)\b/.test(t) && cants.length >= 2) {
    const pasado = miles(cants[0]);
    const debia = escala(cants[1], pasado);
    if (debia < pasado) {
      const resto = pasado - debia;
      const opciones = [{ titulo: `Pagar los ${pesos(debia)}`, frase: `pagué ${debia} a ${q} ${cuenta}`.trim() }];
      if (/\bme quedo debiendo\b/.test(t)) opciones.unshift({ titulo: 'Anotar los dos', frase: `pagué ${debia} a ${q} ${cuenta}\n${q} me debe ${resto}`.replace(/ \n/g, '\n').trim() });
      return { pregunta: { mensaje: `Le diste ${pesos(pasado)} y solo le debías ${pesos(debia)}. ¿Pago la deuda y los ${pesos(resto)} de más los dejo como saldo a favor tuyo o de ${quien}?`, opciones } };
    }
  }
  // «le aboné 10 ayer y hoy otros 5»: dos abonos, no uno
  m = t.match(/\ble abone (\d[\d.,]*(?:\s?(?:k|mil))?) (?:ayer |antier |antes )?y hoy otros? (\d[\d.,]*(?:\s?(?:k|mil))?)/);
  if (m) {
    const total = v.length ? Math.max(...v) : 0;
    const a = hallarMontos(m[1])[0]?.valor ?? 0, b = hallarMontos(m[2])[0]?.valor ?? 0;
    const ea = a < 1000 && total >= 1000 ? a * 1000 : a, eb = b < 1000 && total >= 1000 ? b * 1000 : b;
    return { pregunta: { mensaje: `Son dos abonos a ${quien}: ${pesos(ea)} y ${pesos(eb)}. ¿Los anoto los dos?`, opciones: [{ titulo: 'Anotar los dos abonos', frase: `pagué ${ea} a ${q}\npagué ${eb} a ${q}` }] } };
  }
  // «ya le pasé por Nequi los 5k del queso a Faber», «le mandé 8k a Faber, ya quedamos al día»: es el pago de lo que se debía
  m = t.match(/^(?:ya )?le (?:pase|mande|transferi|consigne|di)\b/);
  if (m && (/^ya /.test(t) || /\bya quedamos\b|\bal dia\b/.test(t)) && cants.length >= 1 && !/\bdebia\b/.test(t)) {
    return { texto: `pagué ${miles(cants[0])} a ${q} ${cuenta}`.trim() };
  }
  return null;
}

/** «Me faltan 3k, se los pido a Pipe»: todavía no se los han dado. */
function intencion(t: string, ps: Palabra[], texto: string): Hablada | null {
  if (!/\bse (?:los|las|lo|la) (?:pido|voy a pedir)\b|\bvoy a pedirle\b|\bse (?:los|las|lo|la) pedire\b/.test(t)) return null;
  const q = nombresDe(ps, texto)[0];
  return { pregunta: { mensaje: `Eso suena a que todavía no te prestan nada, así que no anoto nada. Cuando${q ? ` ${q}` : ''} te los pase, escribe «${q ? normalizar(q) : 'ana'} me prestó 3k». ¿Quieres anotar otra cosa?`, opciones: [] } };
}

/** Una frase hablada de cuentas entre amigos: devuelve la frase que se lee en su lugar o una pregunta; null si no es de estas. */
export function hablada(texto: string): Hablada | null {
  if (texto.length > 400) return null;
  const t = limpiar(texto);
  // «porque mañana salimos a rodar» es el plan de otro día, no la fecha de lo comprado
  const plan = t.match(/,? (?:porque|pa|para que) .*\b(?:manana|luego|despues)\b.*$/);
  const ps = palabrasDe(texto);
  const cants = cantidadesDe(t);
  const intento = intencion(t, ps, texto);
  if (intento) return intento;
  const cuadre = sinPlata(texto, t, ps, cants); if (cuadre) return cuadre;
  const exceso = abonos(texto, t, ps, cants); if (exceso) return exceso;
  if (EMPIEZA_YO.test(t) && (ES_COBRO.test(t) || /\bentre (?:los |las )?(?:dos|tres|cuatro|cinco|seis)\b|\bentre \S+ y yo\b|\bmitad y mitad\b|\bpartes iguales\b/.test(t))) {
    const r = cobro(texto, t.replace(/\b(?:manana|mas tarde|luego|despues|al rato)\b/g, '').replace(/\s+/g, ' '), ps, cants);
    if (r) return r;
  }
  const hayDebo = /\b(?:eramos|somos|entre (?:los )?(?:dos|tres|cuatro|cinco|seis)|para los (?:dos|tres|cuatro|cinco|seis)|debo|debiendo|debiendole|me toca|nos toca|voy con|quede con|mi parte|lo mio|mitad|partes iguales|ponerle|me cubrio|pasarle|darle|le paso|le consigno|me falta darle|cada uno|por cabeza)\b/.test(t);
  if (hayDebo && !ES_COBRO.test(t.replace(/\bme (?:debe|deben)\b.*$/, '$&')) ) {
    const r = debo(texto, t, ps, cants);
    if (r) return r;
  }
  if (plan && !hayDebo) return { texto: texto.replace(/,? (?:porque|pa|para que) .*$/i, '') };
  return null;
}
