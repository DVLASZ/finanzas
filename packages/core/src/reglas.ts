/**
 * Reglas aprendidas: «cuando escriba Laura, usa Nequi». Nacen cuando la persona corrige la cuenta o la categoría de un
 * movimiento que acaba de anotar y acepta guardarlo como regla. Viven en la config (`reglas_aprendidas`, un JSON), así
 * viajan por la sincronización y entran en el respaldo como cualquier otro ajuste, sin migración.
 *
 * Todo es puro. El parser las consulta con `buscarRegla` solo cuando la frase no dijo cuenta o categoría, y la edición
 * pregunta con `reglaSugerida` si vale la pena ofrecer una.
 */
import { aLocal, deLocal } from './fechas.ts';
import type { Datos } from './repo.ts';
import type { Propuesta } from './parser/tipos.ts';
import { limpiar } from './texto.ts';
import type { Cuenta, Movimiento } from './tipos.ts';

export interface ReglaAprendida {
  id: string;
  /** Persona o comercio, en minúscula y sin tildes. */
  clave: string;
  cuentaId?: string;
  categoriaId?: string;
  /** 'AAAA-MM-DD HH:MM:SS' */
  creada: string;
  /** En pausa: se conserva pero no se aplica ni se vuelve a ofrecer. */
  pausada?: true;
}

export const MAX_REGLAS = 60;
const MAX_CLAVE = 40;
/** Un movimiento se considera recién creado si pasaron menos de estos minutos desde que se guardó. */
const MINUTOS_RECIENTE = 10;

/** La clave de una regla: el texto sin tildes ni mayúsculas ni signos. */
export const claveDeRegla = (texto: string): string => limpiar(texto).replace(/[$.,\-/#+><=]/g, ' ').replace(/\s+/g, ' ').trim();

const esRegla = (r: unknown): r is ReglaAprendida => {
  const x = r as Partial<ReglaAprendida> | null;
  return Boolean(x) && typeof x!.id === 'string' && typeof x!.clave === 'string' && x!.clave.length > 0 && typeof x!.creada === 'string';
};

/** Las reglas guardadas en la config. Un JSON roto o con basura da una lista vacía o parcial, nunca un error. */
export function leerReglas(config: Record<string, string>): ReglaAprendida[] {
  try {
    const crudo = JSON.parse(config.reglas_aprendidas ?? '[]');
    if (!Array.isArray(crudo)) return [];
    return crudo.filter(esRegla).slice(0, MAX_REGLAS).map(r => ({
      id: r.id, clave: r.clave, creada: r.creada,
      ...(typeof r.cuentaId === 'string' && r.cuentaId ? { cuentaId: r.cuentaId } : {}),
      ...(typeof r.categoriaId === 'string' && r.categoriaId ? { categoriaId: r.categoriaId } : {}),
      ...(r.pausada === true ? { pausada: true as const } : {}),
    }));
  } catch { return []; }
}

export const serializarReglas = (lista: ReglaAprendida[]): string => JSON.stringify(lista.slice(0, MAX_REGLAS));

/** Agrega una regla. Si ya hay una con esa clave, se completa con lo nuevo en vez de duplicarla. */
export function agregarRegla(lista: ReglaAprendida[], nueva: { clave: string; cuentaId?: string; categoriaId?: string }, ahora: Date): ReglaAprendida[] {
  const clave = claveDeRegla(nueva.clave).slice(0, MAX_CLAVE).trim();
  if (!clave) return lista;
  const previa = lista.find(r => r.clave === clave);
  if (previa) return lista.map(r => (r === previa ? { ...r, ...(nueva.cuentaId ? { cuentaId: nueva.cuentaId } : {}), ...(nueva.categoriaId ? { categoriaId: nueva.categoriaId } : {}) } : r));
  const regla: ReglaAprendida = {
    id: `r-${clave.replace(/ /g, '-')}`, clave, creada: aLocal(ahora),
    ...(nueva.cuentaId ? { cuentaId: nueva.cuentaId } : {}),
    ...(nueva.categoriaId ? { categoriaId: nueva.categoriaId } : {}),
  };
  return [...lista, regla].slice(-MAX_REGLAS);
}

export const borrarRegla = (lista: ReglaAprendida[], id: string): ReglaAprendida[] => lista.filter(r => r.id !== id);

/** Cambia la cuenta o la categoría de una regla. `null` quita ese dato. */
export function editarRegla(lista: ReglaAprendida[], id: string, cambios: { cuentaId?: string | null; categoriaId?: string | null; pausada?: boolean; clave?: string }): ReglaAprendida[] {
  return lista.map(r => {
    if (r.id !== id) return r;
    const n = { ...r };
    if (cambios.cuentaId !== undefined) { if (cambios.cuentaId) n.cuentaId = cambios.cuentaId; else delete n.cuentaId; }
    if (cambios.categoriaId !== undefined) { if (cambios.categoriaId) n.categoriaId = cambios.categoriaId; else delete n.categoriaId; }
    if (cambios.pausada !== undefined) { if (cambios.pausada) n.pausada = true; else delete n.pausada; }
    if (cambios.clave !== undefined) {
      const c = claveDeRegla(cambios.clave).slice(0, MAX_CLAVE).trim();
      // una clave vacía o ya usada por otra regla se ignora, para no dejar dos reglas iguales
      if (c && !lista.some(x => x.id !== id && x.clave === c)) n.clave = c;
    }
    return n;
  });
}

/** La regla que cabe en un texto: la clave tiene que aparecer como palabras completas. Si caben varias, gana la más larga. */
export function buscarRegla(lista: ReglaAprendida[], texto: string): ReglaAprendida | null {
  const t = ` ${claveDeRegla(texto)} `;
  if (t.trim() === '') return null;
  let mejor: ReglaAprendida | null = null;
  for (const r of lista) {
    if (r.pausada) continue;
    if (t.includes(` ${r.clave} `) && (!mejor || r.clave.length > mejor.clave.length)) mejor = r;
  }
  return mejor;
}

export interface SugerenciaRegla {
  clave: string;
  cuentaId?: string;
  categoriaId?: string;
  /** «La próxima vez que escriba Laura, ¿usar Nequi?» */
  pregunta: string;
}

const nombreDe = (datos: Datos, id: string | undefined): string => datos.cuentas.find(c => c.id === id)?.nombre ?? id ?? '';

/**
 * ¿Vale la pena ofrecer una regla después de editar? Solo si el movimiento es un gasto o un ingreso, la edición cambió la
 * cuenta o la categoría, el movimiento es de hoy o se guardó hace menos de diez minutos, hay con qué armar la clave y
 * esa regla no existe ya igual. `m` es el movimiento ya editado.
 */
export function reglaSugerida(datos: Datos, m: Movimiento, cambios: { cuentaId?: string; categoriaId?: string }, ahora: Date): SugerenciaRegla | null {
  if (m.tipo !== 'gasto' && m.tipo !== 'ingreso') return null;
  const p = m.propuesta as Propuesta | undefined;
  if (!p || typeof p !== 'object') return null;
  const cuentaId = cambios.cuentaId;
  const categoriaId = m.tipo === 'gasto' ? cambios.categoriaId : undefined;
  if (!cuentaId && !categoriaId) return null;

  const recienGuardado = ahora.getTime() - deLocal(m.creadoEn).getTime() < MINUTOS_RECIENTE * 60_000;
  const esDeHoy = m.ocurridoEn.slice(0, 10) === aLocal(ahora).slice(0, 10);
  if (!recienGuardado && !esDeHoy) return null;

  const clave = claveDeRegla(p.persona || (m.tipo === 'ingreso' ? p.fuente : '') || m.descripcion).slice(0, MAX_CLAVE).trim();
  if (!clave || /^\d+$/.test(clave)) return null;

  const igual = leerReglas(datos.config).find(r => r.clave === clave);
  if (igual?.pausada) return null;
  if (igual && (!cuentaId || igual.cuentaId === cuentaId) && (!categoriaId || igual.categoriaId === categoriaId)) return null;

  const destino = [cuentaId ? nombreDe(datos, cuentaId) : '', categoriaId ? nombreDe(datos, categoriaId) : ''].filter(Boolean).join(' y ');
  const nombre = p.persona || (m.tipo === 'ingreso' && p.fuente) || m.descripcion;
  return {
    clave, ...(cuentaId ? { cuentaId } : {}), ...(categoriaId ? { categoriaId } : {}),
    pregunta: `La próxima vez que escriba ${nombre}, ¿usar ${destino}?`,
  };
}

export interface ReglaAplicable {
  clave: string;
  /** Solo si la cuenta existe, es de dinero y es de pesos. */
  cuentaId?: string;
  /** Solo si la categoría existe. */
  categoriaId?: string;
}

/** La regla que le toca a una frase, ya validada contra las cuentas de esta instalación (una cuenta borrada se ignora). */
export function reglaParaFrase(config: Record<string, string>, cuentas: Cuenta[], texto: string): ReglaAplicable | null {
  const r = buscarRegla(leerReglas(config), texto);
  if (!r) return null;
  const cuenta = cuentas.find(c => c.id === r.cuentaId);
  const categoria = cuentas.find(c => c.id === r.categoriaId);
  const cuentaId = cuenta && cuenta.tipo === 'dinero' && cuenta.moneda === 'COP' ? cuenta.id : undefined;
  const categoriaId = categoria && categoria.tipo === 'categoria' ? categoria.id : undefined;
  return cuentaId || categoriaId ? { clave: r.clave, cuentaId, categoriaId } : null;
}

/** «Laura va a Nequi y a Mecato» para la tarjeta del chat y la lista de Ajustes. */
export function describirRegla(clave: string, cuentas: Cuenta[], cuentaId?: string, categoriaId?: string): string {
  const nombre = (id: string) => cuentas.find(c => c.id === id)?.nombre ?? id;
  const partes = [cuentaId ? nombre(cuentaId) : '', categoriaId ? nombre(categoriaId) : ''].filter(Boolean);
  return `${clave.charAt(0).toUpperCase()}${clave.slice(1)} va a ${partes.join(' y a ')}`;
}
