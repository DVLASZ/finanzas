/**
 * Reconocer cuentas de dinero, personas y categorías dentro de un texto.
 */
import { esParecido, normalizar, slug, titulo } from './texto.ts';
import type { Contexto, Cuenta, Grupo } from './tipos.ts';

// ---------------------------------------------------------------------------------------
// Cuentas de dinero
// ---------------------------------------------------------------------------------------

/** Cómo puedes escribir cada cuenta (ya normalizado). Los errores de tipeo se toleran aparte. */
const ALIAS_CUENTAS: [string, string[]][] = [
  ['efectivo', ['efectivo', 'efectiv', 'efe', 'cash', 'billetera']],
  ['monedas', ['monedas', 'moneda', 'sueltos', 'sencillo']],
  ['alcancia', ['alcancia', 'alcancias']],
  ['nequi', ['nequi', 'nq', 'neki']],
  ['daviplata', ['daviplata', 'davi', 'daviplta']],
  ['arq', ['arq', 'dollarapp', 'dolarapp']],
];

export interface CuentaMencionada {
  id: string;
  inicio: number;
  fin: number;
}

/** Id de cuenta de dinero para una palabra suelta, o null. */
export function cuentaDePalabra(palabra: string, extra: [string, string[]][] = []): string | null {
  const todos = [...ALIAS_CUENTAS, ...extra];
  for (const [id, alias] of todos) {
    if (alias.includes(palabra)) return id;
  }
  // tolerancia a errores de tipeo ("nekui", "daviplta", "efetivo")
  for (const [id, alias] of todos) {
    if (alias.some(a => a.length >= 5 && esParecido(palabra, a))) return id;
  }
  return null;
}

/** Alias de cuentas propios de la instalación (config `alias_cuentas`, JSON {id: [palabras]}): "bancolombia", "transferencia"... */
export function aliasDeCuentas(ctx: Pick<Contexto, 'config'>): [string, string[]][] {
  try {
    const m = JSON.parse(ctx.config.alias_cuentas ?? 'null');
    if (m && typeof m === 'object') return Object.entries(m as Record<string, string[]>).filter(([, a]) => Array.isArray(a));
  } catch { /* JSON mal escrito: valen los de siempre */ }
  return [];
}

/**
 * Una cuenta de dinero de ESTA instalación (distinta de efectivo) para poner en los ejemplos: así la
 * ayuda nunca habla de Nequi a quien tiene Bancolombia, ni de dólares a quien no los usa.
 */
export function ejemploDeCuenta(ctx: Pick<Contexto, 'cuentas' | 'config'>): string {
  const c = ctx.cuentas.find(x => x.tipo === 'dinero' && x.moneda === 'COP' && x.id !== 'efectivo' && x.id !== 'monedas');
  if (!c) return 'monedas';
  return aliasDeCuentas(ctx).find(([id]) => id === c.id)?.[1][0] ?? c.clave;
}

/** Ejemplo de saldo inicial con SOLO las cuentas que esta instalación tiene: «efectivo 85000 bancolombia 150000 monedas 12000». */
export function ejemploDeSaldos(ctx: Pick<Contexto, 'cuentas' | 'config'>): string {
  const otra = ctx.cuentas.find(x => x.tipo === 'dinero' && x.moneda === 'COP' && x.id !== 'efectivo' && x.id !== 'monedas');
  return otra ? `efectivo 85000 ${ejemploDeCuenta(ctx)} 150000 monedas 12000` : 'efectivo 85000 monedas 12000';
}

/** La cuenta en dólares de esta instalación, si tiene (hoy solo la personal: el ARQ). */
export const cuentaEnDolares = (ctx: Pick<Contexto, 'cuentas'>) => ctx.cuentas.find(x => x.tipo === 'dinero' && x.moneda === 'USD');

/** ¿Esta instalación vende productos? (tiene catálogo o lo pide su plantilla). */
export const vendeProductos = (ctx: Pick<Contexto, 'config'>): boolean => ctx.config.ventas === '1' || !!ctx.config.catalogo;

/** Todas las cuentas de dinero nombradas en un texto normalizado, en orden de aparición. */
export function hallarCuentas(t: string, ctx?: Contexto): CuentaMencionada[] {
  // Con contexto solo cuentan las cuentas de dinero que ESTA instalación tiene (la de empresa no
  // tiene Nequi: si alguien lo escribe, es una palabra más, no una cuenta que no existe).
  const extra = ctx ? aliasDeCuentas(ctx) : [];
  const existe = (id: string) => !ctx || ctx.cuentas.some(c => c.id === id && c.tipo === 'dinero');
  // "dollar app" son dos palabras: se junta antes de buscar (conserva el largo con espacios)
  const texto = t.replace(/dollar app|dolar app/g, m => m.replace(' ', '') + ' ');
  const res: CuentaMencionada[] = [];
  for (const m of texto.matchAll(/[a-z]+/g)) {
    const id = cuentaDePalabra(m[0], extra);
    if (id && existe(id)) res.push({ id, inicio: m.index ?? 0, fin: (m.index ?? 0) + m[0].length });
  }
  return res;
}

/** Reemplaza por espacios los tramos indicados (mantiene las posiciones del resto). */
export function borrarTramos(t: string, tramos: { inicio: number; fin: number }[]): string {
  let s = t;
  for (const { inicio, fin } of tramos) s = s.slice(0, inicio) + ' '.repeat(fin - inicio) + s.slice(fin);
  return s;
}

// ---------------------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------------------

const FAMILIA = new Set([
  'mama', 'mami', 'mamita', 'papa', 'papi', 'papito', 'abuela', 'abuelo', 'abuelita', 'abuelito',
  'tia', 'tio', 'hermano', 'hermana', 'prima', 'primo', 'madrina', 'padrino', 'madre', 'padre',
]);

/** Los grupos que se ofrecen al registrar una persona nueva, con el nombre que ve la persona. */
export const GRUPOS: { id: Grupo; nombre: string }[] = [
  { id: 'casa', nombre: 'Los de la casa' },
  { id: 'familia_directa', nombre: 'Familia directa' },
  { id: 'familiares', nombre: 'Familiares' },
  { id: 'companeros', nombre: 'Compañeros de trabajo' },
  { id: 'empresa', nombre: 'Empresa' },
  { id: 'amigos', nombre: 'Amigos' },
  { id: 'trabajadores', nombre: 'Trabajadores' },
];

/** Los grupos de esta instalación: los de su plantilla (config `grupos`, en JSON) o los de siempre. */
export function gruposDe(ctx: Contexto): { id: Grupo; nombre: string }[] {
  try {
    const g = JSON.parse(ctx.config.grupos ?? 'null');
    if (Array.isArray(g) && g.length && g.every((x: unknown) => typeof (x as { id?: unknown }).id === 'string')) return g;
  } catch { /* si el JSON está mal, valen los de siempre */ }
  return GRUPOS;
}

/** Grupo por defecto de una persona nueva: familia si dices "mamá", "tía"...; si no, amigos. */
export function grupoPorDefecto(nombre: string): 'amigos' | 'familia' {
  return normalizar(nombre).split(' ').some(p => FAMILIA.has(p)) ? 'familia' : 'amigos';
}

export function idPersona(nombre: string): string {
  return `per:${slug(nombre)}`;
}
export function idFuente(nombre: string): string {
  return `fue:${slug(nombre)}`;
}

export interface ResolucionPersona {
  /** Persona que ya existe y coincide exactamente. */
  existente?: Cuenta;
  /** Nombre a usar si es nueva (con mayúsculas). */
  nombre: string;
  /** Si hay duda: personas que podrían ser (mismo primer nombre, o parecido por error de tipeo). */
  candidatas?: Cuenta[];
}

/**
 * Decide a quién te refieres. Siempre se usa el nombre completo tal como lo escribes:
 * "juan manuel" y "juan jose" son personas distintas, y un "juan" suelto con varios Juan
 * conocidos no se adivina: se pregunta.
 */
export function resolverPersona(escrito: string, ctx: Contexto): ResolucionPersona {
  const clave = normalizar(escrito);
  const personas = ctx.cuentas.filter(c => c.tipo === 'persona');
  const exacta = personas.find(p => p.clave === clave);
  if (exacta) return { existente: exacta, nombre: exacta.nombre };

  const candidatas = new Map<string, Cuenta>();
  // "juan" frente a "juan manuel" y "juan jose": mismo primer nombre, nombre incompleto
  if (!clave.includes(' ')) {
    for (const p of personas) if (p.clave.split(' ')[0] === clave) candidatas.set(p.id, p);
  }
  // errores de tipeo: "danyel" frente a "daniel"
  for (const p of personas) if (clave.length >= 5 && esParecido(clave, p.clave)) candidatas.set(p.id, p);

  const nombre = titulo(escrito);
  return candidatas.size ? { nombre, candidatas: [...candidatas.values()] } : { nombre };
}

/** Busca, entre las personas conocidas, la que aparece al principio de `tokens` (nombres de 1-3 palabras). */
export function personaAlInicio(tokens: string[], ctx: Contexto): { cuenta: Cuenta; palabras: number } | null {
  const personas = ctx.cuentas.filter(c => c.tipo === 'persona');
  const apodos = apodosDePersonas(ctx);
  for (let n = Math.min(3, tokens.length); n >= 1; n--) {
    const frase = tokens.slice(0, n).join(' ');
    const p = personas.find(x => x.clave === frase) ?? personas.find(x => apodos[x.id]?.includes(frase));
    if (p) return { cuenta: p, palabras: n };
  }
  return null;
}

/** Apodos de personas de esta instalación (config `apodos_personas`, JSON {id: [apodos]}): «unidad» = la Empresa. */
export function apodosDePersonas(ctx: Contexto): Record<string, string[]> {
  try {
    const m = JSON.parse(ctx.config.apodos_personas ?? 'null');
    if (m && typeof m === 'object') {
      return Object.fromEntries(Object.entries(m as Record<string, unknown>)
        .filter(([, a]) => Array.isArray(a)).map(([id, a]) => [id, (a as string[]).map(normalizar)]));
    }
  } catch { /* JSON mal escrito: sin apodos */ }
  return {};
}

// ---------------------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------------------

/** Categoría cuyo nombre aparece tal cual en el texto ("mecato", "viaje semanal"). */
export function categoriaPorNombre(t: string, ctx: Contexto): Cuenta | null {
  const cats = ctx.cuentas.filter(c => c.tipo === 'categoria' && c.id !== 'cat:descuadre');
  for (const c of cats) {
    if (new RegExp(`(^| )${c.clave}( |$)`).test(t)) return c;
  }
  return null;
}

/**
 * Categoría de un concepto: lo que has enseñado al bot > el nombre de la categoría > el
 * diccionario de palabras clave. Devuelve null si no se sabe (el bot te preguntará).
 */
export function categorizar(t: string, ctx: Contexto): string | null {
  // el diccionario es común a todas las apps: solo vale lo que apunta a una categoría de ESTA instalación
  const existe = (id: string) => ctx.cuentas.some(c => c.id === id);
  const palabras = t.split(' ').filter(Boolean);
  for (const w of palabras) {
    const a = ctx.aprendido[w];
    if (a?.categoriaId && existe(a.categoriaId)) return a.categoriaId;
  }
  const porNombre = categoriaPorNombre(t, ctx);
  if (porNombre) return porNombre.id;
  for (const cat of ctx.diccionario.categorias) {
    if (existe(cat.id) && cat.palabras.some(p => t.includes(normalizar(p)))) return cat.id;
  }
  return null;
}
