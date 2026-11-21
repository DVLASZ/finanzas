/**
 * Lo que hace falta para que un bloque sea un botón de verdad: rol, foco con Tab y Enter o Espacio. Se esparce en el elemento: `{...tocable(alTocar)}`.
 * Con `aislar`, el toque no sube al bloque de arriba (una tarjeta dentro de otra tarjeta tocable).
 */
export function tocable(alTocar: () => void, aislar = false) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: (e: MouseEvent) => { if (aislar) e.stopPropagation(); alTocar(); },
    onKeyDown: (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (aislar) e.stopPropagation(); alTocar(); } },
  };
}
