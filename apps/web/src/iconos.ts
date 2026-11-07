/**
 * Íconos propios en SVG, escritos aquí mismo: pesan casi nada, se ven igual en todos los teléfonos
 * (los emojis cambian de dibujo según el aparato) y funcionan sin conexión.
 */
const TRAZOS: Record<string, string> = {
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  saldos: '<path d="M3 7h18v12H3z"/><path d="M3 7l3-3h12l3 3"/><circle cx="16.5" cy="13" r="1.4"/>',
  movs: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  resumen: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  mas: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  deudas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.8 3.4-5.5 6.5-5.5s5.7 1.7 6.5 5.5"/><path d="M17 8h5M19.5 5.5v5"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  atras: '<path d="M15 5l-7 7 7 7"/>',
  ayuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alerta: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  lapiz: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  deshacer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  luna: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  grafica: '<path d="M4 19V5M4 19h16"/><path d="M8 15l4-5 3 3 4-6"/>',
};

/** Un ícono listo para meter en HTML. */
export const icono = (nombre: string): string =>
  `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${TRAZOS[nombre] ?? TRAZOS.info}</svg>`;
