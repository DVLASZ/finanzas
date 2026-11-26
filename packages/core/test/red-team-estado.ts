/**
 * Ronda 2 de la batería RED: evalúa cómo queda todo después de una conversación (tarjetas pendientes, movimientos
 * guardados, reglas aprendidas, pagos fijos y alcancías). Lo usa red-team.test.ts.
 */
import { contextoDe, interpretar, leerMetas, leerRecurrentes, type Propuesta } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';
import type { Caso, Esp, Item } from './red-team-casos.ts';

type Bot = ReturnType<typeof nuevoBot>;
const sin = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const corto = (t: string, n = 110): string => t.replace(/\n/g, ' | ').slice(0, n);

/** Lo que se ve de una cosa (tarjeta o movimiento) para compararla con un Item. */
interface Vista { tipo: string; monto: number; cuentas: string[]; cat: string; personas: string[]; concepto: string; etiqueta: string | null; fecha: string; reparto: { nombre: string; monto: number }[] }

export const ahoraDe = (caso: Caso): Date => (caso.ahora ? new Date(caso.ahora) : AHORA);

async function vistaDePropuesta(bot: Bot, p: Propuesta, ahora: Date): Promise<Vista> {
  const d = await bot.repo.cargar();
  const nombre = (id?: string): string => d.cuentas.find(c => c.id === id)?.nombre ?? '';
  const personas = [p.persona ?? '', ...(p.personas ?? []).map(x => x.nombre)].filter(Boolean);
  void ahora;
  return {
    tipo: p.tipo, monto: p.monto, cuentas: [nombre(p.cuentaId), nombre(p.cuentaDestinoId)].filter(Boolean), cat: nombre(p.categoriaId),
    personas, concepto: p.concepto ?? '', etiqueta: p.etiqueta ?? null, fecha: p.ocurridoEn ?? '', reparto: p.personas ?? [],
  };
}

async function vistasPendientes(bot: Bot, ahora: Date): Promise<Vista[]> {
  const p = await bot.repo.leerPendiente();
  if (!p) return [];
  const d = await bot.repo.cargar();
  const ctx = contextoDe(d, ahora);
  const vistas = [await vistaDePropuesta(bot, p.propuesta, ahora)];
  for (const frase of p.siguientes ?? []) {
    const r = interpretar(frase, ctx);
    if (r.clase === 'movimiento') vistas.push(await vistaDePropuesta(bot, r.propuesta, ahora));
  }
  return vistas;
}

async function vistasGuardadas(bot: Bot): Promise<Vista[]> {
  const d = await bot.repo.cargar();
  const nombre = (id: string): string => d.cuentas.find(c => c.id === id)?.nombre ?? '';
  return d.movimientos.filter(m => m.estado === 'ok').map(m => {
    const ids = m.asientos.map(a => a.cuentaId);
    const tipoDe = (id: string): string | undefined => d.cuentas.find(c => c.id === id)?.tipo;
    return {
      tipo: m.tipo,
      monto: m.asientos.filter(a => a.monto > 0 && a.moneda === 'COP').reduce((s, a) => s + a.monto, 0),
      cuentas: ids.filter(id => tipoDe(id) === 'dinero').map(nombre),
      cat: nombre(ids.find(id => tipoDe(id) === 'categoria') ?? ''),
      personas: ids.filter(id => tipoDe(id) === 'persona').map(nombre),
      concepto: m.descripcion, etiqueta: m.etiqueta ?? null, fecha: m.ocurridoEn, reparto: [],
    };
  });
}

function cumpleItem(i: Item, v: Vista): string | null {
  if (i.tipo && v.tipo !== i.tipo) return `tipo ${v.tipo} y se esperaba ${i.tipo}`;
  if (i.tipoNo && v.tipo === i.tipoNo) return `no debía ser ${i.tipoNo}`;
  if (i.monto !== undefined && v.monto !== i.monto) return `monto ${v.monto} y se esperaba ${i.monto}`;
  if (i.cuenta && !v.cuentas.some(c => sin(c).includes(sin(i.cuenta!)))) return `cuenta ${v.cuentas.join('/') || 'ninguna'} y se esperaba ${i.cuenta}`;
  if (i.cat && !sin(v.cat).includes(sin(i.cat))) return `categoría «${v.cat}» y se esperaba ${i.cat}`;
  if (i.catNo && sin(v.cat).includes(sin(i.catNo))) return `la categoría no debía ser ${i.catNo}`;
  if (i.catIn && !i.catIn.some(c => sin(v.cat).includes(sin(c)))) return `categoría «${v.cat}» y se esperaba una de ${i.catIn.join(', ')}`;
  if (i.persona && !v.personas.some(p => sin(p).includes(sin(i.persona!)))) return `sin la persona ${i.persona} (${v.personas.join(', ') || 'nadie'})`;
  if (i.sinPersona && v.personas.some(p => sin(p).includes(sin(i.sinPersona!)))) return `no debía quedar ${i.sinPersona}`;
  if (i.concepto && !sin(v.concepto).includes(sin(i.concepto))) return `concepto «${v.concepto}» y se esperaba ${i.concepto}`;
  if (i.etiqueta !== undefined) {
    if (i.etiqueta === null && v.etiqueta) return `no debía tener etiqueta y tiene «${v.etiqueta}»`;
    if (i.etiqueta !== null && sin(v.etiqueta ?? '') !== sin(i.etiqueta)) return `etiqueta «${v.etiqueta}» y se esperaba ${i.etiqueta}`;
  }
  if (i.fecha && !v.fecha.startsWith(i.fecha)) return `fecha ${v.fecha.slice(0, 10)} y se esperaba ${i.fecha}`;
  for (const p of i.personas ?? []) {
    if (!v.reparto.some(r => sin(r.nombre).includes(sin(p.nombre)) && r.monto === p.monto)) return `el reparto no trae a ${p.nombre} con ${p.monto}`;
  }
  return null;
}

function cumpleLista(nombre: string, items: Item[], vistas: Vista[]): string | null {
  if (vistas.length !== items.length) {
    return `${nombre}: hay ${vistas.length} (${vistas.map(v => `${v.tipo} ${v.monto}`).join(', ') || 'ninguno'}) y se esperaban ${items.length}`;
  }
  for (let k = 0; k < items.length; k++) {
    const r = cumpleItem(items[k], vistas[k]);
    if (r) return `${nombre} ${k + 1}: ${r}`;
  }
  return null;
}

/** Escribe todos los mensajes de una conversación y devuelve lo último que respondió el bot. */
export async function conversar(bot: Bot, caso: Caso, ahora: Date): Promise<string> {
  let ultimo = '';
  for (const turno of caso.turnos ?? [caso.texto]) ultimo = textoDe(await bot.di(turno, ahora));
  return ultimo;
}

export async function evaluarEstado(bot: Bot, e: Extract<Esp, { t: 'estado' }>, ultimo: string, ahora: Date): Promise<string | null> {
  if (e.pend) {
    const r = cumpleLista('pendiente', e.pend, await vistasPendientes(bot, ahora));
    if (r) return `${r}. Última respuesta: «${corto(ultimo)}»`;
  }
  if (e.guard) {
    const r = cumpleLista('guardado', e.guard, await vistasGuardadas(bot));
    if (r) return r;
  }
  if (e.preg && !(/[¿?]/.test(ultimo) || /Me falta|Veo varios|dime|escribe|manda/i.test(ultimo))) return `no preguntó nada: «${corto(ultimo)}»`;
  return null;
}

export async function evaluarSinRegla(bot: Bot, e: Extract<Esp, { t: 'sinregla' }>, ultimo: string): Promise<string | null> {
  const d = await bot.repo.cargar();
  const clave = sin(e.palabra);
  if (Object.keys(d.aprendido).some(k => sin(k) === clave)) return `aprendió «${e.palabra}»`;
  if (sin(d.config.reglas_aprendidas ?? '').includes(`"${clave}"`)) return `guardó una regla para «${e.palabra}»`;
  if (/Me falta|¡Casi!|^Entendí/m.test(ultimo)) return `lo trató como un gasto sin monto en vez de explicar por qué no aprende: «${corto(ultimo)}»`;
  if (!/aprend|regla|espec[ií]fic|concret|ambig|categor[ií]a|cuenta|fecha|palabra/i.test(ultimo)) return `no explicó por qué no aprende: «${corto(ultimo)}»`;
  return null;
}

// ---------------------------------------------------------------- pagos fijos y alcancías
const respondeOk = async (bot: Bot, ultimo: string, ahora: Date): Promise<string> => {
  // si pide confirmar, se confirma una vez
  return /confirm|¿(?:la )?(?:dejo|programo|pauso|aplico)|¿ok|ok\?/i.test(ultimo) ? textoDe(await bot.pulsa('ok', ahora)) : ultimo;
};

export const FLUJOS_PROGRAMACION: Record<string, (caso: Caso) => Promise<string | null>> = {
  'fijo-pausa-proximo-mes': async caso => {
    const ahora = ahoraDe(caso);
    const bot = nuevoBot(ahora);
    for (const f of caso.antes ?? []) { await bot.di(f, ahora); await bot.pulsa('ok', ahora); }
    let t = await conversar(bot, caso, ahora);
    t = await respondeOk(bot, t, ahora);
    const r = leerRecurrentes((await bot.repo.cargar()).config).find(x => /claude/i.test(x.concepto));
    if (!r) return 'el pago fijo Claude desapareció';
    if (r.pausado) return 'pausó Claude desde ya: debía ser desde el próximo mes';
    if (!r.pausaDesde || !r.pausaDesde.startsWith('2026-11-01')) return `pausaDesde ${r.pausaDesde ?? 'vacío'} y se esperaba 2026-11-01. Última respuesta: «${corto(t)}»`;
    return null;
  },
  'fijo-pausa-hasta-febrero': async caso => {
    const ahora = ahoraDe(caso);
    const bot = nuevoBot(ahora);
    for (const f of caso.antes ?? []) { await bot.di(f, ahora); await bot.pulsa('ok', ahora); }
    let t = await conversar(bot, caso, ahora);
    if (/[¿?]/.test(t) && !leerRecurrentes((await bot.repo.cargar()).config).some(x => x.pausaHasta)) t = await respondeOk(bot, t, ahora);
    const r = leerRecurrentes((await bot.repo.cargar()).config).find(x => /arriendo/i.test(x.concepto));
    if (!r) return 'el arriendo desapareció';
    if (r.pausado) return 'lo dejó pausado para siempre';
    if (!r.pausaHasta || !r.pausaHasta.startsWith('2027-02')) return `pausaHasta ${r.pausaHasta ?? 'vacío'} y se esperaba febrero de 2027. Última respuesta: «${corto(t)}»`;
    return null;
  },
  'fijo-pregunta-sin-crear': async caso => {
    const ahora = ahoraDe(caso);
    const bot = nuevoBot(ahora);
    const t = await conversar(bot, caso, ahora);
    if (leerRecurrentes((await bot.repo.cargar()).config).length) return `creó un pago fijo con un calendario inventado: «${corto(t)}»`;
    return /[¿?]/.test(t) ? null : `no preguntó nada: «${corto(t)}»`;
  },
  'fijo-quincena-15-30': async caso => {
    const ahora = ahoraDe(caso);
    const bot = nuevoBot(ahora);
    const t = await conversar(bot, caso, ahora);
    const l = leerRecurrentes((await bot.repo.cargar()).config);
    if (l.length === 0) return /[¿?]/.test(t) ? null : `no creó nada ni preguntó: «${corto(t)}»`;
    return l.length === 1 && l[0].dia === 15 && l[0].frecuencia === 'quincenal' ? null : `creó ${JSON.stringify(l.map(x => ({ dia: x.dia, f: x.frecuencia })))} y se esperaban los días 15 y 30`;
  },
  'alcancia-mete-lote': async caso => {
    const ahora = ahoraDe(caso);
    const bot = nuevoBot(ahora);
    for (const f of caso.antes ?? []) { await bot.di(f, ahora); await bot.pulsa('ok', ahora); }
    const t = await conversar(bot, caso, ahora);
    const d = await bot.repo.cargar();
    if (d.movimientos.some(m => m.estado === 'ok' && (m.tipo === 'gasto' || m.tipo === 'ingreso'))) return 'lo registró como un gasto o un ingreso';
    const meta = leerMetas(d.config).find(m => /lote/i.test(m.nombre));
    return meta && meta.apartado === 20000 ? null : /[¿?]/.test(t) ? null : `no apartó los 20.000 ni preguntó: apartado ${meta?.apartado} («${corto(t)}»)`;
  },
  'alcancia-saca-viaje': async caso => {
    const ahora = ahoraDe(caso);
    const bot = nuevoBot(ahora);
    for (const f of caso.antes ?? []) { await bot.di(f, ahora); await bot.pulsa('ok', ahora); }
    const t = await conversar(bot, caso, ahora);
    const d = await bot.repo.cargar();
    if (d.movimientos.some(m => m.estado === 'ok' && (m.tipo === 'gasto' || m.tipo === 'ingreso'))) return 'lo registró como un gasto o un ingreso';
    const meta = leerMetas(d.config).find(m => /viaje/i.test(m.nombre));
    return meta && meta.apartado === 85000 ? null : /[¿?]/.test(t) ? null : `no sacó los 15.000 de la meta ni preguntó: apartado ${meta?.apartado} («${corto(t)}»)`;
  },
  'alcancia-contradiccion': async caso => {
    const ahora = ahoraDe(caso);
    const bot = nuevoBot(ahora);
    for (const f of caso.antes ?? []) { await bot.di(f, ahora); await bot.pulsa('ok', ahora); }
    const t = await conversar(bot, caso, ahora);
    const d = await bot.repo.cargar();
    const meta = leerMetas(d.config).find(m => /carro/i.test(m.nombre));
    if (meta && meta.apartado > 0) return `apartó ${meta.apartado} a pesar de la contradicción`;
    return /[¿?]/.test(t) ? null : `no preguntó nada: «${corto(t)}»`;
  },
};
