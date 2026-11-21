/** El botón flotante del modo privacidad: esconde o muestra los montos. Se ve en Saldos, Movimientos y Resumen, justo encima de la barra. */
import { Eye, EyeOff } from 'lucide-preact';
import { pantalla } from '../../state/nav.ts';
import { alternarPrivacidad, montosOcultos } from '../../state/privacidad.ts';

const CON_OJO = ['saldos', 'movimientos', 'resumen'];

export function BotonOjo() {
  if (!CON_OJO.includes(pantalla.value)) return null;
  const oculto = montosOcultos.value;
  const texto = oculto ? 'Mostrar los montos' : 'Ocultar los montos';
  return (
    <button id="ojo" type="button" class="boton-ojo" aria-pressed={oculto} aria-label={texto} title={texto} onClick={e => alternarPrivacidad(e.currentTarget)}>
      <span key={String(oculto)} class="ojo-icono">{oculto ? <EyeOff size={20} /> : <Eye size={20} />}</span>
    </button>
  );
}
