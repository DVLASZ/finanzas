/**
 * Las reglas aprendidas (core/src/reglas.ts) viajan como un ajuste más (`reglas_aprendidas`): se leen de la config que ya
 * está cargada y se guardan por la misma cola de sincronización que los atajos.
 */
import { computed } from '@preact/signals';
import { leerReglas, serializarReglas, type ReglaAprendida } from '../../../../packages/core/src/index.ts';
import { app } from '../services/estado.ts';
import { guardarCambio } from './acciones.ts';
import { datos } from './store.ts';

export const reglas = computed<ReglaAprendida[]>(() => leerReglas(datos.value?.config ?? {}));

export function guardarReglas(lista: ReglaAprendida[]): Promise<void> {
  return guardarCambio(() => app.repo.setConfig('reglas_aprendidas', serializarReglas(lista)));
}
