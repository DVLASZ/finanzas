/**
 * Navegación: qué pantalla se ve y el texto que otra pantalla deja escrito en el chat.
 * Reemplaza al enrutado a mano que vivía en main.ts.
 */
import { signal } from '@preact/signals';

export type Pantalla = 'chat' | 'saldos' | 'movimientos' | 'resumen' | 'mas'
  | 'deudas' | 'ajustes' | 'lista' | 'catalogo' | 'cuentas' | 'guia' | 'conciliar' | 'buzon' | 'trabajadores' | 'revision';

/** Las pantallas que se abren desde «Más» y por eso llevan botón para volver. */
export const INTERNAS: Pantalla[] = ['deudas', 'ajustes', 'lista', 'catalogo', 'cuentas', 'guia', 'conciliar', 'buzon', 'trabajadores', 'revision'];

export const pantalla = signal<Pantalla>('chat');

/** Texto que otra pantalla deja listo en el chat («Registrar pago» desde Deudas, «Contar lo que hay» desde Saldos). */
export const chatPrellenado = signal<{ texto: string; enviar: boolean } | null>(null);

export function irA(p: Pantalla): void { pantalla.value = p; }

/** Deja un texto escrito en el cuadro del chat y va al chat. Con `enviar`, además lo manda (queda una tarjeta por confirmar). */
export function prellenarChat(texto: string, enviar = false): void {
  chatPrellenado.value = { texto, enviar };
}

/** La pantalla de la barra de abajo que se ilumina: las internas cuentan como «Más». */
export const enBarra = (p: Pantalla): Pantalla => (INTERNAS.includes(p) ? 'mas' : p);
