/**
 * Utilidades de texto: normalizar, comparar con tolerancia a errores de ortografía y dar formato.
 */

/** Minúsculas, sin tildes ni espacios repetidos: "Mamá  Luz" -> "mama luz". */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prepara un mensaje para analizarlo: normaliza y reemplaza por espacios todo lo que no
 * ayuda (emojis, signos de pregunta, comillas...). Se conservan los símbolos con significado:
 * $ . , - / # + > < y los dos puntos de una hora («12:30»); los demás dos puntos se vuelven espacio.
 */
export function limpiar(s: string): string {
  return normalizar(s)
    // «1'200.000»: el apóstrofo colombiano separa los millones. Solo cuando une una cifra con un grupo de tres y sus miles
    .replace(/(\d)['’](?=\d{3}(?:[.,]\d{3})+(?!\d))/g, '$1.')
    .replace(/(?<!\d):|:(?!\d{2}(?!\d))/g, ' ') // los dos puntos solo valen entre un número y dos cifras: «12:30»
    .replace(/[^a-z0-9$.,\-/#+><=: ]/g, ' ')
    .replace(/,(?!\d)/g, ' ') // una coma que no es decimal separa elementos de una lista
    .replace(/\.(?!\d)/g, ' ') // un punto que no es de miles/decimal es solo puntuación
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distancia de Levenshtein entre dos textos (cuántas ediciones separan uno del otro). */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = fila[j];
      fila[j] = Math.min(
        fila[j] + 1,
        fila[j - 1] + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      anterior = guardado;
    }
  }
  return fila[b.length];
}

/**
 * ¿Se parecen lo bastante para ser el mismo con un error de tipeo?
 * Palabras cortas (< 5 letras) deben ser idénticas: así "moto" no se confunde con "mono".
 */
export function esParecido(a: string, b: string): boolean {
  if (a === b) return true;
  const largo = Math.min(a.length, b.length);
  if (largo < 5) return false;
  return distancia(a, b) <= (largo >= 8 ? 2 : 1);
}

/** "juan manuel" -> "Juan Manuel". */
export function titulo(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Primera letra en mayúscula, el resto igual: "trident" -> "Trident". */
export function capitalizar(s: string): string {
  const t = s.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Texto seguro para usar en un id: "Juan Manuel" -> "juan-manuel". */
export function slug(s: string): string {
  return normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Mapa "palabra normalizada" -> "palabra como la escribiste", para devolverle a los textos
 * sus tildes y mayúsculas después de analizarlos sin ellas.
 */
export function palabrasOriginales(original: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const w of original.split(/\s+/)) {
    const limpia = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    const clave = normalizar(limpia);
    if (clave && !mapa.has(clave)) mapa.set(clave, limpia);
  }
  return mapa;
}
