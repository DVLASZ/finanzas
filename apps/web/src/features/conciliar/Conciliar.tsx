/**
 * «Conciliar con el banco»: se sube el CSV del extracto, se elige la cuenta y la app marca lo que ya
 * está anotado y propone lo que falta. Cada propuesta deja la frase escrita en el chat para confirmarla.
 * El archivo se lee en este aparato; no se sube a ningún lado.
 */
import { FileWarning } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { conciliar, describirDia, formatear, leerExtracto, type Conciliacion } from '../../../../../packages/core/src/index.ts';
import { Selector } from '../../components/ui/Selector.tsx';
import { Vacio } from '../../components/ui/iconos.tsx';
import { Cargando, Nota } from '../../components/ui/piezas.tsx';
import { irA, prellenarChat } from '../../state/nav.ts';
import { datos as datosSignal } from '../../state/store.ts';

const fechaCorta = (f: string): string => `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}`;

export function Conciliar() {
  const datos = datosSignal.value;
  const [cuenta, setCuenta] = useState('');
  const [resultado, setResultado] = useState<Conciliacion | null>(null);
  const [ilegible, setIlegible] = useState(false);
  if (!datos) return <Cargando />;
  const cuentas = datos.cuentas.filter(c => c.tipo === 'dinero' && c.enDisponible !== false && c.moneda === 'COP' && c.id !== 'efectivo');
  const elegida = cuenta || cuentas[0]?.id || '';

  const leer = async (e: Event) => {
    const archivo = (e.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    const filas = leerExtracto(await archivo.text());
    setIlegible(!filas.length);
    setResultado(filas.length ? conciliar(datos, filas, elegida) : null);
  };
  const anotar = (sugerencia: string, fecha: string) => { prellenarChat(`${sugerencia} ${fechaCorta(fecha)}`); irA('chat'); };

  return (
    <div class="pb-10">
      <Nota>Baja el extracto de la página del banco en CSV, elige la cuenta y súbelo. La app marca lo que ya anotaste y te propone lo que falta, como el 4x1000. El archivo no sale de este aparato.</Nota>
      <label>Cuenta
        <Selector etiqueta="Cuenta" valor={elegida} opciones={cuentas.map(c => ({ valor: c.id, etiqueta: c.nombre }))} alCambiar={setCuenta} />
      </label>
      <div class="acciones"><label class="primario archivo">Elegir el CSV<input type="file" accept=".csv,text/csv,text/plain" hidden onChange={leer} /></label></div>

      {ilegible && <Vacio Icono={FileWarning} titulo="No pude leer ese archivo" detalle="Tiene que ser el CSV del extracto, con columnas de fecha y valor (o débito y crédito)." tono="coral" />}

      {resultado && <div>
        <p><b>{resultado.encontrados.length}</b> ya estaban anotados · <b>{resultado.faltan.length}</b> faltan · <b>{resultado.soloEnLaApp.length}</b> están en la app y no en el banco</p>
        {resultado.faltan.length ? <>
          <h3>Lo que falta anotar</h3>
          <ul class="lista">
            {resultado.faltan.map(x => (
              <li key={`${x.fila.fecha}${x.fila.descripcion}${x.fila.monto}`} class="fila" style={{ cursor: 'default' }}>
                <div>
                  <div class="titulo">{x.fila.descripcion || 'Sin descripción'}</div>
                  <div class="sub">{describirDia(x.fila.fecha)} · <code>{x.sugerencia}</code></div>
                </div>
                <div class="acciones">
                  <div class={`monto ${x.fila.monto < 0 ? 'mal' : 'bien'}`}>{formatear(x.fila.monto)}</div>
                  <button class="chip" onClick={() => anotar(x.sugerencia, x.fila.fecha)}>Anotar</button>
                </div>
              </li>
            ))}
          </ul>
        </> : <p class="vacio">No falta nada. Todo lo del banco está anotado.</p>}
        {resultado.soloEnLaApp.length > 0 && <>
          <h3>Anotado pero no está en el extracto</h3>
          <ul class="lista">
            {resultado.soloEnLaApp.map(m => (
              <li key={m.id} class="fila" style={{ cursor: 'default' }}>
                <div><div class="titulo">{m.descripcion}</div><div class="sub">{describirDia(m.ocurridoEn.slice(0, 10))}</div></div>
              </li>
            ))}
          </ul>
          <Nota>Puede ser plata que todavía no pasa por el banco, o algo que se anotó con otra cuenta o con un valor distinto.</Nota>
        </>}
      </div>}
    </div>
  );
}
