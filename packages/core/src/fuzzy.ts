/**
 * Tolerancia a errores de ortografía antes de interpretar: «gsate 12 mil en almurzo» se lee como «gaste 12 mil en almuerzo».
 * Cada palabra que el bot no conoce se cambia por la palabra del vocabulario más cercana (distancia de Damerau-Levenshtein).
 * Todo es local y determinista: mismas palabras, mismo resultado, sin red.
 *
 * Para no inventar: palabras de 4 o 5 letras admiten un error y las de 6 o más, dos; las de menos de 4 no se tocan, ni las que
 * traen cifras, ni las que ya son conocidas, ni las que parecen un nombre propio (mayúscula en medio de la frase, o justo
 * después de «a», «de», «con», «para» o «por», salvo que la corrección sea una cuenta). Si dos palabras distintas quedan a la
 * misma distancia, no se corrige: mejor que el resto del intérprete pregunte.
 */
import { aliasDeCuentas } from './entidades.ts';
import { normalizar } from './texto.ts';
import type { Resultado } from './parser/tipos.ts';
import type { Contexto } from './tipos.ts';

/** Distancia de Damerau-Levenshtein (alineación óptima): cambiar, quitar, poner o voltear dos letras vecinas cuesta 1. */
export function distanciaDL(a: string, b: string): number {
  if (a === b) return 0;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// Las palabras a las que se puede corregir: verbos y palabras de plata que el intérprete busca. Van solo formas que la gente
// escribe al anotar (pasado y sustantivos); «pagar» o «pagan» no están, para que «pagarn» tenga un solo candidato: «pagaron».
const VERBOS = [
  'gaste', 'gasto', 'gastos', 'compre', 'compra', 'compras', 'pague', 'pago', 'pagos', 'preste', 'prestamo', 'prestamos', 'presto',
  'prestaron', 'debo', 'deuda', 'deudas', 'pagaron', 'devolvio', 'devolvieron', 'regalaron', 'regale', 'regalo', 'reembolso',
  'reembolsaron', 'recibi', 'cobre', 'cobro', 'gane', 'abono', 'abone', 'salde', 'transferencia', 'transferi', 'traslade',
  'pase', 'saque', 'retire', 'retiro', 'consigne', 'consignaron', 'deposite', 'depositaron', 'transfirieron', 'ingreso',
  'ingresaron', 'entraron', 'llegaron', 'mandaron', 'enviaron', 'arqueo', 'cuadre', 'apertura', 'saldo', 'saldos', 'deshacer',
  'ayuda', 'anular', 'borrar', 'editar', 'corregir', 'resumen', 'semana', 'quincena', 'sueldo', 'salario', 'nomina', 'mesada',
  'chamba', 'vuelto', 'vueltas', 'devuelta', 'billete', 'billetes', 'efectivo', 'monedas', 'nequi', 'daviplata', 'dolares',
  'alcancia', 'lucas', 'barras', 'palos', 'millon', 'millones', 'pesos', 'recurrente', 'presupuesto', 'gravamen', 'almorce',
  'desayune', 'pasaje', 'pasajes', 'almuerzo', 'arriendo', 'mercado', 'parqueadero', 'propina', 'domicilio',
];

/** Las cuentas de siempre: después de «de» o «a» sí se corrigen («de neqi» es Nequi), porque no son nombres de personas. */
const CUENTAS = ['efectivo', 'monedas', 'nequi', 'neki', 'daviplata', 'davi', 'dolares', 'alcancia', 'billetera', 'sencillo', 'sueltos'];

// Palabras comunes que se dejan como están aunque se parezcan a una del vocabulario («paso» no es «pase», «sobre» no es «cobre»).
const COMUNES = `
  para pero como cuando donde porque este esta esto estos estas ese esa eso esos esas aquel todo toda todos todas otro otra otros
  otras mismo misma algo nada nadie alguien mucho mucha muchos muchas poco poca pocos pocas mas menos muy tambien solo sola ahora
  luego antes despues tarde temprano noche manana anoche siempre nunca todavia aun casi bien malo mala mejor peor nuevo nueva
  cada cual cuales quien quienes cuanto cuanta cuantos cuantas entre sobre bajo hasta desde hacia contra segun durante mientras
  sino tambien hola gracias favor listo dale bueno buena buenas vale okay okey claro igual entonces pues osea tipo cosa cosas
  cositas cosita parce parcero llave mano marica mija mijo senor senora seno amigo amiga amigos amigas novio novia esposo esposa
  hijo hija hijos casa calle parque tienda centro trabajo oficina colegio universidad clase clases banco cajero plata dinero
  pesitos pesito plata platica total cuenta cuentas valor precio costo cuesta costo costaron vale valio salio salieron
  david ademas paso pasa pasan pasar pasado pasada pasamos pasaron pasando base caso casos peso paga pagas pagan pagar pagado pagada pagamos
  pagando pagare pagara pagaria pagues debe deben debes deber debia debian debido debiendo gasta gastan gastar gastado gastamos
  gastando gastes compra compran comprar comprado compramos comprando presta prestan prestar prestado prestada prestamos
  prestame cobra cobran cobrar cobrado cobraron cobro sobre sobra sobras sobro resto resta saca sacar sacamos sacaron saco
  retira retirar retiramos retiraron mando mande manda mandar envio envie enviar llego llega llegar entro entra entrar recibe
  recibir recibio recibieron gana ganar gano ganaron ganado regala regalar regalos dio dieron dar doy dimos dieron daba
  tome tomo tomamos tomaron toma tomar comi comio comimos comer comida comidas fui fue fueron ido iba ibamos voy vamos vas van
  tengo tiene tienen tenia tenemos tener hice hizo hicimos hacer hago hace quede quedo quedan quedamos quedar queda
  puse puso pusimos poner pone dije dijo decir dice digo deje dejo dejar perdi perdio perdimos perder encontre encontro
  rompi rompio quito quite quitar quita anota anote anotar apunta apunte apuntar guarda guarde guardar mira mirar quiero quiere
  puedo puede necesito necesita sabe saber haber habia hubo
  lunes martes miercoles jueves viernes sabado domingo enero febrero marzo abril mayo junio julio agosto septiembre octubre
  noviembre diciembre hoy ayer anteayer antier semana semanas meses mitad medio media docena kilo kilos libra libras litro litros
  hora horas dias minutos veces vez unidad unidades paquete paquetes bolsa bolsas caja cajas botella botellas cerveza cervezas
  polas pola gaseosa gaseosas papas papa mama papi mami tia tio abuela abuelo abuelita abuelito hermano hermana prima primo
  pan pollo carne huevos queso arepa arepas tinto cafe jugo agua luz gas internet celular datos megas minutos plan recarga
  uber bus taxi moto metro buseta colectivo pasaje gasolina peaje parqueo
  uno una dos tres cuatro cinco seis siete ocho nueve diez once doce quince veinte treinta cuarenta cincuenta sesenta setenta
  ochenta noventa cien ciento doscientos trescientos cuatrocientos quinientos seiscientos setecientos ochocientos novecientos
  mil millon millones
  persona personas contacto nombre agregar agrega agrego anadir crear nueva renombrar cerrar abrir cuadrar saldar perdonar
  cambia cambie cambio cambiar cambiamos borra quita elimina anula revierte deshaz corrige modifica edita actualiza
  monto montos motor foto europa escena cinta celular congreso alcance bono bonos medio medios duda dudas nota notas
  devolvi devuelto devuelve devolver devolvieron consigno consigna ingresa ingresan llegan llega rebajo rebaja recibo recibos
  luca luka lukas moneda drogueria peluquero peluqueria suscripcion pedro rosa tito lucas pepe marta
  cuarto banquete meto mete meti metio
`;

const BASE = new Set([...VERBOS, ...CUENTAS, ...COMUNES.split(/\s+/).filter(Boolean)]);
const PREPOSICIONES = new Set(['a', 'de', 'con', 'para', 'por']);

/** Errores muy comunes que la distancia sola no resuelve porque otra palabra de uso diario queda igual de cerca («pagarn» está a uno de «pagar»). */
const FRECUENTES: Record<string, string> = { pagarn: 'pagaron', pagaro: 'pagaron', devolvieorn: 'devolvieron', consignarn: 'consignaron', depositarn: 'depositaron' };
// raíces del diccionario («droguer» vale para droguería): no son palabras completas a las que corregir
const RAICES = new Set(['droguer', 'peluque']);

/** Formas de una palabra en singular: «empanadas» da «empanada»; sirve para dar por conocido un plural. */
function singulares(w: string): string[] {
  const f = [w];
  if (w.endsWith('es')) f.push(w.slice(0, -2));
  if (w.endsWith('s')) f.push(w.slice(0, -1));
  return f;
}

interface Vocabulario { conocidas: Set<string>; destinos: Map<string, string>; cuentas: Set<string> }

/** Arma el vocabulario de esta instalación: el fijo más el diccionario de categorías, las cuentas, las personas y lo aprendido. */
function vocabulario(ctx: Contexto): Vocabulario {
  const conocidas = new Set(BASE);
  const destinos = new Map<string, string>();
  const cuentas = new Set(CUENTAS);
  // cada destino dice en qué se convierte; «neki» va a «nequi» para que «neqi» no empate entre los dos
  const agregarDestino = (w: string, salida = w) => {
    if (w.length < 4 || !/^[a-z]+$/.test(w) || RAICES.has(w)) return;
    if (!destinos.has(w)) destinos.set(w, salida);
    conocidas.add(w);
  };
  for (const v of VERBOS) agregarDestino(v);
  for (const c of CUENTAS) agregarDestino(c, c === 'neki' ? 'nequi' : c);
  for (const [, alias] of aliasDeCuentas(ctx)) for (const a of alias) { const w = normalizar(a); cuentas.add(w); agregarDestino(w); }
  // las palabras del diccionario también en plural: «glletas» es «galletas», no «galleta»
  for (const cat of [...(ctx.diccionario?.categorias ?? []), ...(ctx.diccionario?.finalidad ?? [])]) {
    for (const p of cat.palabras) for (const w of normalizar(p).split(' ')) { agregarDestino(w); agregarDestino(/[aeiou]$/.test(w) ? `${w}s` : `${w}es`); }
  }
  for (const c of ctx.cuentas) {
    const palabras = normalizar(c.clave ?? c.nombre ?? '').split(' ');
    if (c.tipo === 'categoria' || c.tipo === 'dinero') for (const w of palabras) agregarDestino(w);
    if (c.tipo === 'dinero') for (const w of palabras) cuentas.add(w);
    // las personas, fuentes y demás se dan por conocidas pero nunca son destino: «Danyel» no se vuelve «Daniel» aquí
    for (const w of palabras) conocidas.add(w);
  }
  for (const w of Object.keys(ctx.aprendido ?? {})) conocidas.add(normalizar(w));
  for (const a of ctx.atajos ?? []) for (const w of normalizar(a.palabra).split(' ')) conocidas.add(w);
  return { conocidas, destinos, cuentas };
}

const esConocida = (w: string, v: Vocabulario): boolean => singulares(w).some(s => v.conocidas.has(s));

/** ¿Es una palabra que esta instalación conoce (vocabulario, cuentas, personas, lo aprendido)? Sirve para partir palabras pegadas. */
export function conoceLaPalabra(ctx: Contexto): (w: string) => boolean {
  const v = vocabulario(ctx);
  return w => esConocida(normalizar(w), v);
}

/** La palabra del vocabulario más cercana, o null si no hay una sola a la distancia permitida. */
function candidata(w: string, v: Vocabulario): string | null {
  const tope = w.length >= 6 ? 2 : 1;
  let mejor = tope + 1;
  let elegidas = new Set<string>();
  for (const [destino, salida] of v.destinos) {
    if (Math.abs(destino.length - w.length) > tope) continue;
    const d = distanciaDL(w, destino);
    if (d < mejor) { mejor = d; elegidas = new Set([salida]); } else if (d === mejor) elegidas.add(salida);
  }
  if (mejor > tope || elegidas.size !== 1) return null;
  // si una palabra común queda igual de cerca o más («mediio» está a uno de «medio»), era esa y no se corrige
  for (const c of v.conocidas) {
    if (!v.destinos.has(c) && Math.abs(c.length - w.length) <= mejor && distanciaDL(w, c) <= mejor) return null;
  }
  return [...elegidas][0];
}

/**
 * Corrige las palabras mal escritas de un mensaje antes de interpretarlo. Devuelve el mismo texto si no hay nada que corregir.
 * Las palabras corregidas quedan sin tildes; el resto del mensaje no se toca.
 */
export function corregirTypos(texto: string, ctx: Contexto): string {
  if (texto.length > 400) return texto;
  let v: Vocabulario | null = null;
  const partes = texto.split(/(\s+)/);
  let anterior = '';
  let inicio = true;
  for (let i = 0; i < partes.length; i += 2) {
    const crudo = partes[i];
    if (!crudo) continue;
    const m = /^([^\p{L}\p{N}]*)(\p{L}+)([^\p{L}\p{N}]*)$/u.exec(crudo);
    const previa = anterior;
    const eraInicio = inicio;
    anterior = normalizar(crudo.replace(/[^\p{L}\p{N}]/gu, ''));
    inicio = /[.!?\n]$/.test(crudo);
    // con cifras, hashtags o símbolos pegados («10mil», «#viaje», «+mamá») la palabra no se toca
    if (!m || /[#@+$]/.test(m[1])) continue;
    const w = normalizar(m[2]);
    if (w.length < 4 || !/^[a-z]+$/.test(w)) continue;
    v ??= vocabulario(ctx);
    if (esConocida(w, v)) continue;
    // mayúscula en medio de la frase: casi seguro un nombre («le presté a Faber»)
    if (!eraInicio && /^\p{Lu}/u.test(m[2])) continue;
    const nueva = FRECUENTES[w] ?? candidata(w, v);
    if (!nueva) continue;
    // después de «a», «de», «con»... o justo antes de «me» («pedro me pagó») suele ir una persona: solo se corrige a una cuenta
    const siguiente = normalizar(partes[i + 2] ?? '');
    if ((PREPOSICIONES.has(previa) || /^(?:me|te|nos)$/.test(siguiente)) && !v.cuentas.has(nueva)) continue;
    partes[i] = m[1] + nueva + m[3];
    if ((globalThis as any).process?.env?.FUZZY_LOG) console.error(`FUZZY ${w} -> ${nueva} :: ${texto}`);
  }
  return partes.join('');
}

/** ¿Una palabra imposible en español? Cuatro consonantes seguidas que no son de las que existen («instrumento», «abstracto»). */
function ilegible(w: string): boolean {
  if (w.length < 5) return false;
  const racha = w.match(/[bcdfghjklmnpqrstvwxz]{4,}/g);
  // una racha con tres letras distintas o más: «zzzq» (relleno de prueba) no cuenta
  return !!racha?.some(r => new Set(r).size >= 3 && !/^[bnr]s[bcdfgpt][rl]/.test(r));
}

/**
 * «Ibgrwsi 50k»: con una palabra que no se puede leer no se adivina un gasto. Se pregunta qué fue, con la plata dicha.
 * Devuelve null si el mensaje no trae una palabra así o no trae cifras.
 */
export function aclararIlegible(texto: string, ctx: Contexto): Resultado | null {
  if (!/\d/.test(texto) || texto.length > 400) return null;
  const v = vocabulario(ctx);
  const raras = texto.split(/\s+/).filter(p => /^\p{L}+$/u.test(p) && !esConocida(normalizar(p), v) && ilegible(normalizar(p)));
  if (!raras.length) return null;
  const resto = texto.split(/\s+/).filter(p => !raras.includes(p)).join(' ').trim();
  return {
    clase: 'pregunta',
    mensaje: `No entendí «${raras[0]}». ¿Qué pasó con ${resto}?`,
    opciones: [
      { titulo: 'Me entró plata', frase: `ingreso ${resto}` },
      { titulo: 'Lo gasté', frase: `gaste ${resto}` },
    ],
  };
}
