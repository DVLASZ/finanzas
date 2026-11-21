/**
 * Reporte limpio para imprimir o guardar como PDF. Se arma una hoja con sus cifras reales dentro de `#reporte-impresion`, que fuera de
 * la impresión no se ve, y se llama a `window.print()`: el celular ofrece «Guardar como PDF» o compartir. En la impresión el resto de la
 * app se esconde (ver el bloque «reporte para imprimir» del CSS). No usa librerías ni abre ventanas, así que la política de contenido
 * del Worker no estorba y el bloqueador de ventanas emergentes tampoco.
 */
import { render } from 'preact';
import { aLocal, describirDia, formatear, type Datos } from '../../../../../packages/core/src/index.ts';
import { confirmar } from '../../components/ui/Dialogo.tsx';
import { armarReporte, variacionPct, type DatosReporte } from '../../lib/comparador.ts';
import { montosOcultos } from '../../state/privacidad.ts';

const ID = 'reporte-impresion';

function Variacion({ a, b }: { a: number; b: number }) {
  const v = variacionPct(a, b);
  return <>{v === null ? 'sin dato' : `${v > 0 ? '+' : ''}${v} %`}</>;
}

function Hoja({ r, generado }: { r: DatosReporte; generado: string }) {
  const c = r.comparacion;
  return (
    <article class="rp">
      <header class="rp-cabeza">
        <h1>{r.titulo}</h1>
        <p>{r.periodo}</p>
      </header>

      <section>
        <h2>Resumen</h2>
        <table>
          <tbody>
            <tr><td>Ingresos</td><td class="num">{formatear(r.ingresos)}</td></tr>
            <tr><td>Gastos</td><td class="num">{formatear(r.gastos)}</td></tr>
            <tr class="total"><td>Balance</td><td class="num">{formatear(r.balance)}</td></tr>
          </tbody>
        </table>
      </section>

      {c && (
        <section>
          <h2>Comparación de dos rangos</h2>
          <table>
            <thead><tr><th></th><th class="num">{c.rotuloA}</th><th class="num">{c.rotuloB}</th><th class="num">Cambio</th></tr></thead>
            <tbody>
              <tr><td>Gastos</td><td class="num">{formatear(c.datos.a.gastos)}</td><td class="num">{formatear(c.datos.b.gastos)}</td><td class="num"><Variacion a={c.datos.a.gastos} b={c.datos.b.gastos} /></td></tr>
              <tr><td>Ingresos</td><td class="num">{formatear(c.datos.a.ingresos)}</td><td class="num">{formatear(c.datos.b.ingresos)}</td><td class="num"><Variacion a={c.datos.a.ingresos} b={c.datos.b.ingresos} /></td></tr>
              <tr class="total"><td>Balance</td><td class="num">{formatear(c.datos.a.balance)}</td><td class="num">{formatear(c.datos.b.balance)}</td><td class="num"></td></tr>
            </tbody>
          </table>
          {c.datos.categorias.length > 0 && (
            <table>
              <thead><tr><th>Categoría</th><th class="num">A</th><th class="num">B</th><th class="num">Cambio</th></tr></thead>
              <tbody>{c.datos.categorias.map(f => <tr key={f.id}><td>{f.nombre}</td><td class="num">{formatear(f.a)}</td><td class="num">{formatear(f.b)}</td><td class="num"><Variacion a={f.a} b={f.b} /></td></tr>)}</tbody>
            </table>
          )}
        </section>
      )}

      {r.categorias.length > 0 && (
        <section>
          <h2>Gastos por categoría</h2>
          <table>
            <thead><tr><th>Categoría</th><th class="num">Valor</th><th class="num">%</th></tr></thead>
            <tbody>
              {r.categorias.map(x => <tr key={x.nombre}><td>{x.nombre}</td><td class="num">{formatear(x.total)}</td><td class="num">{x.pct} %</td></tr>)}
              <tr class="total"><td>Total</td><td class="num">{formatear(r.gastos)}</td><td class="num"></td></tr>
            </tbody>
          </table>
        </section>
      )}

      {r.fuentes.length > 0 && (
        <section>
          <h2>Ingresos por fuente</h2>
          <table><tbody>{r.fuentes.map(x => <tr key={x.nombre}><td>{x.nombre}</td><td class="num">{formatear(x.total)}</td></tr>)}</tbody></table>
        </section>
      )}

      {r.mayores.length > 0 && (
        <section>
          <h2>Mayores gastos</h2>
          <table>
            <thead><tr><th>Fecha</th><th>Descripción</th><th class="num">Valor</th></tr></thead>
            <tbody>{r.mayores.map((x, i) => <tr key={i}><td>{describirDia(x.fecha)}</td><td>{x.descripcion}</td><td class="num">{formatear(x.monto)}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      {r.deudas.length > 0 && (
        <section>
          <h2>Deudas y préstamos</h2>
          <table><tbody>{r.deudas.map((d, i) => <tr key={i}><td>{d.nombre}</td><td>{d.saldo > 0 ? 'te debe' : 'le debes'}</td><td class="num">{formatear(Math.abs(d.saldo), d.moneda)}</td></tr>)}</tbody></table>
        </section>
      )}

      {r.metas.length > 0 && (
        <section>
          <h2>Metas de ahorro</h2>
          <table><tbody>{r.metas.map(m => <tr key={m.nombre}><td>{m.nombre}</td><td class="num">{formatear(m.apartado)} de {formatear(m.meta)}</td><td class="num">{Math.min(100, Math.round((m.apartado / m.meta) * 100))} %</td></tr>)}</tbody></table>
        </section>
      )}

      <footer class="rp-pie">Generado el {generado}</footer>
    </article>
  );
}

/**
 * Pide permiso si la privacidad está activa (el reporte lleva las cifras reales), arma la hoja y abre la impresión. Devuelve
 * false si la persona no confirmó.
 */
export async function imprimirReporte(datos: Datos, ahora: Date, titulo: string, periodo: string, desde: string, hasta: string, comparacion?: DatosReporte['comparacion']): Promise<boolean> {
  if (montosOcultos.value) {
    const ok = await confirmar({ titulo: 'El reporte muestra las cifras', texto: 'Tienes la privacidad activa, pero el reporte lleva los montos reales. Quien vea o reciba el PDF los verá. ¿Generarlo?', aceptar: 'Generar reporte', cancelar: 'No' });
    if (!ok) return false;
  }
  const datosReporte: DatosReporte = { ...armarReporte(datos, titulo, periodo, desde, hasta), comparacion };
  document.getElementById(ID)?.remove();
  const nodo = document.createElement('div');
  nodo.id = ID;
  document.body.appendChild(nodo);
  render(<Hoja r={datosReporte} generado={`${describirDia(aLocal(ahora).slice(0, 10))} de ${aLocal(ahora).slice(0, 4)}`} />, nodo);
  const limpiar = () => { render(null, nodo); nodo.remove(); window.removeEventListener('afterprint', limpiar); };
  window.addEventListener('afterprint', limpiar);
  // un cuadro de pintado antes de imprimir, para que la hoja ya esté en pantalla
  await new Promise<void>(res => requestAnimationFrame(() => res()));
  window.print();
  return true;
}

