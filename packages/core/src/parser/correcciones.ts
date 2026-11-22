// Responder una pregunta de la tarjeta o corregirla con una frase corta.
import { error, type Faltante, type Propuesta } from './tipos.ts';
import { listaCategorias, tramosDe } from './comun.ts';
import { leerPago } from './pago.ts';
import { gasto, ingreso, transferencia } from './movimientos.ts';
import { ES_APODO, NO_ES_PERSONA, ROLES, aplicarRol, faltanteGrupo } from './personas.ts';
import { hallarMontos, aMinor, formatear } from '../dinero.ts';
import { borrarTramos, categoriaPorNombre, gruposDe, hallarCuentas } from '../entidades.ts';
import { hallarFecha } from '../fechas.ts';
import { capitalizar, limpiar, titulo } from '../texto.ts';
import { extraerEtiquetas } from '../etiquetas.ts';
import { type Contexto, type Cuenta, type Grupo, type Moneda } from '../tipos.ts';

// ---------------------------------------------------------------------------------------
// Correcciones: responder una pregunta o editar una tarjeta
// ---------------------------------------------------------------------------------------

/**
 * Responde a lo que falta (categoría, lugar, persona). Devuelve la propuesta actualizada,
 * la palabra aprendida (para que la próxima vez no pregunte) o un mensaje de error.
 */
export function resolverFaltante(
  p: Propuesta, texto: string, ctx: Contexto,
): { propuesta: Propuesta } & { aprende?: { palabra: string; categoriaId: string } } | { error: string } {
  const f = p.faltantes[0];
  if (!f) return { error: 'No hay nada pendiente por responder.' };
  const t = limpiar(texto);
  const sig: Propuesta = { ...p, faltantes: p.faltantes.slice(1) };

  if (f.campo === 'categoria') {
    const cat = categoriaPorNombre(t, ctx) ?? ctx.cuentas.find(c => c.tipo === 'categoria' && c.clave === t);
    if (!cat) return { error: `No reconozco esa categoría. Responde con una: ${listaCategorias(ctx).join(', ')}.` };
    sig.categoriaId = cat.id;
    // para transporte hay que seguir preguntando el recorrido
    if (cat.id === 'cat:transporte' && !sig.hasta) {
      sig.faltantes.unshift({ campo: 'hasta', pregunta: '¿A dónde fue? Responde con el lugar de llegada (p. ej. «Casa»).' });
    }
    const palabra = (f.dato ?? '').split(' ').filter(Boolean).pop();
    return { propuesta: sig, aprende: palabra ? { palabra, categoriaId: cat.id } : undefined };
  }
  if (f.campo === 'desde' || f.campo === 'hasta') {
    const lugar = titulo(texto.trim().replace(/^(de|desde|a|hasta|la|el)\s+/i, ''));
    if (!lugar) return { error: 'Escribe el nombre del lugar.' };
    sig[f.campo] = lugar;
    if (f.campo === 'hasta' && !sig.desde) {
      sig.faltantes.unshift({ campo: 'desde', pregunta: `¿Desde dónde saliste hacia ${lugar}? Responde con el lugar (p. ej. «Terminal»).` });
    }
    return { propuesta: sig };
  }
  if (f.campo === 'grupo') {
    if (t === limpiar(NO_ES_PERSONA) || /^no es (una )?persona$/.test(t)) {
      // era una palabra del concepto, no una persona: sigue como gasto normal
      sig.persona = undefined; sig.pedirGrupo = undefined;
      sig.faltantes = sig.faltantes.filter(x => x.campo !== 'rol' && x.campo !== 'cobro');
      return { propuesta: sig };
    }
    // «Es un apodo de...»: se pregunta de quién y, al confirmar, el nombre queda como apodo de esa persona
    if (t === limpiar(ES_APODO) || /^es un apodo/.test(t)) {
      const conocidas = ctx.cuentas.filter(c => c.tipo === 'persona').map(c => c.nombre).slice(0, 12);
      if (!conocidas.length) return { error: 'Todavía no conozco a nadie a quien ponerle ese apodo. Elige un grupo.' };
      sig.faltantes.unshift({ campo: 'apodo', dato: f.dato, pregunta: `¿De quién es apodo «${f.dato}»?`, opciones: conocidas });
      return { propuesta: sig };
    }
    const g = gruposDe(ctx).find(x => limpiar(x.nombre) === t);
    if (!g) return { error: `Elige una opción: ${(f.opciones ?? []).join(' · ')}.` };
    sig.grupoPersona = g.id;
    return { propuesta: sig };
  }
  if (f.campo === 'apodo') {
    const dato = f.dato ?? '';
    const persona = ctx.cuentas.find(c => c.tipo === 'persona' && (limpiar(c.nombre) === t || c.clave === t));
    if (!persona) return { error: `Elige una opción: ${(f.opciones ?? []).join(' · ')}.` };
    const cambiar = (n: string) => (limpiar(n) === limpiar(dato) ? persona.nombre : n);
    if (sig.persona) sig.persona = cambiar(sig.persona);
    if (sig.personas) sig.personas = sig.personas.map(x => ({ ...x, nombre: cambiar(x.nombre) }));
    sig.concepto = sig.concepto.replace(titulo(dato), persona.nombre);
    sig.pedirGrupo = false;
    sig.apodoNuevo = { apodo: limpiar(dato), personaId: persona.id };
    return { propuesta: sig };
  }
  if (f.campo === 'cobro') {
    if (t === 'se lo fie' || t === 'fiado' || t === 'fie') sig.fiado = true;
    else if (t === 'pago ahora' || t === 'pago' || t === 'contado') sig.fiado = false;
    else return { error: `Elige una opción: ${(f.opciones ?? []).join(' · ')}.` };
    return { propuesta: sig };
  }
  if (f.campo === 'rol') {
    const rol = ROLES.find(r => limpiar(r.nombre) === t || (r.alias as readonly string[]).includes(t));
    if (!rol) return { error: `Elige una opción: ${(f.opciones ?? []).join(' · ')}.` };
    return { propuesta: aplicarRol(sig, rol.id, ctx) };
  }
  // persona
  const dato = f.dato ?? '';
  const nuevo = /\bnuevo\b/.test(t);
  const elegida = (f.opciones ?? []).find(o => limpiar(o) === t || limpiar(o.replace(/ \(nuevo\)$/, '')) === t.replace(/ nuevo$/, ''));
  const nombreFinal = nuevo || !elegida ? titulo(dato) : elegida;
  if (!nuevo && !elegida) return { error: `Elige una opción: ${(f.opciones ?? []).join(' · ')}.` };
  const reemplazar = (n: string) => (limpiar(n) === limpiar(dato) || limpiar(n) === limpiar(titulo(dato)) ? nombreFinal : n);
  if (sig.persona) sig.persona = reemplazar(sig.persona);
  if (sig.personas) sig.personas = sig.personas.map(x => ({ ...x, nombre: reemplazar(x.nombre) }));
  sig.concepto = sig.concepto.replace(titulo(dato), nombreFinal);
  // una persona nueva que apareció sin verbo claro: falta saber de qué grupo es
  if (nuevo && sig.pedirGrupo) sig.faltantes.unshift(faltanteGrupo(nombreFinal, ctx));
  return { propuesta: sig };
}

/**
 * Cambiar el monto de un gasto compartido: si estaba repartido en partes iguales (todos ponen lo mismo, tú incluido),
 * se reparte de nuevo con el monto nuevo y se avisa; si las partes eran distintas, no se tocan y se avisa también.
 */
function repartirDeNuevo(antes: Propuesta, sig: Propuesta): void {
  const personas = antes.personas;
  if (antes.tipo !== 'compartido' || antes.pagoOtro || !personas?.length || sig.monto === antes.monto) return;
  const partes = personas.length + 1; // tú también
  const cada = Math.floor(antes.monto / partes);
  const iguales = personas.every(x => x.monto === cada);
  if (!iguales) {
    sig.avisos.push(`Cambié el total, pero las partes de las personas no cambian (${personas.map(x => `${x.nombre} ${formatear(x.monto, sig.moneda)}`).join(', ')}). Tu parte ahora es ${formatear(Math.max(sig.monto - personas.reduce((s, x) => s + x.monto, 0), 0), sig.moneda)}. Si el reparto también cambió, escríbelo de nuevo.`);
    return;
  }
  const nuevo = Math.floor(sig.monto / partes);
  sig.personas = personas.map(x => ({ ...x, monto: nuevo }));
  sig.avisos.push(`Repartí de nuevo: cada uno ${formatear(nuevo, sig.moneda)} (partes iguales entre ${partes}, tú incluido).`);
}

/**
 * Aplica una corrección a una tarjeta que aún no se confirmó. Solo se acepta si TODO el texto
 * es una corrección reconocible (así un gasto nuevo como «mecato 5000» nunca se confunde con una):
 *
 *   «vuelto 5k y 500 monedas» · «sin vuelto» · «con billete de 10k» · «monto 6000» · «6000»
 *   «nequi» · «categoría comida» · «comida» · «ayer» · «#cumple-daniel» · «de terminal a casa»
 *   «concepto empanadas»
 *
 * Devuelve la propuesta corregida, o null si el texto no parece una corrección.
 */
export function aplicarCambio(p: Propuesta, texto: string, ctx: Contexto): Propuesta | null {
  const ex = extraerEtiquetas(texto);
  if (ex.error) return null;
  let t = limpiar(ex.etiquetas.length ? ex.texto : texto);
  if (!t && !ex.etiquetas.length) return null;
  const sig: Propuesta = { ...p, avisos: [] };
  if (ex.etiquetas.length) sig.etiqueta = ex.etiquetas.join(' ');
  // el ✕ de la última etiqueta de la tarjeta
  if (!ex.etiquetas.length && /^sin etiquetas?$/.test(t)) { sig.etiqueta = undefined; return sig; }
  const consumir = (re: RegExp): RegExpMatchArray | null => {
    const m = t.match(re);
    if (m) t = (t.slice(0, m.index) + ' ' + t.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim();
    return m;
  };

  // Evento
  const et = consumir(/^etiqueta ([a-z0-9-]+)/);
  if (et) sig.etiqueta = et[1];

  // Cómo se pagó: «con 10k», «con 2k y 800 en monedas», «vuelto 5k y 500 monedas», «justo», «sin vuelto»
  if (/^(sin vuelto|justo|exacto|pague justo)$/.test(t)) {
    // «justo»: pagó exacto, sin billete ni vuelto que corregir
    sig.formaPago = 'justo';
    sig.billeteMayor = undefined;
    sig.pagoCon = undefined; sig.pagoMonedas = undefined; sig.restoEnMonedas = undefined;
    sig.vuelto = { billetes: 0, monedas: 0 };
    t = '';
  } else if (/^(?:pague )?con\b|^(?:con )?(?:vuelto|me dieron|de vuelto)\b/.test(t)) {
    const pg = leerPago(t, hallarMontos(t));
    if (pg.hayCon) {
      sig.pagoCon = pg.pagoCon; sig.pagoMonedas = pg.pagoMonedas; sig.restoEnMonedas = pg.restoEnMonedas;
      sig.formaPago = undefined; sig.billeteMayor = undefined;
      if (!pg.vueltoDicho) sig.vuelto = null; // al cambiar con qué pagó se recalcula el vuelto
    }
    if (pg.vueltoDicho && pg.vuelto) sig.vuelto = pg.vuelto;
    if (pg.hayCon || pg.vueltoDicho) t = '';
  }

  // Concepto
  const mcon = consumir(/^concepto (.+)$/);
  if (mcon) sig.concepto = capitalizar(mcon[1]);

  // Categoría: «categoría comida» o solo el nombre
  const mcat = consumir(/^(?:categoria|cat) (.+)$/);
  const nombreCat = mcat ? mcat[1] : t;
  const cat = categoriaPorNombre(nombreCat, ctx);
  if (cat && (mcat || cat.clave === t)) {
    sig.categoriaId = cat.id;
    sig.faltantes = sig.faltantes.filter(x => x.campo !== 'categoria');
    t = '';
  }

  // Recorrido de transporte
  const mlug = consumir(/^(?:de|desde) (.+?) (?:a|hasta|hacia) (.+)$/);
  if (mlug && sig.categoriaId === 'cat:transporte') {
    sig.desde = titulo(mlug[1]);
    sig.hasta = titulo(mlug[2]);
    sig.faltantes = sig.faltantes.filter(x => x.campo !== 'desde' && x.campo !== 'hasta');
  } else if (mlug) {
    return null;
  }

  // Fecha (solo si es lo único que queda)
  const f = hallarFecha(t, ctx.ahora);
  if (f.explicita && f.resto === '') {
    sig.ocurridoEn = f.fecha;
    t = '';
  }

  // Monto: «monto 6000», «valor 6000» o solo «6000»
  const mm = t.match(/^(?:monto|valor|fue|son)? ?(.+)$/);
  if (mm && (p.tipo === 'gasto' || p.tipo === 'compartido' || p.tipo === 'ingreso')) {
    const ms = hallarMontos(mm[1]).filter(m => m.explicito);
    if (ms.length === 1 && borrarTramos(mm[1], tramosDe(ms)).trim() === '') {
      sig.monto = aMinor(ms[0].valor, sig.moneda);
      repartirDeNuevo(p, sig);
      t = '';
    }
  }

  // Cuenta: una sola palabra («nequi»)
  const cuentas = hallarCuentas(t, ctx);
  if (cuentas.length === 1 && t.split(' ').length === 1 && p.tipo !== 'transferencia') {
    sig.cuentaId = cuentas[0].id;
    t = '';
  }

  if (t !== '') return null; // quedó algo sin entender: no es una corrección

  // Los avisos del pago (no cuadra, falta plata...) los calcula la tarjeta con los datos nuevos.
  return sig;
}

