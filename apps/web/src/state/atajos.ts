/**
 * Los atajos del chat que arma cada persona. La lista viaja como un ajuste más (`atajos_usuario`, junto con los apodos),
 * así se sincroniza con el servidor y no se pierde si se borra la caché del navegador. Si el servidor todavía no la
 * tiene, se usa la copia de este dispositivo y se sube la primera vez. «Ocultar la barra» es solo de este celular.
 */
import { effect, signal } from '@preact/signals';
import { limpiarAtajos, type AtajoUsuario } from '../../../../packages/core/src/index.ts';
import { app, hayServidor } from '../services/estado.ts';
import { escribir, leer } from '../services/almacen.ts';
import { guardarCambio } from './acciones.ts';
import { datos as datosSignal } from './store.ts';

export const atajosUsuario = signal<AtajoUsuario[]>([]);
export const barraOculta = signal(false);
/** El editor abierto (desde el «+» del chat o desde Ajustes). */
export const editorAtajos = signal(false);

let copiaLocal: AtajoUsuario[] = [];
let cargado = false;

/** Lee la copia de este dispositivo y el «ocultar barra», una sola vez por sesión. */
export async function cargarAtajos(): Promise<void> {
  if (cargado) return;
  cargado = true;
  copiaLocal = limpiarAtajos(await leer('atajos-usuario'));
  if (!datosSignal.peek()?.config.atajos_usuario) atajosUsuario.value = copiaLocal;
  barraOculta.value = (await leer<boolean>('atajos-ocultos')) === true;
}

// lo que dice el servidor manda; si todavía no hay nada allá y hay copia local, se sube
effect(() => {
  const crudo = datosSignal.value?.config.atajos_usuario;
  if (crudo) {
    try { atajosUsuario.value = limpiarAtajos(JSON.parse(crudo)); } catch { /* JSON roto: se queda lo que había */ }
  } else if (datosSignal.value && copiaLocal.length && hayServidor()) {
    void guardarCambio(() => app.repo.setConfig('atajos_usuario', JSON.stringify(copiaLocal)));
  }
});

export function guardarAtajos(lista: AtajoUsuario[]): void {
  atajosUsuario.value = lista;
  copiaLocal = lista;
  void escribir('atajos-usuario', lista);
  void guardarCambio(() => app.repo.setConfig('atajos_usuario', JSON.stringify(lista)));
}

export function ocultarBarra(oculta: boolean): void {
  barraOculta.value = oculta;
  void escribir('atajos-ocultos', oculta);
}
