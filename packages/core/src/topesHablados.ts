/**
 * Topes de presupuesto y metas de ahorro dichos como se hablan: «ponme un tope de 300k al mes en comida», «cuánto me queda
 * del presupuesto de salidas», «si gasto 40k en ropa me paso?», «crea una meta de 1.500.000 para cambiar de celular»,
 * «metí 100k al ahorro del viaje». Se reescriben con los comandos de siempre («tope comida 300000», «ahorré 100000 para viaje»)
 * o se contestan con una cuenta sencilla que no guarda nada. Lo que la app no tiene (topes por quincena, año o semana, avisos
 * a medida, metas compartidas, aportes automáticos) se explica y se dice qué escribir en su lugar; nunca se inventa.
 */
import { conSubcategorias } from './subcategorias.ts';
import { estadoPresupuesto, gastoPorCategoria } from './consultas.ts';
import { formatear, hallarMontos } from './dinero.ts';
import { categorizar, hallarCuentas } from './entidades.ts';
import { aLocal, rangoPeriodo } from './fechas.ts';
import { leerMetas } from './metas.ts';
import type { Datos } from './repo.ts';
import { limpiar } from './texto.ts';
import type { Contexto } from './tipos.ts';

export interface Hablado { frases?: string[]; texto?: string; extra?: string }

const peso = (n: number): string => formatear(n, 'COP');
const montos = (t: string): number[] => hallarMontos(t).filter(m => m.explicito && m.moneda !== 'USD').map(m => m.valor);
const NO_CATEGORIA = new Set(['tope', 'presupuesto', 'mes', 'semana', 'ano', 'quincena', 'este', 'esta', 'cada', 'para', 'del', 'las', 'los', 'una', 'uno', 'por', 'que', 'con', 'mas', 'sin', 'solo', 'hoy', 'ya', 'me', 'mi', 'el', 'la', 'de', 'en', 'al', 'y', 'a', 'k', 'mil', 'queda', 'cuanto', 'llevo', 'gaste', 'gasto', 'gastado', 'pase', 'meta', 'ahorro', 'tope']);

function nombreDe(ctx: Contexto, id: string): string { return ctx.cuentas.find(c => c.id === id)?.nombre ?? id; }

/** La categoría que dice una palabra o frase corta; null si no encaja con ninguna de esta instalación. */
function categoriaDe(trozo: string, ctx: Contexto): string | null {
  for (const w of trozo.split(' ').filter(x => x.length > 2 && !NO_CATEGORIA.has(x) && !/\d/.test(x))) {
    const id = categorizar(w, ctx);
    if (id && ctx.cuentas.some(c => c.id === id && c.tipo === 'categoria')) return id;
  }
  return null;
}

function gastadoMes(datos: Datos, ctx: Contexto, catId: string): number {
  const p = rangoPeriodo('mes', ctx.ahora);
  const ids = new Set(conSubcategorias(datos.config, catId));
  return gastoPorCategoria(datos.movimientos, datos.cuentas, p.desde, p.hasta).filter(x => ids.has(x.cuenta.id)).reduce((s, x) => s + x.total, 0);
}

function topeDe(datos: Datos, catId: string): number { return datos.presupuestos[catId] ?? 0; }

const pidePorCategoria = (ctx: Contexto, cual: string, monto?: number): string => {
  const lista = ctx.cuentas.filter(c => c.tipo === 'categoria').slice(0, 12).map(c => c.nombre).join(', ');
  return `¿En qué categoría va el tope${monto ? ` de ${peso(monto)}` : ''}${cual ? ` para «${cual}»` : ''}? No encuentro una con ese nombre. Escríbelo con una de las tuyas, por ejemplo «tope comida 300000». Tienes: ${lista}.`;
};

/** El nombre de una meta que se menciona: la que ya existe cuyo nombre aparece en el texto; si no, la última palabra de «para ...». */
function metaDe(t: string, datos: Datos): { existe: boolean; nombre: string } | null {
  const metas = leerMetas(datos.config);
  const hallada = metas.find(m => new RegExp(String.raw`\b${limpiar(m.nombre).replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}`).test(t));
  if (hallada) return { existe: true, nombre: limpiar(hallada.nombre) };
  const para = [...t.matchAll(/\bpara (?:la |el |los |las |mi |mis |un |una )?(?:cambiar de |comprar |pagar |hacer |ir a )?(?:(?:el|la|los|las) )?([a-z]{3,})(?= |$)/g)].pop();
  return para && !/^(?:diciembre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|que|cuando)$/.test(para[1]) ? { existe: false, nombre: para[1] } : null;
}

const MESES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';

export function hablarPresupuesto(texto: string, datos: Datos, ctx: Contexto): Hablado | null {
  if (texto.length > 220) return null;
  const t = limpiar(texto);
  if (!/\d|\bporcentaje\b|\bcuanto\b|\b(?:tope|presupuesto|meta)\b/.test(t)) return null;
  const pct = texto.match(/(\d{1,3}) ?%/); // limpiar() borra el %: se mira en el texto original
  // los comandos de siempre ya tienen su camino
  if (/^(?:tope \w+ \d|quitar tope|sin tope|meta [a-z ]+ \d|metas$|(?:quitar|borrar|eliminar) meta|(?:ahorre|aparte|separe|guarde) \d[\d. ]*(?:k|mil|lucas?)? (?:para|en|a)\b|(?:saque|retire|gaste) \d[\d. ]*(?:k|mil|lucas?)? de (?:la )?meta)/.test(t)) return null;
  const hay = montos(t);
  // «el bolsillo de ahorros me generó 8k de rendimientos»: plata que entra a esa cuenta, no un aporte tuyo
  if (/\b(?:genero|generaron|rindio|rindieron|dio|dieron|abonaron|pagaron|consignaron)\b/.test(t) && /\b(?:rendimientos?|intereses)\b/.test(t) && hay.length === 1) {
    const cuenta = hallarCuentas(t, ctx)[0];
    const clave = cuenta ? ctx.cuentas.find(c => c.id === cuenta.id)?.clave : undefined;
    if (clave) return { frases: [`+rendimientos ${hay[0]} ${clave}`] };
  }

  // ---- topes -------------------------------------------------------------------------------------------------------
  const habla = /\b(?:tope|presupuesto)s?\b/.test(t) || /\bgastar maximo\b|\bcuanto me pase\b/.test(t)
    || (/\b(?:casa|entre todos|fondo)\b/.test(t) && /\b(?:tenemos|tiene)\b/.test(t) && /\bpara\b/.test(t));
  // «ponme 300k en comida» sin decir tope
  if (habla || /^(?:dejame|ponme|deja|pon)\s+\d/.test(t)) {
    if (/\bavisame\b|\bavisarme\b|\bavisa\b/.test(t) && (pct || /mitad|\bquede\b/.test(t))) {
      return { texto: 'Ya te aviso solo: cuando una categoría con tope llega al 80 % y otra vez al 100 %. Esos dos avisos son fijos, no se pueden cambiar. Para tener el aviso, fija el tope: «tope comida 300000».' };
    }
    if (/\bavisame\b.*\bcuanto llevo\b|\bcuanto llevo\b.*\b(?:tope|presupuesto)\b/.test(t) && /\bsemanal\b/.test(t)) {
      const cat = categoriaDe(t, ctx);
      if (!cat) return { texto: pidePorCategoria(ctx, '') };
      const g = gastadoMes(datos, ctx, cat); const tp = topeDe(datos, cat);
      return { texto: `Los topes son mensuales, no hay uno semanal. En ${nombreDe(ctx, cat)} llevas ${peso(g)} este mes${tp ? ` de un tope de ${peso(tp)}` : ' y no tiene tope todavía'}.` };
    }
    if (/\b(?:cada quincena|por quincena|quincenal(?:es)?)\b/.test(t) && hay.length) {
      const cat = categoriaDe(t, ctx);
      return { texto: `Los topes son mensuales. ${peso(hay[0])} por quincena son ${peso(hay[0] * 2)} al mes${cat ? `: escribe «tope ${nombreDe(ctx, cat).toLowerCase()} ${hay[0] * 2}»` : ' y lo fijas con «tope comida ' + hay[0] * 2 + '»'}.` };
    }
    if (/\b(?:todo el ano|durante el ano|anual|al ano|del ano)\b/.test(t) && hay.length) {
      const cat = categoriaDe(t, ctx); const mes = Math.round(hay[0] / 12);
      return { texto: `Los topes son mensuales, no anuales. ${peso(hay[0])} al año son unos ${peso(mes)} al mes${cat ? `: escribe «tope ${nombreDe(ctx, cat).toLowerCase()} ${mes}»` : ''}.` };
    }
    if (new RegExp(String.raw`\bdesde (?:el proximo mes|${MESES})\b`).test(t) && hay.length) {
      const cat = categoriaDe(t, ctx); const mes = t.match(new RegExp(MESES))?.[0] ?? 'el próximo mes';
      return { texto: `Los topes no se programan por mes: este mes queda igual. Cuando llegue ${mes} escribe «tope ${cat ? nombreDe(ctx, cat).toLowerCase() : 'salidas'} ${hay[0]}».` };
    }
    // el tope de una casa o un fondo compartido
    if (/\b(?:casa|entre todos|fondo)\b/.test(t) && /\b(?:tenemos|tiene|hay)\b/.test(t) && hay.length) {
      const cat = categoriaDe(t, ctx);
      return { texto: `Los topes son de una sola persona: no hay presupuestos compartidos. Si tú llevas las cuentas de la casa, fija el tuyo con «tope ${cat ? nombreDe(ctx, cat).toLowerCase() : 'comida'} ${hay[0]}»${hay[1] ? ` (o la parte que te toca, ${peso(hay[1])})` : ''}.` };
    }
    // si pasar plata entre cuentas o una compra a cuotas cuenta en el tope
    if (/\b(?:consume|cuenta|descuenta|gasta)\b/.test(t) && /\b(?:pase|mande|movi|bolsillo|transferi|traslade)\b/.test(t)) {
      return { texto: 'No: pasar plata entre tus cuentas o a un bolsillo no es un gasto y no cuenta en ningún tope. Solo lo que gastas de verdad en la categoría lo gasta.' };
    }
    if (/\bcuotas?\b/.test(t) && /\?|\bcuenta (?:todo|solo)\b/.test(texto + (/cuenta todo|solo la cuota/.test(t) ? '?' : ''))) {
      return { texto: 'En el tope cuenta la compra completa, el día que se hace, no cada cuota. Las cuotas no se llevan por separado.' };
    }
    if (/\bcuenta solo\b/.test(t) && /\b(?:me toco|puse|a mi)\b/.test(t)) {
      return { texto: `En un gasto compartido el tope cuenta solo tu parte. Anota lo que pusiste tú${hay[0] ? ` («mercado ${hay[0]}»)` : ''} o usa «a medias» y el bot apunta tu parte.` };
    }
    // la cuenta de lo que llevas del tope
    const consulta = /\bcuanto (?:me )?(?:queda|falta|llevo|he gastado|gaste|me pase)\b/.test(t) || /\bme (?:paso|pasaria)\b/.test(t) || /\bya me gaste\b/.test(t) || (!!pct && /\bvoy por\b/.test(t));
    if (consulta) {
      const cat = categoriaDe(t, ctx);
      if (!cat) return { texto: `No tengo una categoría de «${t.match(/\b(?:presupuesto|tope|en) de (?:la |el )?([a-z]+)/)?.[1] ?? t.match(/\ben ([a-z]+)/)?.[1] ?? 'esa'}». Escribe «tope comida 300000» con una de las tuyas.` };
      const nombre = nombreDe(ctx, cat);
      const g = gastadoMes(datos, ctx, cat); const tp = topeDe(datos, cat);
      // «ya me gasté 180k en comida y el tope era 150k»
      const ya = /\bya me gaste\b/.test(t) && hay.length >= 2 ? { g: hay[0], tp: hay[1] } : null;
      if (ya) return { texto: ya.g > ya.tp ? `Llevas ${peso(ya.g)} en ${nombre} y el tope es de ${peso(ya.tp)}: te pasaste por ${peso(ya.g - ya.tp)}. No cambié el tope.` : `Llevas ${peso(ya.g)} de ${peso(ya.tp)} en ${nombre}: te quedan ${peso(ya.tp - ya.g)}.` };
      // «voy por el 75% ... si el tope es 200k»
      if (pct && hay.some(x => x >= 1000)) { const tope = hay.filter(x => x >= 1000).pop() as number; return { texto: `El ${pct[1]} % de un tope de ${peso(tope)} en ${nombre} son ${peso(Math.round(tope * Number(pct[1]) / 100))}.` }; }
      // «si gasto 40k hoy en ropa, ¿me paso?»
      const hipo = /\bsi gasto\b/.test(t) && hay.length ? hay[0] : 0;
      if (!tp) return { texto: `${nombre} no tiene tope todavía${g ? `: llevas ${peso(g)} este mes` : ''}. Fíjalo con «tope ${nombre.toLowerCase()} 300000»${hipo ? ` y así sé si ${peso(hipo)} te pasa` : ''}.` };
      if (hipo) {
        const total = g + hipo;
        return { texto: total > tp ? `Sí: con ${peso(hipo)} en ${nombre} llevarías ${peso(total)} y te pasarías del tope de ${peso(tp)} por ${peso(total - tp)}. No anoté nada.` : `No te pasas: con ${peso(hipo)} llevarías ${peso(total)} de ${peso(tp)} en ${nombre}; te quedarían ${peso(tp - total)}. No anoté nada.` };
      }
      return { texto: g > tp ? `En ${nombre} llevas ${peso(g)} de un tope de ${peso(tp)}: te pasaste por ${peso(g - tp)}.` : `En ${nombre} llevas ${peso(g)} de ${peso(tp)}: te quedan ${peso(tp - g)}.` };
    }
    // quitar el tope
    if (/\b(?:quita|quitar|elimina|borra|saca)\b/.test(t)) {
      const cat = categoriaDe(t, ctx);
      return cat ? { frases: [`quitar tope ${ctx.cuentas.find(c => c.id === cat)?.clave}`], extra: 'Tus gastos siguen como estaban.' } : { texto: pidePorCategoria(ctx, '') };
    }
    // fijar, subir o bajar un tope: queda en el monto que se dice, no se suma al anterior
    if (/\b(?:pon|ponme|ponle|deja|dejame|sube|subeme|baja|bajame|fija|fijame|cambia|cambiame|actualiza|quiero|pasa)\b|\btope de\b/.test(t) && (hay.length || /\ben cero\b|\bcero\b/.test(t))) {
      // «pasa el tope que tenía en ocio para Salidas, son 120k»: queda en la categoría de destino
      const pares: { cat: string | null; monto: number; dicho: string }[] = [];
      const partes = hay.length > 1 && /\by\b/.test(t) ? t.split(/\s+y\s+/) : [t];
      for (const p of partes) {
        const m = montos(p)[0] ?? (/\bcero\b/.test(p) ? 0 : undefined);
        if (m === undefined) continue;
        const palabras = p.replace(/^.*\b(?:para|en|de)\b\s+(?:el |la |los |las )?(?=[a-z])/, '').trim();
        const cat = categoriaDe(/\bpasa\b/.test(p) ? p.split(/\bpara\b/).pop() ?? p : p.replace(/.*\bpara\b/, '').replace(/.*\bde\b(?= [a-z]+$)/, '') || p, ctx) ?? categoriaDe(p, ctx);
        pares.push({ cat, monto: m, dicho: palabras });
      }
      if (!pares.length) return null;
      if (pares.some(x => !x.cat)) { const sin = pares.find(x => !x.cat); return { texto: pidePorCategoria(ctx, sin?.dicho.split(' ').slice(0, 3).join(' ') ?? '', sin?.monto) }; }
      if (pares.some(x => x.monto === 0)) return { texto: 'Un tope en cero no existe: el tope tiene que ser mayor que cero. Si no quieres gastar nada en esa categoría, no le pongas tope y no anotes gastos ahí.' };
      const frases = pares.map(x => `tope ${ctx.cuentas.find(c => c.id === x.cat)?.clave} ${x.monto}`);
      return { frases, extra: /\bpasa\b/.test(t) ? 'Si el tope viejo era de otra categoría que tengas, quítalo con «quitar tope …».' : undefined };
    }
    return null;
  }

  // ---- metas -------------------------------------------------------------------------------------------------------
  const hablaMeta = /\b(?:meta|ahorro|ahorrado|ahorrar|apartado|colchon)\b|\bquiero (?:juntar|ahorrar)\b/.test(t) || leerMetas(datos.config).some(m => t.includes(limpiar(m.nombre)));
  if (!hablaMeta && !/\bporcentaje\b/.test(t)) return null;
  const metas = leerMetas(datos.config);
  const compartida = /\b(?:compartid[ao]s?|nuestra meta|entre \w+ y yo|armemos)\b|\b(?:laura|jorge|\w+) puso\b.*\b(?:ahorro|meta)\b|\b(?:yo puse|puse yo)\b.*\bpuso\b/.test(t);
  if (compartida) {
    const m = metaDe(t, datos);
    return { texto: `Las metas son tuyas: no hay metas compartidas ni aportes de otra persona. ${m && hay.length ? `Si quieres llevar la tuya, escribe «meta ${m.nombre} ${hay[0]}»` : 'Para llevar tu parte, crea tu meta con «meta viaje 800000»'} y apártale lo que pongas tú con «ahorré 50000 para ${m?.nombre ?? 'viaje'}».` };
  }
  // «tengo 350k de 1.2 millones para el computador, ¿qué porcentaje llevo?»
  if (/\bporcentaje\b|\bque porciento\b/.test(t) && hay.length >= 2) {
    const [a, b] = [Math.min(hay[0], hay[1]), Math.max(hay[0], hay[1])];
    return { texto: `Llevas ${peso(a)} de ${peso(b)}: es el ${(a / b * 100).toFixed(1).replace('.', ',')} % y te faltan ${peso(b - a)}.` };
  }
  // «la meta era de 500k y ya tenía 480k, hoy guardé 30k»
  const lleno = /\bmeta (?:era|es) de\b/.test(t) && hay.length >= 3 ? hay : null;
  if (lleno) {
    const [tope, antes, ahora] = lleno; const total = antes + ahora;
    return { texto: total >= tope ? `Con ${peso(ahora)} llegas a ${peso(total)}: completaste la meta de ${peso(tope)} y te sobran ${peso(total - tope)}. Lo que sobra queda donde está; no lo paso a otra meta solo.` : `Con ${peso(ahora)} llegas a ${peso(total)} y te faltan ${peso(tope - total)}.` };
  }
  const meta = metaDe(t, datos);
  // cuánto falta
  if (/\bcuanto (?:me )?falta\b/.test(t) && meta) {
    const m = metas.find(x => limpiar(x.nombre) === meta.nombre);
    return m ? { texto: `Para ${m.nombre} llevas ${peso(m.apartado)} de ${peso(m.meta)}: te faltan ${peso(Math.max(0, m.meta - m.apartado))}.` } : { texto: `No tengo una meta «${meta.nombre}». Escribe «metas» para verlas o «meta ${meta.nombre} 500000» para crearla.` };
  }
  // cambiar el objetivo
  if (/\b(?:ya no es de|ahora (?:quiero|es|sera))\b/.test(t) && meta?.existe && hay.length) {
    return { frases: [`meta ${meta.nombre} ${hay[hay.length - 1]}`] };
  }
  // pasar lo apartado a otra cosa
  if (/\b(?:lo que tenia|lo apartado)\b/.test(t) && /\bahora lo quiero\b/.test(t)) {
    const otras = [...t.matchAll(/\bpara (?:la |el )?([a-z]{3,})/g)].map(x => x[1]);
    const de = metas.find(m => otras.some(o => limpiar(m.nombre) === o));
    const a = otras.filter(o => !metas.some(m => limpiar(m.nombre) === o)).pop() ?? otras[otras.length - 1];
    const monto = de ? de.apartado : 0;
    return { texto: `¿Quieres pasar${monto ? ` los ${peso(monto)}` : ' lo apartado'} de ${de ? limpiar(de.nombre) : 'esa meta'} a ${a}? Escribe «saqué ${monto || 100000} de la meta ${de ? limpiar(de.nombre) : 'bici'}» y luego «ahorré ${monto || 100000} para ${a}» (si no existe, créala antes con «meta ${a} 3000000»). No muevo nada sin que me lo digas.` };
  }
  // cancelar una meta
  if ((/\b(?:cancela|quita|elimina|borra)\b/.test(t) || /\bya no voy a ahorrar\b/.test(t)) && meta?.existe) {
    return { frases: [`quitar meta ${meta.nombre}`], extra: 'La plata que estaba apartada sigue en tus cuentas.' };
  }
  // un aporte que se hará: no se anota
  if (/\b(?:voy a|va a|pienso|planeo|quiero)\b.*\b(?:meter|meterle|guardar|ahorrar|apartar|separar|aportar)\b/.test(t) && hay.length && !/\bcrea\b/.test(t)) {
    return { texto: `Eso todavía no pasó, así que no moví nada. Cuando lo hagas escribe «ahorré ${hay[0]} para ${meta?.nombre ?? 'moto'}».` };
  }
  // aportes que se repiten solos
  if (/\b(?:cada|todas las|todos los)\b.*\b(?:quincena|semana|mes)\b/.test(t) && /\b(?:aparta|ahorra|guarda|mete|separa)\b/.test(t) && hay.length) {
    return { texto: `Los aportes a una meta no se hacen solos: no hay aporte automático. Cada vez que apartes escribe «ahorré ${hay[0]} para ${meta?.nombre ?? 'viaje'}». Si quieres un recordatorio, déjalo como pago fijo.` };
  }
  // crear una meta
  if (/\b(?:crea|crear|armar|abre|nueva|quiero juntar|quiero ahorrar|quiero una meta)\b/.test(t) && hay.length && meta) {
    return { frases: [`meta ${meta.nombre} ${hay[0]}`], extra: /\b(?:diciembre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre)\b/.test(t) ? `La fecha no la guarda la meta: ponla tú en el calendario. Lo apartas con «ahorré 100000 para ${meta.nombre}».` : undefined };
  }
  // sacar de una meta: «saqué 20k al ahorro del viaje», «réstale 40k a lo que llevo ahorrado para la moto», «usé los 120k que había separado para pagar el arriendo»
  const sacar = /\b(?:saque|retire|reste|restale|quitale|usé|use|gaste)\b/.test(t) && hay.length && (/\b(?:ahorro|meta|colchon|ahorrado|separado|apartado)\b/.test(t));
  if (sacar && meta?.existe) {
    const frases = [`saque ${hay[0]} de la meta ${meta.nombre}`];
    const pago = t.match(/\b(?:pagar|pague|pagarme|multa)\b\s*(?:el |la |una |un )?([a-z]{3,})?/);
    const motivo = /\bmulta\b/.test(t) ? 'multa' : t.match(/\bpagar (?:el |la |los |las )?([a-z]{3,})/)?.[1];
    if (motivo && pago) frases.push(`${motivo} ${hay[0]}`);
    return { frases };
  }
  if (sacar && !meta?.existe) return { texto: `No tengo una meta con ese nombre. Escribe «metas» para verlas.` };
  // aportar a una meta: «metí 100k al ahorro del viaje», «guardé 70k de Bancolombia para la meta del computador»
  const aporta = /\b(?:meti|puse|guarde|ahorre|aparte|separe|le meti|mande|pase)\b/.test(t) && hay.length && /\b(?:ahorro|meta|apartado|apartar)\b|\bseparad/.test(t);
  if (aporta && meta) {
    if (!meta.existe) return { texto: `No tengo una meta «${meta.nombre}». Créala con «meta ${meta.nombre} ${hay[0]}» y luego apartas con «ahorré ${hay[0]} para ${meta.nombre}».` };
    return { frases: [`ahorre ${hay[0]} para ${meta.nombre}`] };
  }
  return null;
}
