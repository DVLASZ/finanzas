/**
 * Lo que se abre al tocar un bloque de Saldos: una cuenta (sus últimos movimientos y atajos para cuadrarla o pasar plata) y los pagos
 * fijos que entran en la cuenta de los próximos 30 días.
 */
import type { ComponentChildren } from 'preact';
import { ArrowDownToLine, ArrowUpFromLine, CalendarClock, HandCoins, List, PiggyBank, Scale, Users } from 'lucide-preact';
import { deudasPorPersona, describirDia, formatear, type Alerta, type Cuenta, type Datos, type resumenSaldos } from '../../../../../packages/core/src/index.ts';
import type { CuentaProyectada } from '../../../../../packages/core/src/liquidez.ts';
import type { SeguroHoy } from '../../../../../packages/core/src/seguro.ts';
import { abrirInfo, cerrarYLuego } from '../../components/ui/HojaInfo.tsx';
import { movimientosDeCuenta } from '../../lib/grupos.ts';
import { irA, prellenarChat } from '../../state/nav.ts';
import { verMovimientos } from '../movimientos/Movimientos.tsx';

/** Una cuenta de dinero: sus últimos movimientos y las acciones de siempre sobre ella. */
export function abrirCuenta(datos: Datos, cuenta: Cuenta, saldo: number, cuadrarEfectivo: () => void): void {
  const nombre = cuenta.nombre.toLowerCase();
  const alChat = (texto: string) => () => { prellenarChat(texto); irA('chat'); };
  abrirInfo({
    id: `cuenta-${cuenta.id}`, titulo: cuenta.nombre, sub: `Saldo ahora: ${formatear(saldo, cuenta.moneda)}. Estos son sus últimos movimientos.`,
    movimientos: movimientosDeCuenta(datos, cuenta.id, 12),
    acciones: [
      { id: 'info-cuadrar', texto: 'Cuadrar saldo', icono: <Scale size={18} />, alTocar: () => cerrarYLuego(cuenta.id === 'efectivo' ? cuadrarEfectivo : alChat(`arqueo ${nombre} `)) },
      { id: 'info-desde', texto: 'Pasar plata desde aquí', icono: <ArrowUpFromLine size={18} />, alTocar: () => cerrarYLuego(alChat(`pasé  de ${nombre} a `)) },
      { id: 'info-hacia', texto: 'Pasar plata hacia aquí', icono: <ArrowDownToLine size={18} />, alTocar: () => cerrarYLuego(alChat(`pasé  de  a ${nombre}`)) },
      { id: 'info-ver-movimientos', texto: 'Ver todos', icono: <List size={18} />, alTocar: () => cerrarYLuego(() => verMovimientos({ cuenta: cuenta.id, periodo: 'todo' })) },
    ],
  });
}

/** Los pagos fijos de los próximos 30 días que se tuvieron en cuenta, cuenta por cuenta. */
export function abrirProximos(cuentas: CuentaProyectada[]): void {
  abrirInfo({
    id: 'proximos-30', titulo: 'Próximos 30 días', sub: 'Estos son los pagos fijos que faltan y que entraron en la cuenta de cada cuenta.',
    cuerpo: (
      <div id="info-proximos">
        {cuentas.map(c => (
          <div key={c.cuentaId}>
            <h3>{c.nombre}</h3>
            <ul class="lista !mt-1">
              {c.pagos.map(p => (
                <li key={p.fecha + p.concepto} class="fila" style={{ cursor: 'default' }}>
                  <div class="min-w-0"><div class="titulo">{p.concepto}</div><div class="sub">{describirDia(p.fecha)}</div></div>
                  <div class="monto mal tabular-nums">{formatear(p.monto)}</div>
                </li>
              ))}
            </ul>
            <p class={`sub ${c.corta ? 'text-neg' : ''}`}>{c.corta ? `Se queda corta: faltan ${formatear(c.corta.faltan)} el ${describirDia(c.corta.fecha)}.` : `Alcanza, y te quedarían ${formatear(c.minimo)}.`}</p>
          </div>
        ))}
      </div>
    ),
    acciones: [{ id: 'info-pagos-fijos', texto: 'Ver pagos fijos', icono: <CalendarClock size={18} />, alTocar: () => cerrarYLuego(() => irA('pagosfijos')) }],
  });
}

type Resumen = ReturnType<typeof resumenSaldos>;
const fila = (nombre: string, valor: string, clase = '') => <><dt class="text-tx2">{nombre}</dt><dd class={`tabular-nums ${clase}`}>{valor}</dd></>;
const total = (nombre: string, valor: string) => <><dt class="border-t border-white/10 pt-1.5 font-semibold">{nombre}</dt><dd class="border-t border-white/10 pt-1.5 font-bold tabular-nums">{valor}</dd></>;
const alChat = (texto: string, enviar = false) => () => { prellenarChat(texto, enviar); irA('chat'); };
const irAccion = (id: string, texto: string, icono: ComponentChildren, pantalla: Parameters<typeof irA>[0]) => ({ id, texto, icono, alTocar: () => cerrarYLuego(() => irA(pantalla)) });

/** El «Disponible» grande: qué cuentas lo suman, qué queda fuera y lo que ya tiene dueño (pagos fijos y alcancías). */
export function abrirDisponible(r: Resumen, seguro: SeguroHoy): void {
  const suman = r.cuentas.filter(x => x.cuenta.enDisponible !== false && x.cuenta.moneda === 'COP');
  const fuera = r.cuentas.filter(x => !suman.includes(x) && x.saldo !== 0);
  abrirInfo({
    id: 'info-disponible', titulo: 'Disponible', sub: 'La suma de las cuentas de dinero en pesos que sí cuentan, y lo que de eso ya está comprometido.',
    cuerpo: (
      <div id="info-disponible-calculo">
        <dl class="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm">
          {suman.map(x => fila(x.cuenta.nombre, formatear(x.saldo), x.saldo < 0 ? 'text-neg' : ''))}
          {total('Disponible', formatear(r.disponibleCop))}
        </dl>
        {fuera.length > 0 && <>
          <h3>Fuera del disponible</h3>
          <dl class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm">{fuera.map(x => fila(x.cuenta.nombre, formatear(x.saldo, x.cuenta.moneda), 'opacity-80'))}</dl>
        </>}
        <h3>Lo que ya tiene dueño</h3>
        <dl class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm">
          {fila('Pagos fijos que faltan este mes', `-${formatear(seguro.fijos)}`, 'text-adv')}
          {fila('Apartado en alcancías', `-${formatear(seguro.apartado)}`, 'text-info')}
          {total('Libre este mes', formatear(seguro.libre))}
        </dl>
      </div>
    ),
    acciones: [
      irAccion('info-ir-pagos-fijos', 'Pagos fijos', <CalendarClock size={18} />, 'pagosfijos'),
      irAccion('info-ir-alcancias', 'Alcancías', <PiggyBank size={18} />, 'alcancias'),
      { id: 'info-ver-movimientos', texto: 'Ver en Movimientos', icono: <List size={18} />, alTocar: () => cerrarYLuego(() => verMovimientos({ periodo: 'mes' })) },
    ],
  });
}

/** «Seguro para gastar hoy»: cómo sale la cifra del día. */
export function abrirSeguro(seguro: SeguroHoy): void {
  abrirInfo({
    id: 'info-seguro', titulo: 'Seguro para gastar hoy',
    sub: seguro.enRojo ? 'Los compromisos del mes ya cubren todo lo disponible: hoy no hay margen.' : `Lo libre del mes repartido entre los ${seguro.dias} ${seguro.dias === 1 ? 'día' : 'días'} que quedan, contando hoy.`,
    cuerpo: (
      <dl class="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm" id="info-seguro-calculo">
        {fila('Disponible', formatear(seguro.disponible))}
        {fila('Pagos fijos que faltan', `-${formatear(seguro.fijos)}`, 'text-adv')}
        {fila('Apartado en alcancías', `-${formatear(seguro.apartado)}`, 'text-info')}
        {total('Libre este mes', formatear(seguro.libre))}
        {fila(`Por día (${seguro.dias})`, formatear(seguro.porDia))}
        {fila('Ya gastado hoy', formatear(seguro.gastadoHoy), 'text-neg')}
        {total('Te queda hoy', formatear(Math.max(0, seguro.porDia - seguro.gastadoHoy)))}
      </dl>
    ),
    acciones: [
      irAccion('info-ir-pagos-fijos', 'Pagos fijos', <CalendarClock size={18} />, 'pagosfijos'),
      irAccion('info-ir-alcancias', 'Alcancías', <PiggyBank size={18} />, 'alcancias'),
    ],
  });
}

/** «Salud patrimonial»: lo que tienes, lo que te deben y lo que debes, hasta llegar al neto. */
export function abrirSalud(r: Resumen, liquidez: number): void {
  const cobrar = Math.abs(r.teDeben.COP), pagar = Math.abs(r.debes.COP);
  abrirInfo({
    id: 'info-salud', titulo: 'Salud patrimonial', sub: 'Todo en pesos: los dólares y las deudas en dólares no se convierten.',
    cuerpo: (
      <div id="info-salud-calculo">
        <h3>Lo que tienes</h3>
        <dl class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm">
          {fila('Liquidez inmediata', formatear(liquidez), 'text-pos')}
          {fila('Por cobrar', formatear(cobrar), 'text-info')}
        </dl>
        <h3>Lo que debes</h3>
        <dl class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm">{fila('Por pagar', `-${formatear(pagar)}`, 'text-neg')}</dl>
        <dl class="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm">{total('Neto', formatear(liquidez + cobrar - pagar))}</dl>
        {(r.teDeben.USD > 0 || r.debes.USD > 0) && <p class="sub">Aparte, en dólares: te deben {formatear(r.teDeben.USD, 'USD')} y debes {formatear(r.debes.USD, 'USD')}.</p>}
      </div>
    ),
    acciones: [
      irAccion('info-ir-deudas', 'Deudas y préstamos', <Users size={18} />, 'deudas'),
      irAccion('info-ir-cuentas', 'Cuentas', <Scale size={18} />, 'cuentas'),
    ],
  });
}

/** Quién te debe o a quién le debes: la lista de personas con cada saldo. */
export function abrirPorCobrarPagar(datos: Datos, lado: 'cobrar' | 'pagar'): void {
  const lista = deudasPorPersona(datos.movimientos, datos.cuentas, datos.compromisos, datos.config.fecha_apertura ?? '2000-01-01 00:00:00')
    .filter(d => (lado === 'cobrar' ? d.saldo > 0 : d.saldo < 0 && -d.saldo - d.deOtros > 0));
  abrirInfo({
    id: lado === 'cobrar' ? 'info-por-cobrar' : 'info-por-pagar', titulo: lado === 'cobrar' ? 'Te deben' : 'Debes',
    sub: lista.length === 0 ? (lado === 'cobrar' ? 'Nadie te debe nada.' : 'No debes nada.') : `${lista.length} ${lista.length === 1 ? 'persona' : 'personas'}.`,
    cuerpo: lista.length === 0 ? undefined : (
      <ul class="lista !mt-2" id="info-deudas-lista">
        {lista.map(d => (
          <li key={d.persona.id} class="fila" style={{ cursor: 'default' }} data-persona={d.persona.id}>
            <div class="min-w-0"><div class="titulo">{d.persona.nombre}</div>{d.compromisos[0]?.motivo && <div class="sub">{d.compromisos[0].motivo}</div>}</div>
            <div class={`monto tabular-nums ${lado === 'cobrar' ? 'bien' : 'mal'}`}>{formatear(Math.abs(d.saldo) - (lado === 'pagar' ? d.deOtros : 0), d.moneda)}</div>
          </li>
        ))}
      </ul>
    ),
    acciones: [{ ...irAccion('info-ir-deudas', 'Ir a deudas y préstamos', <HandCoins size={18} />, 'deudas') }],
  });
}

/** Por qué salió una alerta y adónde ir para resolverla. */
function motivoYAtajo(a: Alerta): { por: string; ir?: { texto: string; alTocar: () => void } } {
  const t = a.texto;
  const ir = (texto: string, alTocar: () => void) => ({ texto, alTocar });
  switch (a.id) {
    case 'saldo-inicial': return { por: 'Sin un saldo inicial la app no sabe con cuánto empezar y las cifras salen incompletas.' };
    case 'saldo-negativo': return { por: 'Una cuenta de dinero no puede quedar por debajo de cero. Casi siempre falta anotar un ingreso, un vuelto o un traspaso.', ir: ir('Ver en Movimientos', () => verMovimientos({ periodo: 'mes' })) };
    case 'cierre-dia': return { por: 'Al caer la tarde la app te pide comparar la billetera con lo anotado, para que las diferencias no se acumulen.' };
    case 'resumen-mes': case 'resumen-semana': return { por: 'Es el resumen automático del periodo que acaba de cerrar.', ir: ir('Ver el Resumen', () => irA('resumen')) };
    case 'proyeccion': return { por: 'Con lo gastado hasta hoy, repartido por los días del mes, el cierre queda bastante por encima del mes pasado. Es una pista, no una promesa.', ir: ir('Ver el Resumen', () => irA('resumen')) };
    case 'liquidez': return { por: 'Con los pagos fijos de los próximos 30 días, una cuenta se queda sin saldo antes de que termine el periodo.', ir: ir('Ver pagos fijos', () => irA('pagosfijos')) };
    case 'stock': return { por: 'Un producto llegó a su mínimo de existencias.', ir: ir('Ver el catálogo', () => irA('catalogo')) };
  }
  if (/deuda con/i.test(t)) return { por: 'Una deuda tuya tiene fecha límite y está cerca o ya pasó.', ir: ir('Ver deudas', () => irA('deudas')) };
  if (/tope/i.test(t)) return { por: 'Una categoría con tope mensual se acerca a lo que fijaste o ya lo pasó.', ir: ir('Ver el Resumen', () => irA('resumen')) };
  if (/sin registrar/i.test(t)) return { por: 'Pasaron varios días sin anotar nada y las cifras pueden estar desactualizadas.' };
  if (/toca /i.test(t)) return { por: 'Un pago fijo ya está cerca de su fecha y todavía no se ha anotado.', ir: ir('Ver pagos fijos', () => irA('pagosfijos')) };
  return { por: 'La app la calcula con tus movimientos, deudas, pagos fijos y topes.' };
}

/** Una alerta de Saldos: el texto completo, el porqué y atajos (los botones de la alerta y un salto a la pantalla que ayuda). */
export function abrirAlerta(a: Alerta, texto: string): void {
  const { por, ir } = motivoYAtajo(a);
  abrirInfo({
    id: 'info-alerta', titulo: a.nivel === 'urgente' ? 'Aviso urgente' : a.nivel === 'aviso' ? 'Aviso' : 'Para que lo sepas',
    cuerpo: <div id="info-alerta-detalle"><p class="!mt-2">{texto}</p><h3>Por qué sale</h3><p class="sub !mt-0">{por}</p></div>,
    acciones: [
      ...(a.acciones ?? []).map((x, j) => ({ id: `info-alerta-accion-${j}`, texto: x.titulo, alTocar: () => cerrarYLuego(alChat(x.texto, x.enviar)) })),
      ...(ir ? [{ id: 'info-alerta-ir', texto: ir.texto, icono: <List size={18} />, alTocar: () => cerrarYLuego(ir.alTocar) }] : []),
    ],
  });
}
