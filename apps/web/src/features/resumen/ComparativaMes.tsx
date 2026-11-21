/**
 * «Contra el mes pasado»: cuánto se lleva gastado en cada categoría comparado con los mismos días del mes anterior, y
 * hacia dónde va el cierre del mes si el ritmo sigue igual. Lo calcula `comparativaMensual` (núcleo).
 */
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from 'lucide-preact';
import { aLocal, comparativaMensual, textoProyeccion, type Datos } from '../../../../../packages/core/src/index.ts';
import { formatear } from '../../lib/formatear.ts';
import { verTexto } from '../../state/privacidad.ts';
import { BarraAvance, Insignia, visualDeNombre } from '../../components/ui/iconos.tsx';
import { Escalonado, MontoAnimado } from '../../components/ui/piezas.tsx';
import { tocable } from '../../lib/tocable.ts';
import { abrirCategoriaComparada, type Periodos } from './aperturas.tsx';

const p2 = (n: number) => String(n).padStart(2, '0');
/** Los mismos periodos que usa `comparativaMensual`: lo que va del mes y los mismos días del mes pasado (el fin es el día siguiente, sin incluir). */
function periodosDelMes(ahora: Date): Periodos {
  const hoy = aLocal(ahora);
  const anio = Number(hoy.slice(0, 4)), mes = Number(hoy.slice(5, 7)), dia = Number(hoy.slice(8, 10));
  const anioAnt = mes === 1 ? anio - 1 : anio, mesAnt = mes === 1 ? 12 : mes - 1;
  const diaAnt = Math.min(dia, new Date(Date.UTC(anioAnt, mesAnt, 0)).getUTCDate());
  const siguiente = (y: number, m: number, d: number) => `${new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)} 00:00:00`;
  return { desde: `${anio}-${p2(mes)}-01 00:00:00`, hasta: siguiente(anio, mes, dia), previoDesde: `${anioAnt}-${p2(mesAnt)}-01 00:00:00`, previoHasta: siguiente(anioAnt, mesAnt, diaAnt) };
}

function Variacion({ v, nuevo }: { v: number | null; nuevo: boolean }) {
  // gastar más es lo malo: sube en coral, baja en verde
  if (v === null) return <span class="var-chip var-nueva">{nuevo ? 'nuevo' : 'sin dato'}</span>;
  if (v === 0) return <span class="var-chip var-igual"><Minus size={12} />igual</span>;
  return v > 0
    ? <span class="var-chip var-sube"><ArrowUpRight size={12} />+{v} %</span>
    : <span class="var-chip var-baja"><ArrowDownRight size={12} />{v} %</span>;
}

export function ComparativaMes({ datos, ahora }: { datos: Datos; ahora: Date }) {
  const c = comparativaMensual(datos, ahora);
  if (!c.totalActual && !c.totalAnteriorMismosDias) return null;
  const texto = textoProyeccion(c) ? verTexto(textoProyeccion(c) as string) : null;
  const filas = c.filas.slice(0, 6);
  const maxFila = Math.max(1, ...filas.map(f => Math.max(f.actual, f.anterior)));
  const pctProyeccion = c.totalMesAnterior > 0 && c.proyeccion !== null ? Math.min(150, Math.round((c.proyeccion / c.totalMesAnterior) * 100)) : null;

  return (
    <Escalonado class="space-y-3">
      {c.proyeccion !== null && (
        <section class="tarjeta realce" id="proyeccion">
          <div class="etiqueta flex items-center gap-1"><TrendingUp size={14} />Cómo cierra el mes</div>
          <div class="monto mt-0.5"><MontoAnimado valor={c.proyeccion} /></div>
          <p class="sub !mb-2">{texto}</p>
          {pctProyeccion !== null && <>
            <BarraAvance porcentaje={Math.min(100, pctProyeccion)} />
            <p class="sub !mt-1">{pctProyeccion} % de lo que gastaste en todo el mes pasado ({formatear(c.totalMesAnterior)}).</p>
          </>}
        </section>
      )}

      {filas.length > 0 && (
        <section class="tarjeta" id="contra-mes-pasado">
          <h3 class="!mt-0">Contra el mes pasado</h3>
          <p class="sub !mt-0">Lo que llevas hasta hoy contra los mismos {c.dia} días del mes anterior.</p>
          <ul class="lista !m-0" style={{ boxShadow: 'none', background: 'transparent' }}>
            {filas.map(f => (
              <li key={f.cuentaId} class="fila toque" data-comparar={f.cuentaId} {...tocable(() => abrirCategoriaComparada(datos, f.cuentaId, f.nombre, periodosDelMes(ahora), { ahora: `Este mes, hasta el día ${c.dia}`, antes: `Mes anterior, mismos ${c.dia} días` }))}>
                <div class="min-w-0">
                  <div class="flex min-w-0 items-center gap-2"><Insignia v={visualDeNombre(f.nombre)} tam={30} /><span class="titulo min-w-0 truncate">{f.nombre}</span></div>
                  <div class="sub">{formatear(f.actual)} <span class="opacity-70">contra {formatear(f.anterior)}</span></div>
                  <div class="barra-fondo mt-1.5"><div class={`barra-relleno ${f.variacion !== null && f.variacion > 0 ? 'mal' : 'pos'}`} style={{ width: `${Math.max(3, Math.round((f.actual / maxFila) * 100))}%` }} /></div>
                </div>
                <Variacion v={f.variacion} nuevo={f.anterior === 0 && f.actual > 0} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Escalonado>
  );
}
