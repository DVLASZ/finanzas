/**
 * Diccionario de palabras clave -> categoría. Vive en db/diccionario.json para que lo compartan
 * el importador del Excel, el bot y la app.
 */
import datos from '../../../db/diccionario.json' with { type: 'json' };
import type { Diccionario } from './tipos.ts';

export const DICCIONARIO: Diccionario = {
  categorias: datos.categorias,
  finalidad: datos.finalidad,
  prestamos_inicio: datos.prestamos_inicio,
};
