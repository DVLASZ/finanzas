/**
 * `formatear` de las pantallas de cifras: igual que el del núcleo, pero con el modo privacidad activo devuelve los puntos.
 * Leer la señal aquí hace que cada pantalla se repinte sola cuando se toca el ojo. Los cuadros de diálogo y los flujos que la
 * persona abre a propósito (cuadre, edición) usan el del núcleo, porque ahí sí hay que ver la cifra.
 */
import { formatear as formatearReal, type Moneda } from '../../../../packages/core/src/index.ts';
import { montosOcultos, PUNTOS } from '../state/privacidad.ts';

export function formatear(valor: number, moneda?: Moneda): string {
  return montosOcultos.value ? PUNTOS : formatearReal(valor, moneda);
}
