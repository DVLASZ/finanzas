/**
 * Pagos fijos: lo que se repite cada mes (arriendo, internet, el plan del celular). La app no registra nada sola:
 * avisa antes, y aquí cada pago pendiente trae un botón que deja la frase lista en el chat para confirmar con un toque.
 * Se crean y se quitan escribiéndole al chat («cada mes el 5 internet 60000»); aquí también hay un formulario.
 */
import { CalendarClock, CalendarPlus, Check, Clock, Sparkles } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { aLocal, DIAS_DE_ANTICIPO, formatear, hallarMontos, leerRecurrentes, yaRegistrado } from '../../../../../packages/core/src/index.ts';
import { Insignia, Vacio, visualDeNombre } from '../../components/ui/iconos.tsx';
import { irA, prellenarChat } from '../../state/nav.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';

export function PagosFijos() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [dia, setDia] = useState('');
  if (!datos || !ctx) return <p class="vacio">Cargando…</p>;
  const hoy = aLocal(ctx.ahora);
  const diaHoy = Number(hoy.slice(8, 10));
  const lista = [...leerRecurrentes(datos.config)].sort((a, b) => a.dia - b.dia);
  const total = lista.reduce((s, r) => s + r.monto, 0);
  const pendiente = lista.filter(r => !yaRegistrado(r, datos.movimientos, hoy)).reduce((s, r) => s + r.monto, 0);

  const registrar = (frase: string) => { prellenarChat(frase, true); irA('chat'); };
  const crear = (e: Event) => {
    e.preventDefault();
    const m = Math.round(hallarMontos(monto)[0]?.valor ?? 0);
    const d = Math.round(Number(dia));
    if (!concepto.trim() || !(m > 0) || !(d >= 1 && d <= 28)) return;
    prellenarChat(`cada mes el ${d} ${concepto.trim().toLowerCase()} ${m}`, true);
    irA('chat');
  };

  return (
    <div class="space-y-3 pb-10">
      <div class="kpis !mb-0">
        <div class="tarjeta kpi"><div class="etiqueta">Cada mes</div><div class="kpi-v">{formatear(total)}</div></div>
        <div class="tarjeta kpi"><div class="etiqueta">Falta por pagar</div><div class="kpi-v" style={{ color: 'var(--adv)' }}>{formatear(pendiente)}</div></div>
      </div>

      {lista.length === 0 ? <Vacio Icono={CalendarClock} titulo="Sin pagos fijos" detalle="Agrega el arriendo, el internet o lo que pagas cada mes." tono="ambar" /> : (
        <ul class="lista">
          {lista.map(r => {
            const hecho = yaRegistrado(r, datos.movimientos, hoy);
            const toca = !hecho && diaHoy >= r.dia - DIAS_DE_ANTICIPO;
            return (
              <li key={r.frase} class="fila" style={{ cursor: 'default' }}>
                <div class="flex min-w-0 items-center gap-3">
                  <Insignia v={visualDeNombre(r.concepto)} tam={42} />
                  <div class="min-w-0"><div class="titulo">{r.concepto}</div>
                    <div class="sub flex items-center gap-1">{hecho ? <><Check size={13} class="text-pos" />Pagado este mes</> : toca ? <><Clock size={13} class="text-adv" />{diaHoy > r.dia ? 'Ya pasó el día' : 'Toca pronto'} · el {r.dia}</> : <>Cada mes el {r.dia}</>}</div></div>
                </div>
                <div class="text-right"><div class="monto">{formatear(r.monto)}</div>
                  {!hecho && <button class="chip !min-h-10 mt-1" onClick={() => registrar(r.frase)}>Registrar</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form class="form-nueva" onSubmit={crear}>
        <input type="text" placeholder="Nuevo pago fijo: Internet" aria-label="Concepto" value={concepto} onInput={e => setConcepto((e.target as HTMLInputElement).value)} />
        <div class="fila2">
          <input type="text" inputMode="numeric" placeholder="Monto" aria-label="Monto" value={monto} onInput={e => setMonto((e.target as HTMLInputElement).value)} />
          <input type="number" min="1" max="28" placeholder="Día" aria-label="Día del mes" style={{ maxWidth: '5.5rem' }} value={dia} onInput={e => setDia((e.target as HTMLInputElement).value)} />
          <button class="primario" type="submit"><CalendarPlus size={18} />Agregar</button>
        </div>
      </form>

      <p class="callout"><span class="callout-ico"><Sparkles size={16} /></span><span class="callout-txt">Dos días antes del cobro la app te avisa al celular, y desde ahí el pago aparece aquí listo para registrar. El «seguro para gastar» de Saldos ya descuenta los que faltan este mes. Para quitar uno, escribe «quitar recurrente internet» en el chat.</span></p>
    </div>
  );
}
