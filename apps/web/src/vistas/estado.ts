import { refrescar } from '../estado/store.ts';

/** Las pantallas hechas a mano avisan aquí que cambiaron datos; la interfaz se repinta sola con los nuevos. */
export function actualizarEstado(): void {
  void refrescar();
}
