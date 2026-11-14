/** Lo que hacen casi todas las pantallas al cambiar algo: guardar, sincronizar sin esperar y repintar. */
import { sincronizar } from '../services/sincronizacion.ts';
import { refrescar } from './store.ts';

export async function guardarCambio(hacer: () => Promise<void>): Promise<void> {
  await hacer();
  await refrescar();
  void sincronizar().then(() => refrescar());
}
