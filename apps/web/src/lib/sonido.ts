/**
 * Sonidos suaves al confirmar un movimiento o terminar de leer un comprobante. Vienen apagados: se activan en Ajustes. Se
 * generan con Web Audio (sin archivos) y se callan si la persona pidió menos movimiento. La vibración corta vive en haptico.ts.
 */
import { signal } from '@preact/signals';
import { escribir, leer } from '../services/almacen.ts';
import { menosMovimiento } from './efectos.ts';

export const sonidos = signal(false);
void leer<boolean>('sonidos').then(v => { sonidos.value = v === true; });

export function ponerSonidos(activo: boolean): void {
  sonidos.value = activo;
  void escribir('sonidos', activo);
  if (activo) sonar('ok');
}

let contexto: AudioContext | null = null;

/** Un tono corto: «ok» sube (listo), «escaneo» son dos notas, «error» baja. */
export function sonar(tipo: 'ok' | 'escaneo' | 'error' = 'ok'): void {
  if (!sonidos.value || menosMovimiento()) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    contexto ??= new AC();
    void contexto.resume();
    const notas = tipo === 'ok' ? [660, 880] : tipo === 'escaneo' ? [523, 784] : [330, 220];
    const t0 = contexto.currentTime;
    notas.forEach((hz, i) => {
      const osc = contexto!.createOscillator();
      const ganancia = contexto!.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const ini = t0 + i * 0.09;
      ganancia.gain.setValueAtTime(0.0001, ini);
      ganancia.gain.exponentialRampToValueAtTime(0.08, ini + 0.02);
      ganancia.gain.exponentialRampToValueAtTime(0.0001, ini + 0.16);
      osc.connect(ganancia).connect(contexto!.destination);
      osc.start(ini);
      osc.stop(ini + 0.18);
    });
  } catch { /* sin audio: no pasa nada */ }
}
