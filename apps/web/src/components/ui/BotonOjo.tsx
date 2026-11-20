/** El ojo del modo privacidad: esconde o muestra los montos. Vive en Saldos y en Resumen, y como interruptor en Ajustes. */
import { Eye, EyeOff } from 'lucide-preact';
import { alternarPrivacidad, montosOcultos } from '../../state/privacidad.ts';

export function BotonOjo() {
  const oculto = montosOcultos.value;
  const texto = oculto ? 'Mostrar los montos' : 'Ocultar los montos';
  return (
    <button id="ojo" type="button" class="boton-ojo" aria-pressed={oculto} aria-label={texto} title={texto} onClick={alternarPrivacidad}>
      <span key={String(oculto)} class="ojo-icono">{oculto ? <EyeOff size={18} /> : <Eye size={18} />}</span>
    </button>
  );
}
