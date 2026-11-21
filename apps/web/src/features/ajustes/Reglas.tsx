/**
 * «Reglas aprendidas» en Ajustes: las que la persona aceptó al corregir un movimiento («Laura va a Nequi»). Se puede
 * cambiar la cuenta o la categoría de cada una y borrarla. Borrar una regla no toca ningún movimiento: es solo un ajuste.
 */
import { Trash2 } from 'lucide-preact';
import { borrarRegla, editarRegla, type ReglaAprendida } from '../../../../../packages/core/src/index.ts';
import { confirmar } from '../../components/ui/Dialogo.tsx';
import { Selector } from '../../components/ui/Selector.tsx';
import { reglas, guardarReglas } from '../../state/reglas.ts';
import { datos } from '../../state/store.ts';

const SIN = '';

export function Reglas() {
  const lista = reglas.value;
  const cuentas = datos.value?.cuentas ?? [];
  const opciones = (tipo: 'dinero' | 'categoria', conNinguna: boolean) => [
    ...(conNinguna ? [{ valor: SIN, etiqueta: tipo === 'dinero' ? 'Sin cuenta fija' : 'Sin categoría fija' }] : []),
    ...cuentas.filter(c => c.tipo === tipo && c.id !== 'cat:descuadre' && (tipo !== 'dinero' || c.moneda === 'COP'))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(c => ({ valor: c.id, etiqueta: c.nombre })),
  ];

  const quitar = async (r: ReglaAprendida) => {
    if (await confirmar({ titulo: `¿Borrar la regla de ${r.clave}?`, texto: 'Los movimientos ya anotados no cambian. Solo dejo de usar esta regla al escribir.', aceptar: 'Sí, borrar', peligro: true })) {
      await guardarReglas(borrarRegla(lista, r.id));
    }
  };

  return (
    <div id="reglas-aprendidas">
      {lista.length === 0 ? (
        <p class="sub" id="reglas-vacio">Todavía no hay reglas. Cuando corrijas la cuenta o la categoría de un movimiento que acabas de anotar, te pregunto si quieres que la próxima vez lo haga solo, por ejemplo «Laura va a Nequi». Aparecen aquí.</p>
      ) : <>
        <p class="sub">Si escribes una de estas palabras y no dices la cuenta, uso la de la regla. Lo que escribas en la frase siempre gana.</p>
        <ul class="lista">
          {lista.map(r => (
            <li key={r.id} class="fila" style={{ cursor: 'default' }} data-regla={r.clave}>
              <div class="w-full">
                <div class="titulo">{r.clave}</div>
                <div class="mt-2 grid gap-2 sm:grid-cols-2">
                  <Selector id={`regla-cuenta-${r.id}`} etiqueta="Cuenta" valor={r.cuentaId ?? SIN} opciones={opciones('dinero', Boolean(r.categoriaId))}
                    alCambiar={v => void guardarReglas(editarRegla(lista, r.id, { cuentaId: v || null }))} />
                  <Selector id={`regla-categoria-${r.id}`} etiqueta="Categoría" valor={r.categoriaId ?? SIN} opciones={opciones('categoria', Boolean(r.cuentaId))}
                    alCambiar={v => void guardarReglas(editarRegla(lista, r.id, { categoriaId: v || null }))} />
                </div>
              </div>
              <button class="secundario" aria-label={`Borrar la regla de ${r.clave}`} onClick={() => void quitar(r)}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      </>}
    </div>
  );
}
