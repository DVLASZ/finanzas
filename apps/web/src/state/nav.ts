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

/** La hoja de un selector abierta (también es una entrada del historial). */
export const hojaAbierta = signal(false);

/** Una ventana flotante con el detalle de un bloque informativo (las filas del Resumen, una cuenta de Saldos...). Es otra entrada del historial. */
export const infoAbierta = signal(false);

/** La hoja rápida de abono (Deudas): otra entrada del historial, por encima de las ventanas flotantes. */
export const abonoAbierto = signal(false);

interface Estado { p: Pantalla; d: string | null; s?: boolean; i?: boolean; a?: boolean }
const estadoActual = (): Estado => ({ p: pantalla.value, d: detalle.value, s: hojaAbierta.value, i: infoAbierta.value, a: abonoAbierto.value });

/** Cambia de pantalla y deja una entrada en el historial. */
export function irA(p: Pantalla): void {
  if (p === pantalla.value && !detalle.value) return;
  pantalla.value = p;
  detalle.value = null;
  infoAbierta.value = false;
  abonoAbierto.value = false;
  history.pushState(estadoActual(), '');
}

/** Abre el cajón de detalle de un movimiento (también una entrada del historial: «atrás» lo cierra). */
export function abrirDetalle(id: string): void {
  detalle.value = id;
  history.pushState(estadoActual(), '');
}

/** Abre la ventana flotante de detalle (el contenido lo pone `abrirInfo`, en HojaInfo). */
export function abrirHojaInfo(): void {
  infoAbierta.value = true;
  history.pushState(estadoActual(), '');
}

/** Abre la hoja rápida de abono (el contenido lo pone `abrirAbono`, en HojaAbono). */
export function abrirHojaAbono(): void {
  abonoAbierto.value = true;
  history.pushState(estadoActual(), '');
}

/** Abre la hoja de un selector. */
export function abrirHoja(): void {
  hojaAbierta.value = true;
  history.pushState(estadoActual(), '');
}

/** Ya se pidió retroceder y todavía no llegó el `popstate`: otro «atrás» en ese lapso se ignora. */
let retrocediendo = false;

/**
 * Cierra lo que esté arriba: la hoja, el cajón o la subpantalla. Es lo mismo que el gesto «atrás».
 * Solo retrocede una vez por cierre y solo si la entrada actual del historial es nuestra: así un doble toque o un
 * Escape repetido no sacan a la persona de la app.
 */
export function atras(): void {
  if (retrocediendo) return;
  const hayQueCerrar = hojaAbierta.value || abonoAbierto.value || infoAbierta.value || detalle.value || INTERNAS.includes(pantalla.value);
  if (!hayQueCerrar) return;
  const nuestra = Boolean((history.state as Estado | null)?.p);
  if (!nuestra) {
    // sin entrada propia a la que volver: se cierra a mano, sin tocar el historial
    // la hoja del selector va primero; luego el abono, el detalle y la ventana informativa
    if (hojaAbierta.value) { hojaAbierta.value = false; return; }
    if (abonoAbierto.value) { abonoAbierto.value = false; return; }
    // lo de más arriba se cierra primero: la hoja, luego el detalle y por último la ventana informativa
    if (detalle.value) detalle.value = null; else infoAbierta.value = false;
    return;
  }
  retrocediendo = true;
  setTimeout(() => { retrocediendo = false; }, 600); // por si el navegador nunca avisa
  history.back();
}

/** Se llama una vez al arrancar: marca la entrada inicial y escucha el botón «atrás» del teléfono. */
export function iniciarHistorial(): void {
  history.replaceState(estadoActual(), '');
  window.addEventListener('popstate', e => {
    retrocediendo = false;
    const s = e.state as Estado | null;
    pantalla.value = s?.p ?? 'chat';
    detalle.value = s?.d ?? null;
    hojaAbierta.value = Boolean(s?.s);
    infoAbierta.value = Boolean(s?.i);
    abonoAbierto.value = Boolean(s?.a);
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
