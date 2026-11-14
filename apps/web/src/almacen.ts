/**
 * Almacenamiento local del dispositivo (IndexedDB): aquí vive la copia de tus datos para que la
 * app funcione sin conexión. Si el navegador no permite IndexedDB (ventana privada, por
 * ejemplo), se usa memoria y la app sigue funcionando mientras esté abierta.
 */

const NOMBRE_BD = 'finanzas-app';
const TABLA = 'kv';
const memoria = new Map<string, unknown>();
let conexion: Promise<IDBDatabase | null> | null = null;

function abrir(): Promise<IDBDatabase | null> {
  conexion ??= new Promise(resolver => {
    try {
      const req = indexedDB.open(NOMBRE_BD, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(TABLA);
      req.onsuccess = () => resolver(req.result);
      req.onerror = () => resolver(null);
    } catch {
      resolver(null);
    }
  });
  return conexion;
}

/** Lee un valor guardado (o undefined). */
export async function leer<T>(clave: string): Promise<T | undefined> {
  const bd = await abrir();
  if (!bd) return memoria.get(clave) as T | undefined;
  return new Promise(resolver => {
    const req = bd.transaction(TABLA).objectStore(TABLA).get(clave);
    req.onsuccess = () => resolver(req.result as T | undefined);
    req.onerror = () => resolver(undefined);
  });
}

/** Guarda un valor (se copia con structuredClone: admite objetos, fechas y handles de archivos). */
export async function escribir(clave: string, valor: unknown): Promise<void> {
  const bd = await abrir();
  if (!bd) { memoria.set(clave, valor); return; }
  await new Promise<void>(resolver => {
    const tx = bd.transaction(TABLA, 'readwrite');
    tx.objectStore(TABLA).put(valor, clave);
    tx.oncomplete = () => resolver();
    tx.onerror = () => resolver();
    tx.onabort = () => resolver();
  });
}

/** Borra todo lo guardado en este dispositivo. */
export async function vaciar(): Promise<void> {
  memoria.clear();
  const bd = await abrir();
  if (!bd) return;
  await new Promise<void>(resolver => {
    const tx = bd.transaction(TABLA, 'readwrite');
    tx.objectStore(TABLA).clear();
    tx.oncomplete = () => resolver();
    tx.onerror = () => resolver();
  });
}

/** Las claves guardadas que empiezan con un prefijo (por ejemplo, «recibo:» para saber qué movimientos tienen foto). */
export async function claves(prefijo: string): Promise<string[]> {
  const bd = await abrir();
  if (!bd) return [...memoria.keys()].filter(k => k.startsWith(prefijo));
  return new Promise(resolver => {
    const req = bd.transaction(TABLA).objectStore(TABLA).getAllKeys();
    req.onsuccess = () => resolver((req.result as string[]).filter(k => typeof k === 'string' && k.startsWith(prefijo)));
    req.onerror = () => resolver([]);
  });
}
