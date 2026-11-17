/**
 * Modo privacidad: la app arranca con los montos grandes escondidos («••••••») y el ojo de la cabecera los muestra u
 * oculta. Por defecto están ocultos, para mirar la app en la calle sin que nadie al lado vea cuánto hay. Lo que elijas
 * se recuerda en este celular.
 */
import { signal } from '@preact/signals';
import { escribir, leer } from '../services/almacen.ts';

export const montosOcultos = signal(true);
export const PUNTOS = '••••••';

const aplicar = () => { document.documentElement.dataset.privado = montosOcultos.value ? '1' : '0'; };
aplicar();
void leer<boolean>('montos-ocultos').then(v => { if (v === false) { montosOcultos.value = false; aplicar(); } });

export function alternarPrivacidad(): void {
  montosOcultos.value = !montosOcultos.value;
  aplicar();
  void escribir('montos-ocultos', montosOcultos.value);
}

/** El texto de un monto, o los puntos si la privacidad está activa. */
export const verMonto = (texto: string): string => (montosOcultos.value ? PUNTOS : texto);

/** Un texto con montos adentro («tienes $483.000 en efectivo»): con la privacidad activa, cada monto se vuelve puntos. */
export const verTexto = (texto: string): string => (montosOcultos.value ? texto.replace(/-?\$\s?\d[\d.,]*/g, PUNTOS) : texto);
