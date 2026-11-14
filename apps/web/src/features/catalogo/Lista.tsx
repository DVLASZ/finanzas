/** La lista de compras: lo que falta comprar, con una barra de avance de lo que ya se compró en esta visita. */
import { ShoppingBasket } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { leerLista } from '../../../../../packages/core/src/index.ts';
import { Vacio } from '../../components/ui/iconos.tsx';
import { Cargando, Nota } from '../../components/ui/piezas.tsx';
import { vibrar } from '../../lib/haptico.ts';
import { celebrar } from '../../lib/efectos.ts';
import { app } from '../../services/estado.ts';
import { guardarCambio } from '../../state/acciones.ts';
import { datos as datosSignal } from '../../state/store.ts';

export function Lista() {
  const datos = datosSignal.value;
  const [comprados, setComprados] = useState(0);
  const [nuevo, setNuevo] = useState('');
  if (!datos) return <Cargando />;
  const lista = leerLista(datos.config);
  const total = comprados + lista.length;
  const pct = total ? Math.round((comprados / total) * 100) : 0;
  const guardar = (l: string[]) => guardarCambio(() => app.repo.setConfig('lista_compras', JSON.stringify(l)));

  const agregar = async (e: Event) => {
    e.preventDefault();
    const t = nuevo.trim();
    if (!t) return;
    const nuevas = t.split(/\s*,\s*|\s+y\s+/).map(x => x.trim()).filter(Boolean).slice(0, 20);
    await guardar([...lista, ...nuevas.filter(n => !lista.some(x => x.toLowerCase() === n.toLowerCase()))]);
    setNuevo('');
  };
  const comprado = async (i: number) => {
    vibrar();
    const quedan = lista.filter((_, k) => k !== i);
    await guardar(quedan);
    if (quedan.length === 0) { celebrar(); vibrar([18, 40, 18]); setComprados(0); } else setComprados(comprados + 1);
  };

  return (
    <div class="pb-10">
      {total > 0 && <>
        <div class="tarjeta">
          <div class="flex items-center justify-between"><div class="etiqueta">Avance de la compra</div><b class="tabular-nums">{comprados} de {total}</b></div>
          <div class="barra-fondo mt-2"><div class={`barra-relleno ${pct === 100 ? 'pos' : ''}`} style={{ width: `${pct}%` }} /></div>
        </div>
        <div class="h-3" />
      </>}
      <form class="entrada" style={{ padding: '0 0 .8rem' }} onSubmit={agregar}>
        <input type="text" autocomplete="off" placeholder="Agregar: arroz" aria-label="Agregar a la lista" value={nuevo} onInput={e => setNuevo((e.target as HTMLInputElement).value)} />
        <button class="primario" type="submit">Agregar</button>
      </form>
      <ul class="lista">
        {lista.length ? lista.map((x, i) => (
          <li key={x} class="fila" style={{ cursor: 'default' }}>
            <span class="titulo">{x}</span>
            <button class="chip" onClick={() => void comprado(i)}>Ya lo compré</button>
          </li>
        )) : <li><Vacio Icono={ShoppingBasket} titulo="La lista está vacía" detalle="Nada por comprar por ahora." tono="rosa" /></li>}
      </ul>
      <Nota>También puedes escribirle al chat: «falta arroz y sal». Al comprar, anota el gasto con su precio: «arroz 8000».</Nota>
    </div>
  );
}
