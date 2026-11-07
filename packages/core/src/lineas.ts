/**
 * Un mensaje con varios movimientos. Se parte en trozos y el bot los va mostrando uno por uno,
 * cada uno con su tarjeta. Los separa un salto de línea, un punto y coma, o un + o - con espacios
 * entre dos trozos que traen cantidad ("150000 Ana + 500000 Ana - 75000 llanta").
 */

/** Máximo de movimientos por mensaje, para no volverse una cola eterna. */
export const MAX_MOVIMIENTOS_POR_MENSAJE = 10;

const tieneCantidad = (s: string): boolean => /\d/.test(s);

export function dividirLinea(texto: string): string[] {
  const filas = texto.split(/\r?\n|;/).map(x => x.trim()).filter(Boolean);
  const partes: string[] = [];
  for (const fila of filas) {
    // «pollo 8000 para luis puso 6000 nequi»: todo el gasto era de Luis y él ya mandó una parte. Son dos
    // movimientos: el gasto que pagaste por él y lo que él te pagó.
    const puso = fila.match(/^(.+?)\s+(\d[\d.]*\s?(?:k|mil)?)\s+para\s+([a-záéíóúñ]+),?\s+(?:\S+\s+)?puso\s+(\d[\d.]*\s?(?:k|mil)?)\s*(.*)$/i);
    if (puso) {
      partes.push(`${puso[1]} ${puso[2]} pagué por ${puso[3]} ${puso[2]}`);
      partes.push(`${puso[3]} me pagó ${puso[4]} ${puso[5]}`.trim());
      continue;
    }
    // un + o - con espacio a los dos lados separa; "+mesada 100k -30k" (pegado) no se parte
    const trozos: { signo: string; texto: string }[] = [];
    let signo = '';
    let desde = 0;
    for (const m of fila.matchAll(/\s([+-])\s+/g)) {
      trozos.push({ signo, texto: fila.slice(desde, m.index).trim() });
      signo = m[1];
      desde = (m.index ?? 0) + m[0].length;
    }
    trozos.push({ signo, texto: fila.slice(desde).trim() });
    if (trozos.length > 1 && trozos.every(t => t.texto && tieneCantidad(t.texto))) {
      // lo que sigue a un "+" es plata que entra: se escribe como "ingreso texto", que el bot ya entiende
      for (const t of trozos) partes.push(t.signo === '+' ? 'ingreso ' + t.texto : t.texto);
    } else {
      partes.push(fila);
    }
  }
  return partes.slice(0, MAX_MOVIMIENTOS_POR_MENSAJE);
}
