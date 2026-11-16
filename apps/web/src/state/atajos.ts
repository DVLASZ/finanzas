/**
 * Los atajos del chat que arma cada persona. Se guardan en este dispositivo (como el borrador del chat), no en el
 * servidor: son de comodidad y no cambian ningún saldo. La lista y el «ocultar barra» son señales para que el chat y el
 * editor se enteren de lo mismo al instante.
 */
import { signal } from '@preact/signals';
import { limpiarAtajos, type AtajoUsuario } from '../../../../packages/core/src/index.ts';
import { escribir, leer } from '../services/almacen.ts';

export const atajosUsuario = signal<AtajoUsuario[]>([]);
export const barraOculta = signal(false);
/** El editor abierto (desde el «+» del chat o desde Ajustes). */
export const editorAtajos = signal(false);

let cargado = false;
/** Lee lo guardado una sola vez por sesión. */
export async function cargarAtajos(): Promise<void> {
  if (cargado) return;
  cargado = true;
  atajosUsuario.value = limpiarAtajos(await leer('atajos-usuario'));
  barraOculta.value = (await leer<boolean>('atajos-ocultos')) === true;
}

export function guardarAtajos(lista: AtajoUsuario[]): void {
  atajosUsuario.value = lista;
  void escribir('atajos-usuario', lista);
}

export function ocultarBarra(oculta: boolean): void {
  barraOculta.value = oculta;
  void escribir('atajos-ocultos', oculta);
}
