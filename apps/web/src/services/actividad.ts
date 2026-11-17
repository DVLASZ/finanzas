/**
 * Registro de actividad de este dispositivo: lo que pasó con la app y los datos (sincronizaciones con cambios, ediciones,
 * anulaciones, respaldos, PIN y bloqueos). Es una ayuda para notar algo raro, no una auditoría del servidor: vive solo aquí,
 * guarda las últimas 60 entradas y nunca anota montos, conceptos ni claves.
 */
import { signal } from '@preact/signals';
import { escribir, leer } from './almacen.ts';

export interface Entrada { t: string; tipo: Tipo; detalle: string }
export type Tipo = 'sincronizacion' | 'error' | 'edicion' | 'anulacion' | 'duplicado' | 'respaldo' | 'restauracion' | 'pin' | 'bloqueo' | 'acceso';

export const actividad = signal<Entrada[]>([]);
const MAX = 60;
let cargada = false;

export async function cargarActividad(): Promise<void> {
  if (cargada) return;
  cargada = true;
  const guardada = await leer<Entrada[]>('actividad');
  if (Array.isArray(guardada)) actividad.value = [...actividad.value, ...guardada].slice(0, MAX);
}

/** Anota algo. Un error repetido seguido no se vuelve a anotar. */
export function anotarActividad(tipo: Tipo, detalle: string): void {
  const previa = actividad.value[0];
  if (previa && previa.tipo === tipo && previa.detalle === detalle && tipo === 'error') return;
  actividad.value = [{ t: new Date().toISOString(), tipo, detalle }, ...actividad.value].slice(0, MAX);
  void escribir('actividad', actividad.value);
}

export const ETIQUETA: Record<Tipo, string> = {
  sincronizacion: 'Sincronización', error: 'Error', edicion: 'Edición', anulacion: 'Anulación', duplicado: 'Duplicado',
  respaldo: 'Respaldo', restauracion: 'Restauración', pin: 'PIN', bloqueo: 'Bloqueo', acceso: 'Acceso',
};
