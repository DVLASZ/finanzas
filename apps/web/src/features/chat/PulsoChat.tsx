/**
 * La cabecera viva del chat: lo disponible, las barras del gasto de los últimos 7 días y el estado del ritmo (verde,
 * ámbar o coral). Se puede plegar a una sola línea; la app se acuerda de cómo la dejaste. Las cuentas están en el
 * núcleo (`gastoDiario`, `estadoRitmo`); aquí solo se dibujan.
 */
import { Activity, ChevronDown, ShieldAlert, ShieldCheck, ShieldHalf } from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { comparativaMensual, estadoRitmo, formatear, gastoDiario, resumenSaldos, seguroParaGastar } from '../../../../../packages/core/src/index.ts';
import { MontoAnimado } from '../../components/ui/piezas.tsx';
import { escribir, leer } from '../../services/almacen.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';

const INICIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const NOMBRE = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function PulsoChat() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  const [abierto, setAbierto] = useState(true);
  useEffect(() => { void leer<boolean>('pulso-abierto').then(v => { if (v === false) setAbierto(false); }); }, []);
  const pulso = useMemo(() => {
    if (!datos || !ctx) return null;
    const apertura = datos.config.fecha_apertura ?? '2000-01-01 00:00:00';
    const seguro = seguroParaGastar(datos, ctx.ahora);
    return {
      disponible: resumenSaldos(datos.movimientos, datos.cuentas, apertura).disponibleCop,
      dias: gastoDiario(datos, ctx.ahora, 7),
      seguro,
      ritmo: estadoRitmo(seguro, comparativaMensual(datos, ctx.ahora)),
    };
  }, [datos, ctx]);
  if (!pulso) return null;
  const { disponible, dias, seguro, ritmo } = pulso;
  const alternar = () => { setAbierto(!abierto); void escribir('pulso-abierto', !abierto); };
  const max = Math.max(1, ...dias.map(d => d.total));
  const semana = dias.reduce((s, d) => s + d.total, 0);
  const Escudo = ritmo.estado === 'bien' ? ShieldCheck : ritmo.estado === 'cerca' ? ShieldHalf : ShieldAlert;
  const pct = seguro.porDia > 0 ? Math.min(100, Math.round((seguro.gastadoHoy / seguro.porDia) * 100)) : 0;

  return (
    <section class={`pulso mx-3 mt-2 ${ritmo.estado}`} id="pulso" data-estado={ritmo.estado} aria-label="Cómo vas">
      <button type="button" class="pulso-cab" id="pulso-alternar" aria-expanded={abierto} onClick={alternar}>
        <span class="pulso-punto" aria-hidden="true" />
        <span class="min-w-0 flex-1 text-left">
          <span class="etiqueta block">Disponible</span>
          <span data-ajusta class="block truncate text-[1.35rem] font-extrabold leading-tight tracking-tight"><MontoAnimado valor={disponible} /></span>
        </span>
        <span class="pulso-ritmo"><Escudo size={16} aria-hidden="true" />{ritmo.estado === 'bien' ? 'Vas bien' : ritmo.estado === 'cerca' ? 'Cerca del tope' : 'Pasaste el tope'}</span>
        <ChevronDown size={18} class={`pulso-flecha shrink-0 text-tx2 ${abierto ? 'abierto' : ''}`} aria-hidden="true" />
      </button>
      {abierto && (
        <div class="pulso-cuerpo" id="pulso-cuerpo">
          <div class="pulso-barras" role="img" aria-label={`Gasto de los últimos 7 días: ${dias.map(d => `${NOMBRE[d.diaSemana]} ${formatear(d.total)}`).join(', ')}`}>
            {dias.map((d, i) => (
              <div key={d.fecha} class={`pulso-dia ${i === dias.length - 1 ? 'hoy' : ''}`} title={`${NOMBRE[d.diaSemana]}: ${formatear(d.total)}`}>
                <span class="pulso-barra-caja"><span class="pulso-barra" style={{ height: `${Math.max(d.total > 0 ? 10 : 3, Math.round((d.total / max) * 100))}%`, animationDelay: `${i * 55}ms` }} /></span>
                <span class="pulso-inicial">{INICIAL[d.diaSemana]}</span>
              </div>
            ))}
          </div>
          <div class="min-w-0">
            <div class="sub flex flex-wrap items-center gap-x-1.5"><Activity size={14} aria-hidden="true" />7 días: <b class="text-tx">{formatear(semana)}</b></div>
            <p class="pulso-texto">{ritmo.texto}</p>
            {seguro.porDia > 0 && !seguro.enRojo && (
              <div class="pulso-meter" role="img" aria-label={`Hoy llevas el ${pct} % de lo seguro`}><span style={{ width: `${pct}%` }} /></div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
