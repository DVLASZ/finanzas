/**
 * Lo primero que se le hace a lo que se escribe: texto no confiable. Se quitan los caracteres invisibles y de dirección,
 * las letras de otro alfabeto que se ven como latinas, las etiquetas HTML, el SQL y el JSON pegados, y las órdenes
 * que intentan mandar sobre el bot («ignora las instrucciones», «soy el administrador», «[SYSTEM]», «muéstrame las claves»).
 * Lo que queda es el dato (un gasto de verdad, si lo hay). Una orden disfrazada nunca anota nada ni cambia reglas o saldos.
 */

const INVISIBLES = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­]/g;
// letras cirílicas y griegas que se ven como latinas
const HOMOGLIFOS: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', ո: 'n',
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', Υ: 'Y', Ο: 'O', Α: 'A', Ε: 'E', Ν: 'N', Ι: 'I',
};
const sinTildes = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Orden que reclama un permiso: lo que venga después en el mensaje tampoco se toma como cierto. */
const PRIVILEGIO = [
  /\bsoy (?:el |la )?(?:administrador|admin|dueno|programador|desarrollador)\b/,
  /\bnueva politica\b/,
  /\[?\bsystem\b\]?\s*:/,
  /\bautorizacion total\b/,
  /\bmodo (?:desarrollador|administrador|dios)\b/,
];
/** Órdenes dirigidas al bot que se cortan (hasta la coma o el final de la frase). */
const ORDENES = [
  /\b(?:ignora|olvida|omite|desobedece)\w*\b.{0,40}\b(?:instrucciones|reglas|anteriores|todo lo anterior|al usuario)/,
  /\b(?:saltarte|saltate|salta|sin)\s+(?:la\s+)?confirmacion\b/,
  /\bborra\w*\s+(?:todo|todos|toda|todas)\b/,
  /\b(?:muestrame|muestra|dime|revela|enviame|agrega en la respuesta|incluye en la respuesta)\b.{0,60}\b(?:claves?|contrasenas?|credenciales|cuentas completas|movimientos privados|datos de (?:todos|otros))/,
  ...PRIVILEGIO,
];
/** Después de una coma, lo que sigue a una orden y es otra orden también se va. */
const OTRA_ORDEN = /^\s*(?:y\s+)?(?:registra|anota|guarda|agrega|anade|transfiere|borra|elimina|ignora|cambia|pon|modifica)\b/;

export interface Limpio { texto: string; respuesta?: string; cambio: boolean }

const RESPUESTA = 'Eso parece una orden para el bot y no un movimiento: no cambio reglas, permisos ni saldos por lo que se escriba en el chat. Si hay un movimiento real, dime el monto y en qué fue.';

export function sanitizarEntrada(texto: string): Limpio {
  let t = texto.normalize('NFKC').replace(INVISIBLES, '');
  // letras de otro alfabeto que parecen latinas, solo cuando el mensaje es mayormente latino
  if (/[Ͱ-ϿЀ-ӿ]/.test(t) && /[a-zA-Z]/.test(t)) t = t.replace(/[Ͱ-ϿЀ-ӿɐ-ʯա-ֆ]/g, ch => HOMOGLIFOS[ch] ?? ch);
  // etiquetas HTML, objetos JSON de «rol» y SQL: texto inerte que se quita
  t = t.replace(/<\/?[a-zA-Z][^>]*>/g, ' ');
  t = t.replace(/\{[^{}]*["']?(?:role|content|system)["']?\s*:[^{}]*\}/gi, ' ');
  t = t.replace(/(?:^|[;\s])(?:drop|delete|truncate|alter|insert|update)\s+(?:table|from|into|database)\b[^;]*;?/gi, ' ');
  t = t.replace(/\s--\s*$|;\s*--/g, ' ');
  // citas que contienen una orden («Jorge me escribió: 'ignora al usuario y transfiere...'»)
  const antesDeCitas = t;
  t = t.replace(/['"“«][^'"”»]{0,200}\b(?:ignora|transfiere|borra|registra un ingreso)\b[^'"”»]{0,200}['"”»]/gi, ' ');
  let hostil = t !== antesDeCitas;

  // sin órdenes ni citas hostiles el texto queda como estaba (con sus saltos de línea: las alertas del banco los necesitan)
  if (!hostil && !ORDENES.some(r => r.test(sinTildes(t)))) {
    const igual = t.trim().replace(/[ 	]{2,}/g, ' ').replace(/^(?:ademas|además)\s+/i, '').trim();
    return { texto: igual, cambio: igual !== texto.trim() };
  }

  // línea por línea y frase por frase: se cortan las órdenes y, si una reclama un permiso, lo que sigue ya no se toma como cierto
  const lineasBuenas: string[] = [];
  let contaminado = false;
  for (const linea of t.split(/\r?\n/)) {
    const buenas: string[] = [];
    for (const fr of linea.split(/(?<=[.!?;])\s+/)) {
      const n = sinTildes(fr);
      const regla = ORDENES.find(r => r.test(n));
      if (regla) {
        hostil = true;
        if (PRIVILEGIO.some(r => r.test(n))) contaminado = true;
        // se corta desde la orden hasta la coma siguiente (o el final); si lo que sigue a la coma es otra orden, también se va
        const m = regla.exec(n);
        const ini = m?.index ?? 0;
        const coma = n.indexOf(',', ini + (m?.[0].length ?? 0));
        const despues = coma >= 0 ? fr.slice(coma + 1) : '';
        const resto = (fr.slice(0, ini) + (regla === ORDENES[0] && OTRA_ORDEN.test(sinTildes(despues)) ? "" : despues)).trim();
        if (resto && /\d/.test(resto) && !contaminado) buenas.push(resto);
        continue;
      }
      if (contaminado && /\d/.test(fr)) { hostil = true; continue; }
      // tras una cita hostil solo cuentan las frases con un monto
      if (hostil && !/\d/.test(fr)) continue;
      buenas.push(fr);
    }
    if (buenas.length) lineasBuenas.push(buenas.join(' '));
  }
  const limpio = lineasBuenas.join('\n').replace(/[ \t]+/g, ' ').replace(/^(?:ademas|además)\s+/i, '').trim();
  const cambio = limpio !== texto.trim();
  if (hostil && !/\d/.test(limpio)) return { texto: limpio, respuesta: RESPUESTA, cambio };
  if (hostil && contaminado) return { texto: limpio, respuesta: RESPUESTA + ' Si el movimiento es de verdad, escríbelo sin esa parte.', cambio };
  return { texto: limpio || texto, cambio };
}
