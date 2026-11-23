/**
 * Modo privacidad: la app arranca SIEMPRE con los montos escondidos («••••••») y el botón flotante del ojo los muestra u
 * oculta. Nada se recuerda: cada vez que la app se minimiza, se cambia de pestaña o se apaga la pantalla, los montos
 * vuelven a esconderse, para que al regresar nadie al lado vea cuánto hay.
 */
import { effect, signal } from '@preact/signals';
import { transicionCifras } from '../lib/efectos.ts';

export const montosOcultos = signal(true);
export const PUNTOS = '••••••';

// el atributo del <html> sigue a la señal, venga el cambio de donde venga (el botón, el bloqueo o el auto-ocultar)
effect(() => { document.documentElement.dataset.privado = montosOcultos.value ? '1' : '0'; });

/** Alterna el modo con el desenfoque cristalino: las cifras cambian siempre bajo el desenfoque, nunca nítidas. */
export function alternarPrivacidad(): void {
  const ocultando = !montosOcultos.value;
  transicionCifras(() => { montosOcultos.value = ocultando; }, ocultando);
}

// al minimizar, cambiar de pestaña, apagar la pantalla o perder el foco, todo vuelve a esconderse
const esconder = () => { if (!montosOcultos.value) montosOcultos.value = true; };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') esconder(); });
window.addEventListener('pagehide', esconder);
window.addEventListener('blur', esconder);

/** El texto de un monto, o los puntos si la privacidad está activa. */
export const verMonto = (texto: string): string => (montosOcultos.value ? PUNTOS : texto);

/** Un texto con montos adentro («tienes $483.000 en efectivo»): con la privacidad activa, cada monto se vuelve puntos. */
export const verTexto = (texto: string): string => (montosOcultos.value ? texto.replace(/-?\$\s?\d[\d.,]*/g, PUNTOS) : texto);

// ---------------------------------------------------------------------------------------------------------------
// Máscara global. Con la privacidad activa, todo monto («$90.000», «-$1.500», «US$45») y todo porcentaje («122 %») que
// aparezca escrito en la pantalla se cambia por puntos, sin importar de qué pantalla venga (tarjetas del chat, saldos
// secundarios, topes, gráficas...). Se hace sobre los nodos de texto ya pintados y se guarda el original para devolverlo al
// mostrar. Si Preact vuelve a escribir un nodo, se vuelve a enmascarar. Los cuadros de diálogo y los flujos de editar y
// duplicar quedan fuera: ahí la persona está confirmando una cifra a propósito.
// ---------------------------------------------------------------------------------------------------------------
const DINERO = /[-+]?(?:US)?\$\s?\d[\d.,]*|\d[\d.,]*\s?USD\b|[-+]?\d+(?:[.,]\d+)?\s?%/g;
/** Lo que se escribió tú mismo en una burbuja («almuerzo 12000», «pasaje 7k») también es una cifra. */
const ESCRITO = /\b\d{4,}\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d+\s?(?:k|mil|lucas?)\b/gi;
// [data-sin-mascara]: controles de la interfaz (escala de letra, contadores) que traen un número pero no son plata
const FUERA = '#dialogo, #editar, #duplicar, #reporte-impresion, [data-sin-mascara], script, style, textarea, input';

const guardados = new Map<Text, { real: string; mascara: string }>();

function enmascarar(n: Text): void {
  const el = n.parentElement;
  if (!el || el.closest(FUERA)) return;
  const v = n.data;
  const previo = guardados.get(n);
  if (previo && v === previo.mascara) return;
  let m = v.replace(DINERO, PUNTOS);
  // el número de un «{n} %» (el % está en el nodo de al lado) también: así se vuelve a esconder si Preact lo reescribe
  const sig = n.nextSibling;
  if (sig && sig.nodeType === Node.TEXT_NODE && /^\s*%/.test((sig as Text).data) && /^\s*[-+]?\d+(?:[.,]\d+)?\s*$/.test(v)) m = PUNTOS;
  if (el.closest('.burbuja.yo')) m = m.replace(ESCRITO, PUNTOS);
  // «{n} %» se pinta en dos nodos de texto, el número y luego « %»: si este empieza con %, el número de antes también se esconde
  if (/^\s*%/.test(v)) {
    const ant = n.previousSibling;
    if (ant && ant.nodeType === Node.TEXT_NODE && /^\s*[-+]?\d+(?:[.,]\d+)?\s*$/.test((ant as Text).data) && !guardados.has(ant as Text)) {
      guardados.set(ant as Text, { real: (ant as Text).data, mascara: PUNTOS });
      (ant as Text).data = PUNTOS;
    }
  }
  if (m === v) { guardados.delete(n); return; }
  guardados.set(n, { real: v, mascara: m });
  n.data = m;
}

function recorrer(raiz: Node): void {
  const it = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) enmascarar(n as Text);
}

function revelar(): void {
  for (const [n, g] of guardados) { if (n.isConnected && n.data === g.mascara) n.data = g.real; }
  guardados.clear();
}

/** Se llama una vez, con el elemento raíz de la app. */
export function iniciarMascara(raiz: HTMLElement): void {
  const mirar = new MutationObserver(cambios => {
    if (!montosOcultos.value) return;
    for (const c of cambios) {
      if (c.type === 'characterData') enmascarar(c.target as Text);
      else c.addedNodes.forEach(x => { if (x.nodeType === Node.TEXT_NODE) enmascarar(x as Text); else if (x.nodeType === Node.ELEMENT_NODE) recorrer(x); });
    }
  });
  mirar.observe(raiz, { childList: true, characterData: true, subtree: true });
  effect(() => { if (montosOcultos.value) recorrer(raiz); else revelar(); });
}
