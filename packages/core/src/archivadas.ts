/**
 * Personas y categorías archivadas: se esconden de los selectores y de las listas, pero siguen existiendo
 * (sus movimientos, saldos y deudas no cambian). Se guardan como una lista de ids en la config, clave «archivadas».
 */
export function leerArchivadas(config: Record<string, string>): string[] {
  try {
    const l = JSON.parse(config.archivadas ?? '[]');
    return Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

export const estaArchivada = (config: Record<string, string>, id: string): boolean => leerArchivadas(config).includes(id);

/** La lista nueva con el id archivado (o restaurado, si `archivar` es falso). */
export function cambiarArchivada(config: Record<string, string>, id: string, archivar: boolean): string {
  const resto = leerArchivadas(config).filter(x => x !== id);
  return JSON.stringify(archivar ? [...resto, id] : resto);
}
