/**
 * Textos que ve el usuario: tarjeta de confirmación, saldos, resúmenes, deudas y ayuda.
 * Los muestra el chat de la app.
 */
import { diferenciasArqueo, type Saldos, saldoDe } from './asientos.ts';
import {
  deudasPorPersona, estadoPresupuesto, gastoPorCategoria, ingresosPorFuente, porEtiqueta, resumenSaldos, totalIngresos,
} from './consultas.ts';
import { formatear } from './dinero.ts';
import { leerMetas, totalApartado } from './metas.ts';
import { agruparCategorias, conSubcategorias } from './subcategorias.ts';
import { cuentaEnDolares, ejemploDeCuenta, ejemploDeSaldos, vendeProductos } from './entidades.ts';
import { resolverEfectivo, type Reparto } from './efectivo.ts';
import { describirDia, describirFecha, nombreMes, rangoPeriodo } from './fechas.ts';
import type { Propuesta } from './parser.ts';
import type { Compromiso, Contexto, Moneda, Movimiento } from './tipos.ts';

const nombreDe = (ctx: Contexto, id: string | undefined): string =>
  (id && ctx.cuentas.find(c => c.id === id)?.nombre) || id || '?';

/** Línea corta que describe un movimiento ya armado (sirve para tarjeta y para listas). */
function titular(p: Propuesta, ctx: Contexto): string {
  const f = describirFecha(p.ocurridoEn, ctx.ahora);
  const m = formatear(p.monto, p.moneda);
  const cuenta = nombreDe(ctx, p.cuentaId);
  switch (p.tipo) {
    case 'gasto': {
      const cat = p.categoriaId ? nombreDe(ctx, p.categoriaId) : '❓';
      if (p.categoriaId === 'cat:transporte') {
        const ruta = p.desde || p.hasta ? ` ${p.desde ?? '❓'} → ${p.hasta ?? '❓'}` : '';
        return `Gasto · Transporte · ${p.concepto}${ruta} · ${m} · ${cuenta} · ${f}`;
      }
      return `Gasto · ${cat} · ${m} · ${cuenta} · ${f}`;
    }
    case 'compartido':
      return p.pagoOtro
        ? `Gasto pagado por ${p.persona} · ${p.categoriaId ? nombreDe(ctx, p.categoriaId) : '❓'} · ${m} · ${f}`
        : `Gasto compartido · ${p.categoriaId ? nombreDe(ctx, p.categoriaId) : '❓'} · ${m} · ${cuenta} · ${f}`;
    case 'ingreso':
      if (p.venta) return `Venta · ${p.fuente} · ${m} · ${p.fiado ? `Fiado a ${p.persona}` : p.persona ? `${p.persona} pagó en ${cuenta}` : cuenta} · ${f}`;
      return `Ingreso · ${p.fuente} · ${m} · ${cuenta} · ${f}`;
    case 'transferencia': return `Transferencia · ${m} · ${cuenta} → ${nombreDe(ctx, p.cuentaDestinoId)} · ${f}`;
    case 'cambio_moneda': {
      const sale = formatear(p.monto, p.moneda);
      const entra = formatear(p.montoOtro ?? 0, p.monedaOtra ?? 'COP');
      const pesos = p.moneda === 'COP' ? p.monto : p.montoOtro ?? 0;
      const usd = p.moneda === 'USD' ? p.monto : p.montoOtro ?? 0;
      const tasa = usd ? ` · ${formatear(Math.round(pesos / (usd / 100)))} por dólar` : '';
      return `Cambio de moneda · ${sale} (${cuenta}) → ${entra} (${nombreDe(ctx, p.cuentaDestinoId)})${tasa} · ${f}`;
    }
    case 'prestamo': return `Préstamo · le prestas a ${p.persona} · ${m} · ${cuenta} · ${f}`;
    case 'deuda': {
      if (p.custodia && p.recibeDinero) return `Plata de ${p.persona}${p.motivo ? ` para ${p.motivo}` : ''} · ${m} · ${cuenta} · ${f}`;
      const lim = p.fechaLimite ? ` · antes del ${describirDia(p.fechaLimite)}` : '';
      return p.recibeDinero
        ? `Deuda · ${p.persona} te presta · ${m} · ${cuenta}${lim} · ${f}`
        : `Deuda · le debes a ${p.persona} · ${m} · ${p.categoriaId ? nombreDe(ctx, p.categoriaId) : '❓'}${lim} · ${f}`;
    }
    case 'pago':
      if (p.custodia && p.direccion === 'yo_pago') return `Gasto con plata de ${p.persona}${p.motivo ? ` · ${p.motivo}` : ''} · ${m} · ${cuenta} · ${f}`;
      return p.direccion === 'yo_pago'
        ? `Pago · le pagas a ${p.persona} · ${m}${p.montoOtro !== undefined ? ` (${formatear(p.montoOtro, p.monedaOtra ?? 'COP')} desde ${cuenta})` : ` · ${cuenta}`} · ${f}`
        : `Pago · ${p.persona} te paga · ${m}${p.montoOtro !== undefined ? ` (${formatear(p.montoOtro, p.monedaOtra ?? 'COP')} en ${cuenta})` : ` · ${cuenta}`} · ${f}`;
    case 'apertura': return `Saldo inicial · ${f}`;
    case 'ajuste':
      return p.cuadra
        ? `Cuadrar con ${p.cuadra.nombre} · ${formatear(Math.abs(p.cuadra.saldo))} que ${p.cuadra.saldo > 0 ? 'te debe' : 'le debes'} · ${f}`
        : `Contar la plata · ${f}`;
    default: return `${p.tipo} · ${m} · ${f}`;
  }
}

/** ¿Este movimiento saca plata de la billetera? Entonces la tarjeta explica cómo se pagó. */
export function sacaEfectivo(p: Propuesta): boolean {
  const cuenta = p.cuentaId ?? 'efectivo';
  if (cuenta !== 'efectivo' || p.moneda !== 'COP') return false;
  return p.tipo === 'gasto' || p.tipo === 'prestamo' || (p.tipo === 'compartido' && !p.pagoOtro) || (p.tipo === 'pago' && p.direccion === 'yo_pago' && p.montoOtro === undefined);
}

/** Cómo se pagó en efectivo, en una línea: lo dicho o lo que se asumió (la tarjeta nunca es muda). */
export function pagoDe(p: Propuesta, ctx: Contexto, saldos: Saldos) {
  return resolverEfectivo(p, saldoDe(saldos, 'monedas', 'COP'), ctx.config.pago_defecto === 'mayor' ? 'mayor' : 'justo');
}

const partes = (r: Reparto): string => {
  const x: string[] = [];
  if (r.billetes > 0) x.push(`${formatear(r.billetes)} en billete`);
  if (r.monedas > 0) x.push(`${formatear(r.monedas)} en monedas`);
  return x.length ? x.join(' + ') : '$0';
};

function lineasDePago(p: Propuesta, ctx: Contexto, saldos: Saldos): string[] {
  if (!sacaEfectivo(p)) return [];
  const r = pagoDe(p, ctx, saldos);
  const l: string[] = [];
  const entregado = r.pago.billetes + r.pago.monedas;
  if (r.modo === 'justo') {
    l.push(`Pagaste justo: ${partes(r.pago)}`);
    // la causa de la mayoría de los descuadres: pagar con billete y no decir el vuelto
    const dicho = p.pagoCon !== undefined || p.pagoMonedas !== undefined || p.restoEnMonedas || p.vuelto || p.formaPago === 'justo';
    if (!dicho) l.push('¿Te dieron vuelto? Toca abajo con cuánto pagaste.');
  }
  else if (r.modo === 'deducido') l.push(`Entregaste ${formatear(entregado)} (${partes(r.pago)}) y te devolvieron ${partes(r.vuelto)}`);
  else {
    const con = r.pago.monedas > 0 ? partes(r.pago) : formatear(entregado);
    const v = r.vuelto;
    l.push(`Pagas con ${con} → vuelto${r.estimado ? ' estimado' : ''}: ${v.billetes > 0 && v.monedas > 0 ? partes(v) : partes(v)}`);
  }
  if (r.nota) l.push(r.nota);
  if (r.aviso) l.push(`⚠️ ${r.aviso}`);
  // si las monedas no alcanzan, el aviso de «falta plata» lo pone el bot (core/src/guardas.ts)
  return l;
}

/** Tarjeta de confirmación: lo que el bot entendió, con avisos y lo que falta. */
export function tarjeta(p: Propuesta, ctx: Contexto, saldos: Saldos): string {
  const l: string[] = ['Entendí:', titular(p, ctx)];

  if (p.tipo === 'gasto' && p.categoriaId !== 'cat:transporte' && p.concepto && p.concepto.toLowerCase() !== nombreDe(ctx, p.categoriaId).toLowerCase()) {
    l.push(`Concepto: ${p.concepto}`);
  }
  if (p.venta) l.push(`${p.venta.cantidad} × ${p.venta.presentacion} a ${formatear(p.venta.precio)}`);
  if (p.etiqueta) l.push(`Evento: #${p.etiqueta}`);
  if (p.tipo === 'compartido' && !p.pagoOtro && p.personas) {
    const deben = p.personas.reduce((s, x) => s + x.monto, 0);
    l.push(`Tu parte: ${formatear(p.monto - deben, p.moneda)}`);
    for (const x of p.personas) l.push(`${x.nombre} te debe ${formatear(x.monto, p.moneda)}`);
  }
  if (p.tipo === 'compartido' && p.pagoOtro) l.push(`Le debes ${formatear(p.monto, p.moneda)} a ${p.persona}`);
  l.push(...lineasDePago(p, ctx, saldos));
  if (p.tipo === 'apertura' || p.tipo === 'ajuste') {
    if (p.tipo === 'ajuste') {
      for (const d of diferenciasArqueo(p, saldos)) {
        const dif = d.diferencia === 0 ? 'cuadra' : `diferencia ${formatear(d.diferencia, d.moneda)}`;
        l.push(`${nombreDe(ctx, d.cuentaId)}: tenías ${formatear(d.antes, d.moneda)}, tienes ${formatear(d.declarado, d.moneda)} (${dif})`);
      }
    } else {
      for (const d of p.declarados ?? []) l.push(`${nombreDe(ctx, d.cuentaId)}: ${formatear(d.monto, d.moneda)}`);
      for (const d of p.deudasIniciales ?? []) {
        const lim = d.fechaLimite ? ` (antes del ${describirDia(d.fechaLimite)})` : '';
        l.push(`${d.direccion === 'debo' ? 'Le debes a' : 'Te debe'} ${d.nombre}: ${formatear(d.monto, d.moneda)}${d.motivo ? ` · ${d.motivo}` : ''}${lim}`);
      }
      l.push('Esto NO cuenta como ingreso: solo fija desde dónde se calculan tus saldos.');
    }
  }
  if (p.cuadra) l.push(`Queda en cero con ${p.cuadra.nombre}. La diferencia va a Descuadre, no cuenta como gasto de verdad.`);
  if (p.motivo && p.tipo === 'deuda') l.push(`Motivo: ${p.motivo}`);
  if (p.nota) l.push(p.nota);
  void saldoDe;
  for (const a of p.avisos) l.push(`⚠️ ${a}`);
  for (const f of p.faltantes) l.push(`❓ ${f.pregunta}`);
  return l.join('\n');
}

/** Alerta de tope mensual de la categoría del movimiento recién guardado. */
export function alertaPresupuesto(movs: Movimiento[], ctx: Contexto, categoriaId: string | undefined): string | null {
  if (!categoriaId) return null;
  const { desde, hasta } = rangoPeriodo('mes', ctx.ahora);
  const e = estadoPresupuesto(movs, ctx.cuentas, ctx.presupuestos, categoriaId, desde, hasta, ctx.config.tope_arrastra === '1');
  if (!e) return null;
  const icono = e.porcentaje >= 100 ? '🚨' : e.porcentaje >= 80 ? '⚠️' : '📊';
  const extra = e.porcentaje >= 100 ? ' · ¡superaste el tope!' : '';
  return `${icono} ${nombreDe(ctx, categoriaId)}: llevas ${formatear(e.gastado)} de ${formatear(e.tope)} este mes (${e.porcentaje}%)${extra}`;
}

export function textoSaldo(movs: Movimiento[], ctx: Contexto): string {
  const apertura = ctx.config.fecha_apertura ?? '2000-01-01 00:00:00';
  const r = resumenSaldos(movs, ctx.cuentas, apertura);
  const sinApertura = apertura.startsWith('2000');
  const l: string[] = ['💰 Saldos'];
  for (const { cuenta, saldo } of r.cuentas) {
    if (cuenta.id === 'monedas') continue;
    l.push(`${cuenta.id === 'efectivo' ? 'Efectivo (billetera)' : cuenta.nombre}: ${formatear(saldo, cuenta.moneda)}${saldo < 0 ? ' ⚠️ no puede ser negativo, falta anotar algo' : ''}`);
  }
  const usd = cuentaEnDolares(ctx);
  l.push(`Disponible: ${formatear(r.disponibleCop)}${usd ? ` (${usd.nombre} va aparte, en dólares)` : ''}`);
  l.push(`Monedas (aparte): ${formatear(r.monedasCop)}${r.monedasCop < 0 ? ' ⚠️ no puede ser negativo, falta anotar un vuelto o una transferencia' : ''}`);
  if (r.teDeben.COP || r.teDeben.USD) l.push(`Te deben: ${[r.teDeben.COP && formatear(r.teDeben.COP), r.teDeben.USD && formatear(r.teDeben.USD, 'USD')].filter(Boolean).join(' + ')}`);
  if (r.debes.COP || r.debes.USD) l.push(`Debes: ${[r.debes.COP && formatear(r.debes.COP), r.debes.USD && formatear(r.debes.USD, 'USD')].filter(Boolean).join(' + ')}`);
  if (r.deOtros > 0) l.push(`Plata de otros: ${formatear(r.deOtros)} (está dentro de lo de arriba, pero no es tuya)`);
  const apartado = totalApartado(leerMetas(ctx.config));
  if (apartado > 0) l.push(`Apartado para metas: ${formatear(apartado)} (ya está dentro de lo de arriba)`);
  if (sinApertura) l.push(`\nTodavía no me dijiste cuánta plata tenías al empezar. Escribe, por ejemplo: «saldo inicial ${ejemploDeSaldos(ctx)}».`);
  return l.join('\n');
}

/** El saldo de una sola cuenta («¿cuánto hay en Nequi?»). Si no la reconoce, dice cuáles hay. */
export function textoSaldoDe(arg: string, movs: Movimiento[], ctx: Contexto): string {
  const apertura = ctx.config.fecha_apertura ?? '2000-01-01 00:00:00';
  const r = resumenSaldos(movs, ctx.cuentas, apertura);
  const q = arg.trim();
  const hallada = r.cuentas.find(x => x.cuenta.clave === q || x.cuenta.clave.startsWith(q) || x.cuenta.nombre.toLowerCase().includes(q));
  if (!hallada) return `No encuentro una cuenta que se llame «${q}». Tus cuentas son: ${r.cuentas.map(x => x.cuenta.nombre).join(', ')}.`;
  return `💰 ${hallada.cuenta.nombre}: ${formatear(hallada.saldo, hallada.cuenta.moneda)}`;
}

/** El periodo de antes: el mes anterior, la semana anterior o el año anterior. */
function periodoAnterior(periodo: 'semana' | 'mes' | 'anio', ahora: Date): { desde: string; hasta: string } {
  if (periodo === 'semana') return rangoPeriodo('semana', new Date(ahora.getTime() - 7 * 86400000));
  const actual = rangoPeriodo(periodo, ahora).desde; // «AAAA-MM-DD 00:00:00» local
  const y = Number(actual.slice(0, 4)), m = Number(actual.slice(5, 7));
  // a mitad del periodo anterior, sin riesgo de caer en el vecino por la zona horaria
  return rangoPeriodo(periodo, periodo === 'mes' ? new Date(Date.UTC(y, m - 2, 15, 17)) : new Date(Date.UTC(y - 1, 5, 15, 17)));
}

export function textoResumen(periodo: 'semana' | 'mes' | 'anio', movs: Movimiento[], ctx: Contexto): string {
  const { desde, hasta } = rangoPeriodo(periodo, ctx.ahora);
  const cats = gastoPorCategoria(movs, ctx.cuentas, desde, hasta);
  const total = cats.reduce((s, c) => s + c.total, 0);
  const ingresos = totalIngresos(movs, ctx.cuentas, desde, hasta);
  const titulo = periodo === 'mes' ? `${nombreMes(desde)} ${desde.slice(0, 4)}`
    : periodo === 'anio' ? `Año ${desde.slice(0, 4)}`
    : `Semana del ${describirDia(desde.slice(0, 10))}`;
  const l: string[] = [`📊 ${titulo}`, `Gastos: ${formatear(total)}`];
  // frente al periodo anterior: el mes pasado, la semana pasada, el año pasado
  const ant = periodoAnterior(periodo, ctx.ahora);
  const totalAnt = gastoPorCategoria(movs, ctx.cuentas, ant.desde, ant.hasta).reduce((s, c) => s + c.total, 0);
  if (totalAnt > 0 && total > 0) {
    const pct = Math.round(((total - totalAnt) / totalAnt) * 100);
    const nombreAnt = periodo === 'mes' ? nombreMes(ant.desde) : periodo === 'anio' ? ant.desde.slice(0, 4) : 'la semana pasada';
    l.push(`Frente a ${nombreAnt}: gastaste ${pct === 0 ? 'lo mismo' : `${Math.abs(pct)} % ${pct > 0 ? 'más' : 'menos'}`} (antes ${formatear(totalAnt)})`);
  }
  const grupos = agruparCategorias(cats, ctx.config, ctx.cuentas);
  for (const c of grupos.slice(0, 8)) {
    l.push(`• ${c.cuenta.nombre}: ${formatear(c.total)}${total ? ` (${Math.round((c.total / total) * 100)}%)` : ''}`);
    if (c.hijos.length) {
      for (const h of c.hijos) l.push(`   ${'   '.repeat(h.nivel - 1)}· ${h.cuenta.nombre}: ${formatear(h.total)}`);
      if (c.propio > 0) l.push(`   · ${c.cuenta.nombre} (directo): ${formatear(c.propio)}`);
    }
  }
  if (grupos.length > 8) l.push(`• …y ${grupos.length - 8} categorías más`);
  if (ingresos > 0) {
    const balance = ingresos - total;
    const meta = Number(ctx.config.meta_ahorro_pct ?? '30');
    l.push(`Ingresos: ${formatear(ingresos)}`, `Balance: ${formatear(balance)}`);
    if (periodo !== 'semana') {
      const ahorroMeta = Math.round((ingresos * meta) / 100);
      l.push(`Meta de ahorro (${meta}%): ${formatear(ahorroMeta)} → ahorro real: ${formatear(balance)}`);
    }
  }
  if (periodo === 'mes') {
    for (const [catId] of Object.entries(ctx.presupuestos)) {
      const e = estadoPresupuesto(movs, ctx.cuentas, ctx.presupuestos, catId, desde, hasta, ctx.config.tope_arrastra === '1');
      if (e) l.push(`Tope ${nombreDe(ctx, catId)}: ${formatear(e.gastado)} de ${formatear(e.tope)} (${e.porcentaje}%)`);
    }
  }
  return l.join('\n');
}

/** Lo vendido (o recibido) por producto o fuente en el periodo. */
export function textoVentas(periodo: 'semana' | 'mes' | 'anio', movs: Movimiento[], ctx: Contexto): string {
  const { desde, hasta } = rangoPeriodo(periodo, ctx.ahora);
  const titulo = periodo === 'mes' ? `${nombreMes(desde)} ${desde.slice(0, 4)}` : periodo === 'anio' ? desde.slice(0, 4) : `la semana del ${describirDia(desde.slice(0, 10))}`;
  const filas = ingresosPorFuente(movs, ctx.cuentas, desde, hasta);
  if (!filas.length) return `🧾 Todavía no hay ventas en ${titulo}.`;
  const total = filas.reduce((s, f) => s + f.total, 0);
  const l = [`🧾 Ventas de ${titulo}`, `Total: ${formatear(total)}`];
  for (const f of filas.slice(0, 10)) l.push(`• ${f.cuenta.nombre}: ${formatear(f.total)} (${Math.round((f.total / total) * 100)}%)`);
  if (filas.length > 10) l.push(`• y ${filas.length - 10} más`);
  if (periodo === 'anio') {
    // lo vendido mes por mes
    const anio = Number(desde.slice(0, 4));
    const meses: string[] = [];
    for (let mes = 1; mes <= 12; mes++) {
      const d = `${anio}-${String(mes).padStart(2, '0')}-01 00:00:00`;
      const h = mes === 12 ? `${anio + 1}-01-01 00:00:00` : `${anio}-${String(mes + 1).padStart(2, '0')}-01 00:00:00`;
      const t = ingresosPorFuente(movs, ctx.cuentas, d, h).reduce((s, x) => s + x.total, 0);
      if (t > 0) meses.push(`${nombreMes(d)} ${formatear(t)}`);
    }
    if (meses.length > 1) l.push(`Por mes: ${meses.join(' · ')}`);
  }
  return l.join('\n');
}

export function textoCategoria(arg: string, movs: Movimiento[], ctx: Contexto): string {
  const cat = ctx.cuentas.find(c => c.tipo === 'categoria' && (c.clave === arg || c.clave.startsWith(arg)));
  if (!cat) return `No conozco la categoría «${arg}».`;
  const mes = rangoPeriodo('mes', ctx.ahora);
  const sem = rangoPeriodo('semana', ctx.ahora);
  const ids = conSubcategorias(ctx.config, cat.id); // lo de adentro también cuenta
  const g = (r: { desde: string; hasta: string }) => gastoPorCategoria(movs, ctx.cuentas, r.desde, r.hasta).filter(x => ids.includes(x.cuenta.id)).reduce((s, x) => s + x.total, 0);
  return `${cat.nombre}: ${formatear(g(sem))} esta semana · ${formatear(g(mes))} este mes`;
}

export function textoEvento(etiqueta: string, movs: Movimiento[], ctx: Contexto): string {
  const r = porEtiqueta(movs, ctx.cuentas, etiqueta);
  if (!r.movimientos.length) return `No hay movimientos con #${etiqueta}.`;
  const l = [`🏷️ #${etiqueta} · ${r.movimientos.length} movimientos · total ${formatear(r.total)}`];
  for (const m of r.movimientos) l.push(`• ${m.ocurridoEn.slice(5, 10)} ${m.descripcion}`);
  return l.join('\n');
}

export function textoDeudas(movs: Movimiento[], compromisos: Compromiso[], ctx: Contexto): string {
  const apertura = ctx.config.fecha_apertura ?? '2000-01-01 00:00:00';
  const lista = deudasPorPersona(movs, ctx.cuentas, compromisos, apertura);
  if (!lista.length) return '🤝 No hay deudas ni préstamos pendientes.';
  const l: string[] = ['🤝 Deudas'];
  const debes = lista.filter(d => d.saldo < 0 && -d.saldo - d.deOtros > 0);
  const teDeben = lista.filter(d => d.saldo > 0);
  const deOtros = lista.filter(d => d.deOtros > 0);
  if (deOtros.length) {
    l.push('Plata de otros que tienes (no es tuya, es para gastarla por ellos):');
    for (const d of deOtros) l.push(`• ${d.persona.nombre}: ${formatear(d.deOtros)}${d.compromisos[0]?.motivo ? ` · ${d.compromisos[0].motivo}` : ''}`);
  }
  if (debes.length) {
    l.push('Debes:');
    for (const d of debes) {
      const lim = d.compromisos.find(c => c.fechaLimite)?.fechaLimite;
      const motivo = d.compromisos[0]?.motivo;
      l.push(`• ${d.persona.nombre}: ${formatear(-d.saldo - d.deOtros, d.moneda)}${motivo ? ` · ${motivo}` : ''}${lim ? ` · antes del ${describirDia(lim)}` : ''}`);
    }
  }
  if (teDeben.length) {
    l.push('Te deben:');
    for (const d of teDeben) l.push(`• ${d.persona.nombre}: ${formatear(d.saldo, d.moneda)}`);
  }
  return l.join('\n');
}

export function textoUltimos(movs: Movimiento[], ctx: Contexto, n = 8): string {
  const lista = movs.filter(m => m.estado === 'ok').sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn)).slice(0, n);
  if (!lista.length) return 'Aún no hay movimientos.';
  const cats = new Set(ctx.cuentas.filter(c => c.tipo === 'categoria').map(c => c.id));
  return ['🧾 Últimos movimientos', ...lista.map(m => {
    const monto = m.asientos.filter(a => cats.has(a.cuentaId) && a.moneda === 'COP').reduce((s, a) => s + a.monto, 0);
    return `• ${describirFecha(m.ocurridoEn, ctx.ahora, m.sinHora)} · ${m.descripcion}${monto ? ` · ${formatear(monto)}` : ''}`;
  })].join('\n');
}

export function resumenGuardado(p: Propuesta, ctx: Contexto): string {
  return titular(p, ctx);
}

/**
 * La ayuda habla con palabras sencillas y solo de lo que ESTA instalación tiene (sus cuentas, si vende,
 * si maneja dólares). Primero lo de todos los días; los casos menos comunes van al final.
 */
export function textoAyuda(ctx: Contexto): string {
  const otra = ejemploDeCuenta(ctx);
  const usd = cuentaEnDolares(ctx);
  const vende = vendeProductos(ctx);
  const l = [
    '👋 Cuéntame lo que pasó, como se lo contarías a alguien. Por ejemplo:',
    vende ? '• Gasté: «etiquetas 15000» o «transporte 8000»' : '• Gasté: «almuerzo 12000» o «mecato 5000»',
    '• Me llegó plata: «ingreso 50000 trabajo»',
    '• Le presté plata a alguien: «presté 40000 a Ana»',
    '• Me prestaron plata: «le debo 54000 a Pedro»',
    '• Pagué lo que debía: «pagué 54000 a Pedro» · Me pagaron lo que me debían: «Ana me pagó 40000»',
  ];
  if (vende) l.push('• Vendí: «vendí 3 botellas de jugo» (con los precios del catálogo)');
  l.push(
    '• Cosas por comprar: «falta arroz y sal» · para verlas: «lista»',
    '',
    'Para ver cómo vas:',
    '• «saldo»: cuánta plata tienes · «deudas»: quién te debe y a quién le debes',
    '• «semana» o «mes»: en qué se fue la plata · «últimos»: lo último que anotaste',
    '',
    'Si te equivocas, escribe «deshacer». Siempre te muestro lo que entendí y tú pulsas Confirmar si está bien. Nada se borra: lo que deshaces queda marcado como anulado.',
    '',
    'Otros ejemplos:',
    '• Con billete y vuelto: «trident 4500 con billete de 10000, me dieron 5000 y 500 en monedas»',
    '• Otro día: «ayer», «el lunes», «hace 2 días», «15/10»',
    '• Taxi o bus: «taxi de terminal a casa 8000»',
    '• Revisar que tu plata cuadre: «arqueo efectivo 80000» (dices cuánto tienes de verdad)',
    `• Pasar plata de una cuenta a otra: «cambio 50000 efectivo a ${otra}»`,
  );
  if (usd) l.push(`• Cambiar a dólares: «cambio 32000 ${otra} a ${usd.clave} 8 usd»`);
  l.push(
    '• Gasto entre varios: «pizza 9000 pagué por Ivan 3000 y Daniel 2500»',
    '• Agrupar gastos de una salida: añade #cumple-ana al mensaje',
  );
  return l.join('\n');
}

export type { Moneda };
