/** Fotos de recibos: cada una se guarda en el aparato y, si hay servidor, también allá. */
import { cabeceraAuth, hayRed, urlBase } from './http.ts';

const urlFoto = (id: string): string => `${urlBase()}/api/foto/${encodeURIComponent(id)}`;



export async function subirFoto(id: string, foto: Blob): Promise<boolean> {
  if (!hayRed()) return false;
  try { return (await fetch(urlFoto(id), { method: 'PUT', headers: cabeceraAuth(), body: foto })).ok; } catch { return false; }
}
export async function bajarFoto(id: string): Promise<Blob | null> {
  if (!hayRed()) return null;
  try { const r = await fetch(urlFoto(id), { headers: cabeceraAuth() }); return r.ok ? await r.blob() : null; } catch { return null; }
}
export async function borrarFotoEnServidor(id: string): Promise<void> {
  if (!hayRed()) return;
  try { await fetch(urlFoto(id), { method: 'DELETE', headers: cabeceraAuth() }); } catch { /* se quedará ahí hasta purgar */ }
}
