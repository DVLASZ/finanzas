/** Baja la foto a `lado` px en su lado largo y la guarda como JPEG. Para guardar un recibo bastan 1000 px (unos 100 KB). */
export async function reducirFoto(archivo: Blob, lado = 1000, calidad = 0.7): Promise<Blob> {
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  lienzo.getContext('2d')!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  return new Promise((ok, mal) => lienzo.toBlob(b => (b ? ok(b) : mal(new Error('no se pudo'))), 'image/jpeg', calidad));
}

/**
 * La foto para que la IA lea los números: más grande que la que se guarda, porque en una tirilla los dígitos son
 * chicos y a 1000 px quedan borrosos. No se guarda en ningún lado, solo viaja una vez. Si pesa más de ~450 KB se
 * baja un poco, para no pasar el límite del servidor.
 */
export async function reducirParaLectura(archivo: Blob): Promise<Blob> {
  const grande = await reducirFoto(archivo, 1800, 0.8);
  return grande.size <= 450_000 ? grande : reducirFoto(archivo, 1400, 0.7);
}

/** El contenido de un archivo como «data:image/jpeg;base64,...». Se arma por trozos para no pasarse con fotos grandes. */
export async function aDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(bin)}`;
}
