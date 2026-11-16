/**
 * Alertas proactivas: cosas que conviene avisarte aunque no preguntes (en la pantalla de saldos
 * de la app y, más adelante, como notificaciones push).
 */
import { calcularSaldos, deudasPorPersona, diasSinRegistros, estadoPresupuesto, gastoPorCategoria, totalIngresos } from './consultas.ts';
import { formatear } from './dinero.ts';
import { ejemploDeSaldos } from './entidades.ts';
import { aLocal, describirDia, nombreMes, rangoPeriodo } from './fechas.ts';
import { describirFrecuencia, periodoDe, recurrentesPendientes } from './recurrentes.ts';
import { comparativaMensual, textoProyeccion } from './comparativa.ts';
import type { Datos } from './repo.ts';

export interface Alerta {
  nivel: 'urgente' | 'aviso' | 'info';
  texto: string;
  /** Para saber de qué alerta se trata sin leer el texto (los avisos al celular saltan la del saldo inicial). */
  id?: 'saldo-inicial' | 'saldo-negativo' | 'cierre-dia' | 'resumen-mes' | 'resumen-semana' | 'proyeccion';
  /** Botones que la app muestra con la alerta. `enviar`: el texto se manda solo al chat (queda una tarjeta por confirmar); si no, solo se deja escrito. */
  acciones?: { titulo: string; texto: string; enviar?: boolean }[];
}

/** Días sin registrar movimientos a partir de los cuales se avisa. */
export const DIAS_SIN_REGISTRO = 5;

export function calcularAlertas(d: Datos, ahora: Date): Alerta[] {
  const res: Alerta[] = [];
  const hoy = aLocal(ahora);
  const apertura = d.config.fecha_apertura ?? '2000-01-01 00:00:00';

  if (apertura.startsWith('2000')) {
    res.push({ id: 'saldo-inicial', nivel: 'aviso', texto: `Falta decir cuánta plata tienes. En el chat escribe, por ejemplo: «saldo inicial ${ejemploDeSaldos(d)}».` });
  }

  // una cuenta de dinero en negativo es plata que no existe: casi siempre falta anotar algo
  if (!apertura.startsWith('2000')) {
    const saldos = calcularSaldos(d.movimientos, apertura);
    for (const c of d.cuentas.filter(c => c.tipo === 'dinero')) {
      const s = saldos.get(`${c.id}|${c.moneda}`) ?? 0;
      if (s < 0) res.push({ id: 'saldo-negativo', nivel: 'urgente', texto: `${c.nombre} está en -${formatear(-s, c.moneda)} y eso no puede ser. Falta anotar algo: un vuelto, un depósito o pasar plata de otra cuenta. Si ya revisaste y no encuentras qué, cuenta lo que tienes de verdad.`, acciones: [{ titulo: 'Contar lo que hay', texto: `arqueo ${c.clave} ` }] });
    }
  }

  // al caer la tarde: ¿la billetera tiene lo que dice la app? Si hubo movimientos hoy y nadie ha contado, se pregunta una vez.
  if (!apertura.startsWith('2000') && Number(hoy.slice(11, 13)) >= 18) {
    const dia = hoy.slice(0, 10);
    const deHoy = d.movimientos.filter(m => m.estado === 'ok' && m.ocurridoEn.slice(0, 10) === dia);
    const tocaBilletera = deHoy.some(m => m.asientos.some(x => x.cuentaId === 'efectivo' || x.cuentaId === 'monedas'));
    if (tocaBilletera && !deHoy.some(m => m.tipo === 'ajuste')) {
      const s = calcularSaldos(d.movimientos, apertura);
      const ef = s.get('efectivo|COP') ?? 0, mo = s.get('monedas|COP') ?? 0;
      if (ef >= 0 && mo >= 0) {
        res.push({
          id: 'cierre-dia', nivel: 'info',
          texto: `Cierre del día: según la app tienes ${formatear(ef)} en efectivo y ${formatear(mo)} en monedas. ¿Es lo que hay en la billetera?`,
          acciones: [
            { titulo: 'Sí, cuadra', texto: `arqueo efectivo ${ef} monedas ${mo}`, enviar: true },
            { titulo: 'No cuadra', texto: 'arqueo efectivo ' },
          ],
        });
      }
    }
  }

  const dias = diasSinRegistros(d.movimientos, hoy);
  if (dias !== null && dias >= DIAS_SIN_REGISTRO) {
    res.push({ nivel: 'aviso', texto: `Llevas ${dias} días sin registrar movimientos. Anota lo que falta, o escribe «arqueo efectivo 80000» para decir cuánta plata tienes de verdad.` });
  }

  // Deudas con fecha límite (las tuyas)
  for (const dp of deudasPorPersona(d.movimientos, d.cuentas, d.compromisos, apertura)) {
    if (dp.saldo >= 0) continue;
    const limite = dp.compromisos.map(c => c.fechaLimite).filter(Boolean).sort()[0];
    if (!limite) continue;
    const faltan = Math.round((Date.parse(limite) - Date.parse(hoy.slice(0, 10))) / 86400000);
    const monto = formatear(-dp.saldo, dp.moneda);
    if (faltan < 0) res.push({ nivel: 'urgente', texto: `Tu deuda con ${dp.persona.nombre} (${monto}) venció el ${describirDia(limite)}.` });
    else if (faltan <= 3) res.push({ nivel: 'urgente', texto: `Tu deuda con ${dp.persona.nombre} (${monto}) vence ${faltan === 0 ? 'hoy' : faltan === 1 ? 'mañana' : `en ${faltan} días`} (${describirDia(limite)}).` });
    else if (faltan <= 10) res.push({ nivel: 'aviso', texto: `Tu deuda con ${dp.persona.nombre} (${monto}) vence el ${describirDia(limite)} (en ${faltan} días).` });
  }

  // los lunes: cómo le fue a la semana que pasó
  if (new Date(hoy.slice(0, 10) + 'T00:00:00Z').getUTCDay() === 1) {
    const pasada = rangoPeriodo('semana', new Date(ahora.getTime() - 7 * 86400000));
    const gastos = gastoPorCategoria(d.movimientos, d.cuentas, pasada.desde, pasada.hasta);
    const gastado = gastos.reduce((s, x) => s + x.total, 0);
    if (gastado > 0) {
      const mayores = [...gastos].sort((a, b) => b.total - a.total).slice(0, 2).map(x => `${x.cuenta.nombre} ${formatear(x.total)}`).join(', ');
      res.push({ id: 'resumen-semana', nivel: 'info', texto: `Semana pasada: gastaste ${formatear(gastado)} e ingresaron ${formatear(totalIngresos(d.movimientos, d.cuentas, pasada.desde, pasada.hasta))}. Lo que más pesó: ${mayores}.` });
    }
  }

  // Gastos que se repiten cada mes y todavía no se han anotado
  for (const r of recurrentesPendientes(d.config, d.movimientos, hoy)) {
    res.push({ nivel: 'aviso', texto: `${periodoDe(r).replace(/^./, c => c.toUpperCase())} toca ${r.concepto} (${formatear(r.monto)}, ${describirFrecuencia(r)}). Anótalo así: «${r.frase}».` });
  }

  // Proyección del mes: si a este ritmo se gasta bastante más que el mes pasado, se avisa (pasados diez días del mes)
  {
    const c = comparativaMensual(d, ahora);
    const t = textoProyeccion(c);
    if (t && c.dia >= 10 && (c.proyeccionVsMesAnterior ?? 0) >= 15) res.push({ id: 'proyeccion', nivel: 'aviso', texto: t });
  }

  // Topes mensuales
  const { desde, hasta } = rangoPeriodo('mes', ahora);
  for (const catId of Object.keys(d.presupuestos)) {
    const e = estadoPresupuesto(d.movimientos, d.cuentas, d.presupuestos, catId, desde, hasta, d.config.tope_arrastra === '1');
    const nombre = d.cuentas.find(c => c.id === catId)?.nombre ?? catId;
    if (!e) continue;
    if (e.porcentaje >= 100) res.push({ nivel: 'urgente', texto: `Superaste el tope de ${nombre}: ${formatear(e.gastado)} de ${formatear(e.tope)}.` });
    else if (e.porcentaje >= 80) res.push({ nivel: 'aviso', texto: `${nombre} va al ${e.porcentaje}% del tope (${formatear(e.gastado)} de ${formatear(e.tope)}).` });
  }

  // los primeros días del mes: cómo le fue al mes que pasó
  if (Number(hoy.slice(8, 10)) <= 5) {
    const pasado = rangoPeriodo('mes', new Date(ahora.getTime() - 6 * 86400000));
    const gastos = gastoPorCategoria(d.movimientos, d.cuentas, pasado.desde, pasado.hasta);
    const gastado = gastos.reduce((s, x) => s + x.total, 0);
    if (gastado > 0) {
      const mes = nombreMes(pasado.desde);
      const mayores = [...gastos].sort((a, b) => b.total - a.total).slice(0, 2).map(x => `${x.cuenta.nombre} ${formatear(x.total)}`).join(', ');
      res.push({ id: 'resumen-mes', nivel: 'info', texto: `${mes[0].toUpperCase()}${mes.slice(1)}: gastaste ${formatear(gastado)} e ingresaron ${formatear(totalIngresos(d.movimientos, d.cuentas, pasado.desde, pasado.hasta))}. Lo que más pesó: ${mayores}.` });
    }
  }

  const orden = { urgente: 0, aviso: 1, info: 2 };
  return res.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}
