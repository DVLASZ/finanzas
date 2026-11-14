/** Vibración corta al confirmar algo. Solo funciona en celulares que la permiten; en los demás no hace nada. */
export const vibrar = (patron: number | number[] = 12): void => {
  try { navigator.vibrate?.(patron); } catch { /* sin vibración: no pasa nada */ }
};
