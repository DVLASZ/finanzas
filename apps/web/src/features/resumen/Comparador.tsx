/**
 * Comparador de dos rangos de fechas (A y B): gastos, ingresos, balance y cada categoría, con la variación de B respecto de A. Cada
 * categoría se toca y abre una ventana con los movimientos de los dos rangos. Los rangos se validan antes de calcular.
 */
import { FileText } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { aLocal, type Datos } from '../../../../../packages/core/src/index.ts';
import { Insignia, visualDeNombre } from '../../components/ui/iconos.tsx';
import { aDesdeHasta, compararRangos, etiquetaRango, validarRango, variacionPct, type Rango } from '../../lib/comparador.ts';
import { formatear } from '../../lib/formatear.ts';
import { tocable } from '../../lib/tocable.ts';
import { abrirCategoriaComparada } from './aperturas.tsx';
import { imprimirReporte } from './reportePdf.tsx';

const mesAntes = (hoy: string): Rango => {
  const f = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 2, 1));
  const ult = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0));
  return { inicio: f.toISOString().slice(0, 10), fin: ult.toISOString().slice(0, 10) };
};

function Cambio({ a, b, bueno }: { a: number; b: number; bueno: 'sube' | 'baja' }) {
  const v = variacionPct(a, b);
  if (v === null) return <span class="var-chip var-nueva">{b ? 'nuevo' : 'sin dato'}</span>;
  if (v === 0) return <span class="var-chip var-igual">igual</span>;
  const mejor = (v > 0) === (bueno === 'sube');
  return <span class={`var-chip ${mejor ? 'var-baja' : 'var-sube'}`}>{v > 0 ? '+' : ''}{v} %</span>;
}

function Campo({ rotulo, valor, alCambiar, id }: { rotulo: string; valor: string; alCambiar: (v: string) => void; id: string }) {
  return <label class="cmp-campo">{rotulo}<input type="date" id={id} value={valor} onInput={e => alCambiar((e.target as HTMLInputElement).value)} /></label>;
}

export function ComparadorFechas({ datos, ahora }: { datos: Datos; ahora: Date }) {
  const hoy = aLocal(ahora).slice(0, 10);
  const [a, setA] = useState<Rango>(() => mesAntes(hoy));
  const [b, setB] = useState<Rango>(() => ({ inicio: `${hoy.slice(0, 7)}-01`, fin: hoy }));
  const anio = Number(hoy.slice(0, 4));
  const error = validarRango(a, 'A') ?? validarRango(b, 'B');
  const cmp = error ? null : compararRangos(datos, a, b);
  const rotA = error ? 'Rango A' : `A: ${etiquetaRango(a, anio)}`, rotB = error ? 'Rango B' : `B: ${etiquetaRango(b, anio)}`;
  const max = cmp ? Math.max(1, ...cmp.categorias.map(f => Math.max(f.a, f.b))) : 1;

  const abrir = (id: string, nombre: string) => {
    const ra = aDesdeHasta(a), rb = aDesdeHasta(b);
    // B va en el lugar de «ahora» y A en el de «antes»: así la frase de la ventana dice cuánto cambió B respecto de A
    abrirCategoriaComparada(datos, id, nombre, { desde: rb.desde, hasta: rb.hasta, previoDesde: ra.desde, previoHasta: ra.hasta }, { ahora: rotB, antes: rotA });
  };
  const reporte = () => {
    if (!cmp) return;
    void imprimirReporte(datos, ahora, 'Comparación de rangos', `${etiquetaRango(a, anio)} contra ${etiquetaRango(b, anio)}`, aDesdeHasta(b).desde, aDesdeHasta(b).hasta, { rotuloA: etiquetaRango(a, anio), rotuloB: etiquetaRango(b, anio), datos: cmp });
  };

  return (
    <section class="tarjeta" id="comparador-fechas">
      <h3 class="!mt-0">Comparar dos rangos de fechas</h3>
      <p class="sub !mt-0 mb-2">Elige dos rangos y mira cuánto cambió el rango B respecto del A. Toca una categoría para ver los movimientos de los dos.</p>
      <div class="cmp-rangos">
        <fieldset class="cmp-rango" data-rango="a"><legend>Rango A</legend>
          <Campo id="cmp-a-inicio" rotulo="Desde" valor={a.inicio} alCambiar={v => setA({ ...a, inicio: v })} />
          <Campo id="cmp-a-fin" rotulo="Hasta" valor={a.fin} alCambiar={v => setA({ ...a, fin: v })} />
        </fieldset>
        <fieldset class="cmp-rango" data-rango="b"><legend>Rango B</legend>
          <Campo id="cmp-b-inicio" rotulo="Desde" valor={b.inicio} alCambiar={v => setB({ ...b, inicio: v })} />
          <Campo id="cmp-b-fin" rotulo="Hasta" valor={b.fin} alCambiar={v => setB({ ...b, fin: v })} />
        </fieldset>
      </div>
      {error && <p class="cmp-error" id="comparador-error" role="alert">{error}</p>}

      {cmp && (
        <div id="comparador-resultado">
          <div class="cmp-totales">
            {([['Gastos', cmp.a.gastos, cmp.b.gastos, 'baja'], ['Ingresos', cmp.a.ingresos, cmp.b.ingresos, 'sube'], ['Balance', cmp.a.balance, cmp.b.balance, 'sube']] as const).map(([n, x, y, bueno]) => (
              <div key={n} class="cmp-total" data-total={n.toLowerCase()}>
                <div class="etiqueta">{n}</div>
                <div class="cmp-par"><span class="cmp-lado">A</span><b class="tabular-nums">{formatear(x)}</b></div>
                <div class="cmp-par"><span class="cmp-lado">B</span><b class="tabular-nums">{formatear(y)}</b></div>
                <Cambio a={x} b={y} bueno={bueno} />
              </div>
            ))}
          </div>

          <h4 class="cmp-subtitulo">Por categoría</h4>
          {cmp.categorias.length === 0 ? <p class="sub">No hay gastos en ninguno de los dos rangos.</p> : (
            <ul class="lista !mt-2" id="comparador-categorias">
              {cmp.categorias.map(f => (
                <li key={f.id} class="fila toque" data-comparar-rango={f.id} {...tocable(() => abrir(f.id, f.nombre))}>
                  <div class="min-w-0 flex-1">
                    <div class="flex min-w-0 items-center gap-2"><Insignia v={visualDeNombre(f.nombre)} tam={30} /><span class="titulo min-w-0 truncate">{f.nombre}</span></div>
                    <div class="cmp-barra"><span class="cmp-lado">A</span><span class="barra-fondo"><span class="barra-relleno" style={{ width: `${Math.max(f.a > 0 ? 3 : 0, (f.a / max) * 100)}%` }} /></span><span class="cmp-valor tabular-nums">{formatear(f.a)}</span></div>
                    <div class="cmp-barra"><span class="cmp-lado">B</span><span class="barra-fondo"><span class={`barra-relleno ${f.b > f.a ? 'mal' : 'pos'}`} style={{ width: `${Math.max(f.b > 0 ? 3 : 0, (f.b / max) * 100)}%` }} /></span><span class="cmp-valor tabular-nums">{formatear(f.b)}</span></div>
                  </div>
                  <Cambio a={f.a} b={f.b} bueno="baja" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div class="acciones">
        <button class="secundario" id="reporte-pdf-comparador" disabled={!cmp} onClick={reporte}><FileText size={18} />Reporte PDF</button>
      </div>
    </section>
  );
}

