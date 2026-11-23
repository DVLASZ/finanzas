/**
 * La ventana de "Ver anulados" de la Revisión del mes: los movimientos anulados del mes que se revisa.
 * Tocar una fila abre el detalle ya existente, que es donde se puede restaurar; al volver, la lista ya no trae el que se restauró.
 */
import { Ban } from 'lucide-preact';
import { describirFecha, esArqueoAnulado, rangoPeriodo, type Datos, type Movimiento } from '../../../../../packages/core/src/index.ts';
import { abrirInfo } from '../../components/ui/HojaInfo.tsx';
import { Insignia, Vacio, visualDeMovimiento } from '../../components/ui/iconos.tsx';
import { montoVisible } from '../../lib/montoMov.ts';
import { abrirDetalle } from '../../state/nav.ts';
import { verMonto } from '../../state/privacidad.ts';
import { datos as datosSignal } from '../../state/store.ts';

const LIMITE = 40;

/** La cuenta que mejor dice de qué fue: la categoría si la hay, si no la cuenta de dinero. */
function etiquetaDe(m: Movimiento, datos: Datos): string {
  const cuentas = datos.cuentas;
  const de = (tipo: string) => m.asientos.map(a => cuentas.find(c => c.id === a.cuentaId)).find(c => c?.tipo === tipo)?.nombre;
  return de('categoria') ?? de('dinero') ?? de('fuente') ?? '';
}

/** Los anulados del mes, del más reciente al más viejo (los mismos que cuenta la Revisión, sin los arqueos). */
export function anuladosDelMes(datos: Datos, ahora: string): Movimiento[] {
  const { desde, hasta } = rangoPeriodo('mes', ahora);
  return datos.movimientos
    .filter(m => m.estado === 'anulado' && !esArqueoAnulado(m) && m.ocurridoEn >= desde && m.ocurridoEn < hasta)
    .sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn));
}

/** El cuerpo lee los datos vivos: un movimiento restaurado desaparece de la lista al volver del detalle. */
function CuerpoAnulados({ ahora }: { ahora: string }) {
  const datos = datosSignal.value;
  if (!datos) return null;
  const movs = anuladosDelMes(datos, ahora);
  if (movs.length === 0) return <Vacio Icono={Ban} titulo="Sin anulados este mes" />;
  return (
    <>
      <p class="sub" id="anulados-cuenta">{movs.length} {movs.length === 1 ? 'movimiento anulado' : 'movimientos anulados'}. Toca uno para ver su detalle y restaurarlo.</p>
      <ul class="lista !mt-2" id="lista-anulados">
        {movs.slice(0, LIMITE).map(m => {
          const v = montoVisible(m, datos.cuentas);
          const etiqueta = etiquetaDe(m, datos);
          return (
            <li key={m.id} class="fila anulado-fila" data-id={m.id} role="button" tabIndex={0} onClick={() => abrirDetalle(m.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDetalle(m.id); } }}>
              <div class="flex min-w-0 flex-1 items-center gap-3">
                <Insignia v={visualDeMovimiento(m, datos.cuentas)} tam={38} />
                <div class="min-w-0 flex-1">
                  <div class="titulo anulado-texto break-words">{m.descripcion}</div>
                  <div class="sub break-words">{describirFecha(m.ocurridoEn, ahora, m.sinHora)}{etiqueta ? ` · ${etiqueta}` : ''}</div>
                </div>
              </div>
              <div class="monto anulado-texto shrink-0 tabular-nums">{v.texto ? verMonto(v.texto) : ''}</div>
            </li>
          );
        })}
      </ul>
      {movs.length > LIMITE && <p class="sub" id="anulados-mas">y {movs.length - LIMITE} más</p>}
    </>
  );
}

export function abrirAnulados(_datos: Datos, ahora: string): void {
  abrirInfo({ id: 'anulados', titulo: 'Anulados del mes', cuerpo: <CuerpoAnulados ahora={ahora} /> });
}
