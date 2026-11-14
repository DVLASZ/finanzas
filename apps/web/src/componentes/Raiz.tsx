/**
 * Raíz de los componentes. Por ahora es un punto de montaje invisible que comprueba que todo el tubo
 * funciona (Preact, signals, íconos, movimiento) mientras las pantallas siguen siendo las de siempre. A
 * medida que cada vista pasa a componentes, se monta aquí.
 */
import { Check } from 'lucide-preact';
import { useEffect, useRef } from 'preact/hooks';
import { datos, estadoSync, pendientes } from '../estado/store.ts';
import { entrar } from '../efectos.ts';

export function Raiz() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) entrar(ref.current); }, []);
  return (
    <div ref={ref} id="raiz-preact" hidden data-listo="1" data-estado={estadoSync.value} data-pendientes={pendientes.value} data-movimientos={datos.value?.movimientos.length ?? 0}>
      <Check size={16} aria-hidden="true" />
    </div>
  );
}
