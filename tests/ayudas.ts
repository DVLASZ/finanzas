/** Ayudas compartidas por las pruebas: un bot en memoria y un reloj fijo. */
import { MemoriaRepo, procesar, type Salida } from '../packages/core/src/index.ts';

/** Lunes 19 de octubre de 2026, 3:42 pm en Colombia (= 20:42 UTC). */
export const AHORA = new Date('2026-10-19T20:42:00Z');

export function nuevoBot(ahora: Date = AHORA) {
  const repo = new MemoriaRepo();
  return {
    repo,
    /** Escribe un mensaje y devuelve el texto de todas las respuestas. */
    async di(texto: string, reloj: Date = ahora): Promise<Salida[]> {
      return procesar(repo, { texto }, reloj);
    },
    async pulsa(boton: string, reloj: Date = ahora): Promise<Salida[]> {
      return procesar(repo, { boton }, reloj);
    },
  };
}

export const textoDe = (s: Salida[]): string => s.map(x => x.texto).join('\n');
