/** El botón flotante del modo privacidad: esconde o muestra los montos. Se ve en Saldos, Movimientos y Resumen, justo encima de la barra. */
import { useEffect } from 'preact/hooks';
import { Eye, EyeOff } from 'lucide-preact';
import { pantalla } from '../../state/nav.ts';
import { alternarPrivacidad, montosOcultos } from '../../state/privacidad.ts';
import { menosMovimiento } from '../../lib/efectos.ts';

const CON_OJO = ['saldos', 'movimientos', 'resumen'];

/** Mientras algo hace scroll el ojo se vuelve casi transparente; vuelve a verse 700 ms después de que se detiene. */
function useOjoTenue(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    let temporizador = 0, enMarco = false;
    const boton = () => document.getElementById('ojo');
    const alHacerScroll = () => {
      if (enMarco) return;
      enMarco = true;
      // un solo cambio de clase por cuadro, sin leer medidas de la página
      requestAnimationFrame(() => { enMarco = false; boton()?.classList.add('tenue'); });
      clearTimeout(temporizador);
      temporizador = window.setTimeout(() => boton()?.classList.remove('tenue'), 700);
    };
    // fase de captura: el scroll no burbujea, así también se oye el de #contenido y el de las ventanas flotantes
    document.addEventListener('scroll', alHacerScroll, { capture: true, passive: true });
    return () => { document.removeEventListener('scroll', alHacerScroll, true); clearTimeout(temporizador); };
  }, [activo]);
}

export function BotonOjo() {
  const visible = CON_OJO.includes(pantalla.value);
  useOjoTenue(visible);
  if (!visible) return null;
  const oculto = montosOcultos.value;
  const texto = oculto ? 'Mostrar los montos' : 'Ocultar los montos';
  const alTocar = (e: MouseEvent) => {
    const boton = e.currentTarget as HTMLElement;
    // media vuelta con resorte (~400 ms); el icono hace su propio morph al cambiar
    if (!menosMovimiento()) boton.animate([{ transform: 'rotateY(0) scale(1)' }, { transform: 'rotateY(180deg) scale(1.14)', offset: .45 }, { transform: 'rotateY(360deg) scale(1)' }], { duration: 400, easing: 'cubic-bezier(.34, 1.45, .64, 1)' });
    alternarPrivacidad();
  };
  return (
    <button id="ojo" type="button" class="boton-ojo" aria-pressed={oculto} aria-label={texto} title={texto} onClick={alTocar}>
      <span key={String(oculto)} class="ojo-icono">{oculto ? <EyeOff size={20} /> : <Eye size={20} />}</span>
    </button>
  );
}
