/**
 * «Buzón»: avisos que otras de tus apps te dejaron («Mamá te giró $150.000») y, si esta app tiene
 * destinos, un formulario para avisar a otra. Anotar un aviso deja la frase escrita en el chat.
 */
import { Inbox } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { formatear } from '../../../../../packages/core/src/index.ts';
import { Selector } from '../../components/ui/Selector.tsx';
import { Vacio } from '../../components/ui/iconos.tsx';
import { Cargando, Nota } from '../../components/ui/piezas.tsx';
import { app, hayServidor } from '../../services/estado.ts';
import { avisarAOtraApp, destinosDelBuzon } from '../../services/servidor.ts';
import { guardarCambio } from '../../state/acciones.ts';
import { irA, prellenarChat } from '../../state/nav.ts';
import { datos as datosSignal } from '../../state/store.ts';

interface Aviso { id: string; de: string; monto: number; concepto: string; cuando: string; estado: 'nuevo' | 'hecho' }

function leerAvisos(config: Record<string, string>): Aviso[] {
  try { const l = JSON.parse(config.buzon ?? '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}

export function Buzon() {
  const datos = datosSignal.value;
  const [destinos, setDestinos] = useState<string[]>([]);
  const [destino, setDestino] = useState('');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [mensaje, setMensaje] = useState('');
  useEffect(() => { if (hayServidor()) void destinosDelBuzon().then(setDestinos); }, []);
  if (!datos) return <Cargando />;
  const avisos = leerAvisos(datos.config);
  const nuevos = avisos.filter(a => a.estado === 'nuevo').reverse();

  const marcar = (id: string) => guardarCambio(() => app.repo.setConfig('buzon', JSON.stringify(avisos.map(a => (a.id === id ? { ...a, estado: 'hecho' } : a)))));
  const anotar = async (a: Aviso) => { await marcar(a.id); prellenarChat(`ingreso ${a.monto} ${a.de}`); irA('chat'); };
  const avisar = async (e: Event) => {
    e.preventDefault();
    setMensaje('Enviando...');
    setMensaje(await avisarAOtraApp(destino || destinos[0], Number(monto), concepto));
  };

  return (
    <div class="pb-10">
      <Nota>Avisos que otras de tus apps te dejaron. Solo es un aviso: tú decides si lo anotas.</Nota>
      <ul class="lista">
        {nuevos.length ? nuevos.map(a => (
          <li key={a.id} class="fila" style={{ cursor: 'default' }}>
            <div>
              <div class="titulo">{a.de}: {formatear(a.monto)}</div>
              <div class="sub">{a.concepto || 'Sin concepto'} · {a.cuando.slice(0, 10)}</div>
            </div>
            <div class="acciones">
              <button class="chip" onClick={() => void anotar(a)}>Anotar</button>
              <button class="chip" onClick={() => void marcar(a.id)}>Descartar</button>
            </div>
          </li>
        )) : <li><Vacio Icono={Inbox} titulo="No hay avisos nuevos" detalle="Cuando otra de tus apps te deje uno, aparece aquí." tono="cian" /></li>}
      </ul>
      {destinos.length > 0 && <>
        <h2>Avisar a otra app</h2>
        <form onSubmit={avisar}>
          <label>A quién
            <Selector etiqueta="A quién" valor={destino || destinos[0]} opciones={destinos.map(d => ({ valor: d, etiqueta: d }))} alCambiar={setDestino} />
          </label>
          <label>Monto<input type="number" inputMode="numeric" min="1" placeholder="150000" required value={monto} onInput={e => setMonto((e.target as HTMLInputElement).value)} /></label>
          <label>Concepto<input type="text" maxLength={80} placeholder="Giro para Cooperativa" value={concepto} onInput={e => setConcepto((e.target as HTMLInputElement).value)} /></label>
          <div class="acciones"><button class="primario" type="submit">Avisar</button></div>
          <p class="sub" aria-live="polite">{mensaje}</p>
        </form>
      </>}
    </div>
  );
}
