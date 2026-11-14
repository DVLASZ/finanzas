/**
 * Navegación: qué pantalla se ve, qué cajón de detalle está abierto y el texto que otra pantalla deja escrito
 * en el chat. Cada cambio de pantalla o cajón es una entrada del historial del navegador, así el gesto o el
 * botón «atrás» del teléfono vuelve dentro de la app en vez de cerrarla.
 */
import { signal } from '@preact/signals';

export type Pantalla = 'chat' | 'saldos' | 'movimientos' | 'resumen' | 'mas'
  | 'alcancias' | 'pagosfijos' | 'deudas' | 'ajustes' | 'lista' | 'catalogo' | 'cuentas' | 'guia' | 'conciliar' | 'buzon' | 'trabajadores' | 'revision';

/** Las pantallas que se abren desde «Más» y por eso llevan botón para volver. */
export const INTERNAS: Pantalla[] = ['alcancias', 'pagosfijos', 'deudas', 'ajustes', 'lista', 'catalogo', 'cuentas', 'guia', 'conciliar', 'buzon', 'trabajadores', 'revision'];

export const pantalla = signal<Pantalla>('chat');

/** Una imagen que llegó desde otra app con «Compartir» (el comprobante de Nequi, una captura): el chat la lee con la IA. */
export const imagenCompartida = signal<Blob | null>(null);
/** Lo que pidió un acceso directo del ícono («Nuevo gasto», «Dictar por voz»). Lo atiende el chat al abrir. */
export const accionInicial = signal<'gasto' | 'voz' | null>(null);
/** El movimiento cuyo detalle está abierto (el cajón que sube desde abajo). */
export const detalle = signal<string | null>(null);

/** Texto que otra pantalla deja listo en el chat («Registrar pago» desde Deudas, «Contar lo que hay» desde Saldos). */
export const chatPrellenado = signal<{ texto: string; enviar: boolean } | null>(null);

interface Estado { p: Pantalla; d: string | null }
const estadoActual = (): Estado => ({ p: pantalla.value, d: detalle.value });

/** Cambia de pantalla y deja una entrada en el historial. */
export function irA(p: Pantalla): void {
  if (p === pantalla.value && !detalle.value) return;
  pantalla.value = p;
  detalle.value = null;
  history.pushState(estadoActual(), '');
}

/** Abre el cajón de detalle de un movimiento (también una entrada del historial: «atrás» lo cierra). */
export function abrirDetalle(id: string): void {
  detalle.value = id;
  history.pushState(estadoActual(), '');
}

/** Cierra lo que esté arriba: el cajón si hay uno, o la subpantalla. Es lo mismo que el gesto «atrás». */
export function atras(): void {
  if (detalle.value || INTERNAS.includes(pantalla.value)) history.back();
}

/** Se llama una vez al arrancar: marca la entrada inicial y escucha el botón «atrás» del teléfono. */
export function iniciarHistorial(): void {
  history.replaceState(estadoActual(), '');
  window.addEventListener('popstate', e => {
    const s = e.state as Estado | null;
    pantalla.value = s?.p ?? 'chat';
    detalle.value = s?.d ?? null;
  });
}

/** Deslizar desde el borde izquierdo hacia la derecha vuelve atrás, como en una app nativa. */
export function activarGestoAtras(): void {
  let x0 = -1, y0 = 0;
  window.addEventListener('touchstart', e => { const t = e.touches[0]; x0 = t.clientX < 28 ? t.clientX : -1; y0 = t.clientY; }, { passive: true });
  window.addEventListener('touchend', e => {
    if (x0 < 0) return;
    const t = e.changedTouches[0];
    if (t.clientX - x0 > 70 && Math.abs(t.clientY - y0) < 60) atras();
    x0 = -1;
  }, { passive: true });
}

/** Deja un texto escrito en el cuadro del chat. Con `enviar`, además lo manda (queda una tarjeta por confirmar). */
export function prellenarChat(texto: string, enviar = false): void {
  chatPrellenado.value = { texto, enviar };
}

/** La pantalla de la barra de abajo que se ilumina: las internas cuentan como «Más». */
export const enBarra = (p: Pantalla): Pantalla => (INTERNAS.includes(p) ? 'mas' : p);
