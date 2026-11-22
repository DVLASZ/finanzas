/** Deudas y préstamos: quién te debe y a quién le debes. «Registrar pago/abono» abre una hoja rápida (monto y cuenta) y deja la frase lista en el chat. */
import { List, PartyPopper, Users } from 'lucide-preact';
import { deudasPorPersona, describirDia, formatear, gruposDe } from '../../../../../packages/core/src/index.ts';
import { Insignia, Vacio, visualDePersona } from '../../components/ui/iconos.tsx';
import { Cargando, Nota } from '../../components/ui/piezas.tsx';
import { irA, prellenarChat } from '../../state/nav.ts';
import { HojaAbono, abrirAbono } from '../../components/ui/HojaAbono.tsx';
import { abrirInfo, cerrarYLuego } from '../../components/ui/HojaInfo.tsx';
import { movimientosDePersona } from '../../lib/grupos.ts';
import { verMovimientos } from '../movimientos/Movimientos.tsx';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';
import { tocable } from '../../lib/tocable.ts';
import { abrirPorCobrarPagar } from '../saldos/aperturas.tsx';

type Deuda = ReturnType<typeof deudasPorPersona>[number];

export function Deudas() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  if (!datos || !ctx) return <Cargando />;
  const nombreGrupo = (g: string | null | undefined): string => (g ? gruposDe(ctx).find(x => x.id === g)?.nombre ?? g : '');
  const lista = deudasPorPersona(datos.movimientos, datos.cuentas, datos.compromisos, datos.config.fecha_apertura ?? '2000-01-01 00:00:00');
  const maxD = Math.max(1, ...lista.map(x => Math.abs(x.saldo)));
  const debes = lista.filter(d => d.saldo < 0 && -d.saldo - d.deOtros > 0);
  const teDeben = lista.filter(d => d.saldo > 0);
  const deOtros = lista.filter(d => d.deOtros > 0);
  const porCobrar = teDeben.filter(d => d.moneda === 'COP').reduce((s, d) => s + d.saldo, 0);
  const porPagar = debes.filter(d => d.moneda === 'COP').reduce((s, d) => s - d.saldo - d.deOtros, 0);
  // la tarjeta queda lista para confirmar: no hay que redactar nada
  const anotar = (frase: string) => { prellenarChat(frase, true); irA('chat'); };
  // el pago o abono se confirma en una hoja rápida: el monto viene con el saldo completo y se puede bajar
  const registrar = (d: Deuda) => abrirAbono({
    nombre: d.persona.nombre, direccion: d.saldo < 0 ? 'debo' : 'me_deben', moneda: d.moneda,
    saldo: (Math.abs(d.saldo) - (d.saldo < 0 ? d.deOtros : 0)) / (d.moneda === 'USD' ? 100 : 1),
  });
  const abrir = (d: Deuda, boton: string, sub: string) => abrirInfo({
    id: `deuda-${d.persona.id}`, titulo: d.persona.nombre, sub,
    movimientos: movimientosDePersona(datos, d.persona.id),
    acciones: [
      { id: 'info-registrar', texto: boton, alTocar: () => cerrarYLuego(() => registrar(d)) },
      { id: 'info-ver-movimientos', texto: 'Ver en Movimientos', icono: <List size={18} />, alTocar: () => cerrarYLuego(() => verMovimientos({ persona: d.persona.id, periodo: 'todo' })) },
    ],
  });
  const personas = (n: number) => `${n} ${n === 1 ? 'persona' : 'personas'}`;

  const Fila = ({ d }: { d: Deuda }) => {
    const limite = d.compromisos.map(c => c.fechaLimite).filter(Boolean).sort()[0];
    const motivo = d.compromisos[0]?.motivo;
    const esDeuda = d.saldo < 0;
    const monto = formatear(Math.abs(d.saldo) - (esDeuda ? d.deOtros : 0), d.moneda);
    const resumen = `${esDeuda ? 'Le debes' : 'Te debe'} ${monto}${motivo ? ` · ${motivo}` : ''}${limite ? ` · antes del ${describirDia(limite)}` : ''}`;
    return (
      <li class="fila toque" role="button" tabIndex={0} data-persona={d.persona.id} onClick={() => abrir(d, esDeuda ? 'Registrar pago ahora' : 'Registrar abono ahora', resumen)}>
        <div class="flex min-w-0 items-center gap-3">
          <Insignia v={visualDePersona(d.persona.nombre)} tam={42} />
          <div>
            <div class="titulo">{d.persona.nombre} <span class="etiq">{nombreGrupo(d.persona.grupo)}</span></div>
            <div class="sub">{motivo ?? ''}{limite ? ` · antes del ${describirDia(limite)}` : ''}</div>
            <div class="barra-fondo mt-2"><div class={`barra-relleno ${esDeuda ? 'mal' : 'pos'}`} style={{ width: `${Math.max(4, Math.round((Math.abs(d.saldo) / maxD) * 100))}%` }} /></div>
          </div>
        </div>
        <div>
          <div class={`monto ${esDeuda ? 'mal' : 'bien'}`}>{monto}</div>
          <button class="chip" onClick={e => { e.stopPropagation(); registrar(d); }}>{esDeuda ? 'Registrar pago ahora' : 'Registrar abono ahora'}</button>
        </div>
      </li>
    );
  };

  const FilaOtros = ({ d }: { d: Deuda }) => (
    <li class="fila">
      <div class="flex min-w-0 items-center gap-3">
        <Insignia v={visualDePersona(d.persona.nombre)} tam={42} />
        <div>
          <div class="titulo">{d.persona.nombre} <span class="etiq">{nombreGrupo(d.persona.grupo)}</span></div>
          <div class="sub">{d.compromisos[0]?.motivo ? `${d.compromisos[0].motivo} · ` : ''}al gastarla escribe «... con plata de {d.persona.nombre.toLowerCase()}»</div>
        </div>
      </div>
      <div>
        <div class="monto">{formatear(d.deOtros, d.moneda)}</div>
        <button class="chip" onClick={() => anotar(`pagué ${d.deOtros}${d.moneda === 'USD' ? ' usd' : ''} a ${d.persona.nombre}`)}>Devolver</button>
      </div>
    </li>
  );

  return (
    <div class="pb-10">
      <HojaAbono />
      <div class="kpis">
        <div class="tarjeta kpi toque" id="kpi-por-cobrar" {...tocable(() => abrirPorCobrarPagar(datos, 'cobrar'))}><div class="etiqueta">Por cobrar</div><div class="kpi-v bien">{formatear(porCobrar)}</div><div class="sub">{personas(teDeben.length)}</div></div>
        <div class="tarjeta kpi toque" id="kpi-por-pagar" {...tocable(() => abrirPorCobrarPagar(datos, 'pagar'))}><div class="etiqueta">Por pagar</div><div class="kpi-v mal">{formatear(porPagar)}</div><div class="sub">{personas(debes.length)}</div></div>
      </div>
      {deOtros.length > 0 && <>
        <h2>Plata de otros</h2>
        <ul class="lista">{deOtros.map(d => <FilaOtros key={d.persona.id} d={d} />)}</ul>
        <Nota>Es plata que te mandaron para gastarla por ellos. No es tuya ni cuenta como deuda.</Nota>
      </>}
      <h2>Debes</h2>
      <ul class="lista">{debes.length ? debes.map(d => <Fila key={d.persona.id} d={d} />) : <li><Vacio Icono={PartyPopper} titulo="No debes nada" detalle="Estás al día con todos." tono="esmeralda" /></li>}</ul>
      <h2>Te deben</h2>
      <ul class="lista">{teDeben.length ? teDeben.map(d => <Fila key={d.persona.id} d={d} />) : <li><Vacio Icono={Users} titulo="Nadie te debe" detalle="Cuando prestes algo, aparece aquí." tono="azul" /></li>}</ul>
      <Nota>Para anotar una deuda o un préstamo, escríbelo en el chat: «le debo 54000 a Pedro por la bici» · «presté 40000 a Ana».</Nota>
    </div>
  );
}
