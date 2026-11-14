/**
 * «Conciliar con el banco»: se sube el CSV del extracto, se elige la cuenta y la app marca lo que ya
 * está anotado y propone lo que falta. Cada propuesta deja la frase escrita en el chat para confirmarla.
 * El archivo se lee en este aparato; no se sube a ningún lado.
 */
import { conciliar, formatear, leerExtracto, describirDia, type Conciliacion } from '../../../../../packages/core/src/index.ts';
import { FileWarning } from 'lucide-preact';
import { vacioHtml } from '../../components/ui/iconos.tsx';
import { leerTodo } from '../../services/app.ts';
import { esc } from '../../lib/carta.ts';
import { prellenarChat } from '../../lib/puenteLegado.ts';

export async function vistaConciliar(cont: HTMLElement, irAlChat: () => void): Promise<void> {
  const { datos } = await leerTodo();
  const cuentas = datos.cuentas.filter(c => c.tipo === 'dinero' && c.enDisponible !== false && c.moneda === 'COP' && c.id !== 'efectivo');
  cont.innerHTML = `
    
    <p class="sub">Baja el extracto de la página del banco en CSV, elige la cuenta y súbelo. La app marca lo que ya anotaste y te propone lo que falta, como el 4x1000. El archivo no sale de este aparato.</p>
    <label>Cuenta<select id="cuenta">${cuentas.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}</select></label>
    <div class="acciones"><label class="primario archivo">Elegir el CSV<input type="file" id="csv" accept=".csv,text/csv,text/plain" hidden /></label></div>
    <div id="resultado"></div>`;
  const sal = cont.querySelector<HTMLElement>('#resultado')!;

  const dibujar = (r: Conciliacion, clave: string) => {
    const fecha = (f: string) => `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}`;
    sal.innerHTML = `
      <p><b>${r.encontrados.length}</b> ya estaban anotados · <b>${r.faltan.length}</b> faltan · <b>${r.soloEnLaApp.length}</b> están en la app y no en el banco</p>
      ${r.faltan.length ? `<h3>Lo que falta anotar</h3><ul class="lista">${r.faltan.map((x, i) => `<li class="fila" style="cursor:default"><div>
        <div class="titulo">${esc(x.fila.descripcion || 'Sin descripción')}</div>
        <div class="sub">${esc(describirDia(x.fila.fecha))} · <code>${esc(x.sugerencia)}</code></div></div>
        <div class="acciones"><div class="monto ${x.fila.monto < 0 ? 'mal' : 'bien'}">${esc(formatear(x.fila.monto))}</div><button class="chip" data-anotar="${i}">Anotar</button></div></li>`).join('')}</ul>` : '<p class="vacio">No falta nada. Todo lo del banco está anotado.</p>'}
      ${r.soloEnLaApp.length ? `<h3>Anotado pero no está en el extracto</h3><ul class="lista">${r.soloEnLaApp.map(m => `<li class="fila" style="cursor:default"><div><div class="titulo">${esc(m.descripcion)}</div><div class="sub">${esc(describirDia(m.ocurridoEn.slice(0, 10)))}</div></div></li>`).join('')}</ul>
      <p class="sub">Puede ser plata que todavía no pasa por el banco, o algo que se anotó con otra cuenta o con un valor distinto.</p>` : ''}`;
    sal.querySelectorAll<HTMLButtonElement>('[data-anotar]').forEach(b => b.addEventListener('click', () => {
      const x = r.faltan[Number(b.dataset.anotar)];
      prellenarChat(`${x.sugerencia} ${fecha(x.fila.fecha)}`);
      irAlChat();
    }));
    void clave;
  };

  cont.querySelector<HTMLInputElement>('#csv')!.addEventListener('change', async e => {
    const archivo = (e.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    const filas = leerExtracto(await archivo.text());
    if (!filas.length) { sal.innerHTML = vacioHtml(FileWarning, 'No pude leer ese archivo', 'Tiene que ser el CSV del extracto, con columnas de fecha y valor (o débito y crédito).', 'coral'); return; }
    const cuenta = cont.querySelector<HTMLSelectElement>('#cuenta')!.value;
    dibujar(conciliar(datos, filas, cuenta), cuenta);
  });
}
